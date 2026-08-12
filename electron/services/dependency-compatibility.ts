export function videoHelperBatchCompatible(
  utilsSource: string,
  nodesSource: string,
  loadVideoSource: string
): boolean {
  return (
    utilsSource.includes("if len(value) == 6") &&
    utilsSource.includes("sensitive = value[5]") &&
    nodesSource.includes("frames_per_batch = int(frames_per_batch)") &&
    nodesSource.includes("batch_manager_states = {}") &&
    nodesSource.includes("batch_manager_states[unique_id] = self") &&
    nodesSource.includes("self = batch_manager_states[unique_id]") &&
    nodesSource.includes("batch_manager_states.pop(self.unique_id, None)") &&
    nodesSource.includes("previous = batch_manager_states.pop(unique_id, None)") &&
    loadVideoSource.includes(
      "meta_batch.frames_per_batch = int(meta_batch.frames_per_batch)"
    ) &&
    loadVideoSource.includes(
      "itertools.islice(gen, int(meta_batch.frames_per_batch))"
    )
  );
}

export function ltxAudioVaeCompatible(source: string): boolean {
  return !source.includes("AudioVAE(sd, metadata)");
}
