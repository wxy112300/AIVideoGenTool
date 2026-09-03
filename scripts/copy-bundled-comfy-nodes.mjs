import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = process.argv[2]
	? path.resolve(process.argv[2])
	: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repositoryRoot, "dist", "electron");

for (const directory of ["comfy_nodes", "workflows"]) {
	const source = path.join(repositoryRoot, directory);
	const destination = path.join(outputRoot, directory);
	await rm(destination, { recursive: true, force: true });
	await mkdir(path.dirname(destination), { recursive: true });
	await cp(source, destination, { recursive: true });
}
