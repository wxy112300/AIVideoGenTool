import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { connectApp, parseAppHarnessArgs, pollUntil, taskEvidence } from '../app-harness.mjs';
import { fixtureUi } from './fixture-ui.mjs';
import { normalizeH3MemoryOptions } from '../../dist/electron/src/core/h3-memory-policy.js';

const args=process.argv.slice(2);
if(args.includes('--help')){console.log('managed-history-audit.mjs <evidence-directory> --port <port> --task <id> [--output report.json]\nRead-only state/file audit and actual History playback. Requires app-before.json, enqueued-state.json and backup-manifest.json from a backed-up, explicitly authorized real History trial. Does not enqueue, generate, delete or alter accepted chunks. Reuse after restart.');process.exit(0);}
const directory=path.resolve(args.shift()||''),options=parseAppHarnessArgs(['wait-task',...args]);
const report={ok:false,evidence:'real-managed-history-and-owner-audit',inferenceVerified:false,focusEmulation:true};
const sha=async filename=>crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex');
const outputPath=(root,file)=>{const absolute=path.resolve(root,file.subfolder||'',file.filename),relative=path.relative(root,absolute);assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative),'Owned output path');if(file.absolutePath)assert.equal(path.resolve(file.absolutePath).toLowerCase(),absolute.toLowerCase());return absolute;};
let client;
try{
 const baseline=JSON.parse(await fs.readFile(path.join(directory,'app-before.json'),'utf8'));
 const enqueued=JSON.parse(await fs.readFile(path.join(directory,'enqueued-state.json'),'utf8'));
 const backup=JSON.parse(await fs.readFile(path.join(directory,'backup-manifest.json'),'utf8'));
 const sourceTask=enqueued.queue.find(t=>t.id===options.task);assert.ok(sourceTask);assert.equal(sourceTask.h3ContinuumMode,'managed');
 const previous=sourceTask.h3ContinuumSequence;assert.ok(previous.acceptedChunks>0);assert.equal(sourceTask.h3ContinuumTargetChunks,previous.acceptedChunks+1);
 client=await connectApp(options);await client.send('Emulation.setFocusEmulationEnabled',{enabled:true});
 const state=await client.evaluate('window.studio.getState()');const evidence=taskEvidence(state,options.task);assert.equal(evidence.status,'completed');assert.equal(evidence.outputs.length,1);
 const {assetId,versionId}=evidence.outputs[0],asset=state.history.find(a=>a.id===assetId),version=asset.versions.find(v=>v.id===versionId),next=version.h3ContinuumSequence,receipt=version.h3ContinuumReceipt;
 assert.ok(next&&receipt);assert.equal(receipt.freshFallback,false);assert.equal(receipt.reusedCount,previous.acceptedChunks);assert.equal(receipt.generatedCount,1);assert.equal(receipt.requestedChunks,previous.acceptedChunks+1);assert.equal(next.acceptedChunks,previous.acceptedChunks+1);assert.equal(next.targetChunks,previous.targetChunks+1);
 assert.deepEqual(next.chunks.slice(0,previous.chunks.length),previous.chunks,'Accepted prefix changed');
 assert.equal(next.runName,previous.runName);assert.equal(next.baseSeed,previous.baseSeed);assert.deepEqual(next.firstFrameSource,previous.firstFrameSource);
 // Store recovery supplies retired H3 memory fields; preserve every other field.
 for(const old of baseline.history){const expected=structuredClone(old);Object.assign(expected,normalizeH3MemoryOptions(expected,'off'));for(const v of expected.versions)Object.assign(v,normalizeH3MemoryOptions(v,'off'));const actual=structuredClone(state.history.find(a=>a.id===old.id));Object.assign(actual,normalizeH3MemoryOptions(actual,'off'));for(const v of actual.versions)Object.assign(v,normalizeH3MemoryOptions(v,'off'));assert.deepEqual(actual,expected,'Existing History changed');}assert.deepEqual(state.imageHistory,baseline.imageHistory,'Image History changed');
 const outputRoot=path.dirname(path.dirname(path.dirname(backup.run)));
 const project=JSON.parse(await fs.readFile(path.join(backup.run,'project.json'),'utf8'));assert.equal(project.canonical_storage_revision_id,next.canonicalHead.revisionId);
 let protectedRunFiles=0;for(const record of backup.records){if(record.relative==='project.json')continue;assert.equal(await sha(record.path),record.sha256,'Existing Run file changed');protectedRunFiles++;}
 for(const record of backup.registry)assert.equal(await sha(record.path),record.sha256,'Existing registry changed');
 const registeredAsset=async assetId=>JSON.parse(await fs.readFile(path.join(outputRoot,'h3-continuum-assets',assetId+'.json'),'utf8'));
 const ownerIds=new Set(next.chunks.map(chunk=>chunk.assetId));
 for(const record of receipt.chunkRecords){
   const assetId='h3av_'+await sha(outputPath(outputRoot,record.payloadPath));ownerIds.add(assetId);
   if(record.logicalChunkIndex<=previous.acceptedChunks){
     const old=await registeredAsset(previous.chunks[record.logicalChunkIndex-1].assetId),reused=await registeredAsset(assetId);
     assert.equal(reused.videoTensorSha256,old.videoTensorSha256,'Reused video tensor changed');
     assert.equal(reused.audioTensorSha256,old.audioTensorSha256,'Reused audio tensor changed');
   }
 }
 const owners=[];for(const assetId of ownerIds){const manifestPath=path.join(outputRoot,'h3-continuum-assets',assetId+'.json'),registered=await registeredAsset(assetId);assert.equal(registered.storageKind,'continuum-run-chunk');assert.equal(registered.continuumChunk.runName,next.runName);const owner=outputPath(outputRoot,registered.ownerPath);assert.equal(await sha(owner),registered.payloadSha256);const aliases=[];for(const alias of registered.aliasPaths||[]){const filename=outputPath(outputRoot,alias);assert.equal(await sha(filename),registered.payloadSha256);aliases.push(filename);}assert.ok(aliases.length>0);owners.push({assetId,owner,aliases,registry:manifestPath,aliasMode:registered.aliasMode});}
 const ui=fixtureUi(client,options.timeout,report);await ui.openHistory(assetId);await pollUntil(()=>client.evaluate(`document.querySelector('.history-player video')?.dataset.historyVersion===${JSON.stringify(versionId)}`),Boolean,options.timeout,'Matching managed History version');
 if(!await client.evaluate("document.querySelector('.history-player video').paused"))await ui.click('media-play-button[role=button]');
 const frames=await client.evaluate("document.querySelector('.history-player video').getVideoPlaybackQuality().totalVideoFrames");await ui.click('media-play-button[role=button]');
 const playback=await pollUntil(()=>client.evaluate(`(()=>{const v=document.querySelector('.history-player video');return {time:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,frames:v.getVideoPlaybackQuality().totalVideoFrames,error:v.error?.message}})()`),v=>!v.error&&!v.paused&&v.frames>frames,options.timeout,'Managed decoded frames advance');await ui.click('media-play-button[role=button]');assert.equal(version.width,playback.width);assert.equal(version.height,playback.height);assert.ok(Math.abs(version.duration-playback.duration)<=1/version.fps);
 const ownerDelete=await client.evaluate(`!!document.querySelector('[data-delete-joint-av="${assetId}"][data-joint-av-version-id="${versionId}"]')`);assert.equal(ownerDelete,false,'Managed owner must have no single-version AV delete action');
 await ui.click('.history-detail-back-button');await pollUntil(()=>client.evaluate(`!!document.querySelector('[data-open-history="${assetId}"]')`),Boolean,options.timeout,'Return to matching managed card');
 Object.assign(report,{ok:true,inferenceVerified:true,taskId:options.task,assetId,versionId,receipt:{revisionId:receipt.revisionId,reusedCount:receipt.reusedCount,generatedCount:receipt.generatedCount,freshFallback:receipt.freshFallback,requestedChunks:receipt.requestedChunks},playback,playbackVerified:true,returnReachable:true,singleVersionOwnerDeleteAbsent:true,protectedRunFiles,protectedRegistryFiles:backup.registry.length,owners});
 await fs.writeFile(path.join(directory,'audited-state.json'),JSON.stringify(state,null,2));
}catch(error){report.error=error.stack;process.exitCode=1;}finally{client?.close();}
if(options.output)await fs.writeFile(options.output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,owners:report.owners?.length},null,2));
