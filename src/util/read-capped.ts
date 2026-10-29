/** Collects a download stream, giving up (and closing it) once it exceeds the size cap. */
export async function readCapped(stream: AsyncIterable<Uint8Array> & { destroy?: () => void }, max: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > max) {
      stream.destroy?.();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
