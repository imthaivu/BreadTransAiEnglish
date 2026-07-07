type LamejsModule = typeof import("@breezystack/lamejs");

let lamejsPromise: Promise<LamejsModule> | null = null;

function loadLamejs(): Promise<LamejsModule> {
  if (!lamejsPromise) {
    lamejsPromise = import("@breezystack/lamejs");
  }
  return lamejsPromise;
}

export function parseSampleRateFromMime(mime: string | null | undefined): number {
  const m = /rate=(\d+)/.exec(mime || "");
  return m ? parseInt(m[1], 10) : 24000;
}

/** PCM 16-bit mono -> MP3 buffer chunks merged into one Buffer. */
export async function pcmToMp3Buffer(pcmBytes: Buffer, sampleRate: number): Promise<Buffer> {
  const lamejs = await loadLamejs();
  const samples = new Int16Array(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    Math.floor(pcmBytes.byteLength / 2)
  );
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const blockSize = 1152;
  const chunks: Buffer[] = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk = samples.subarray(i, i + blockSize);
    const mp3buf = encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) chunks.push(Buffer.from(mp3buf));
  }
  const end = encoder.flush();
  if (end.length > 0) chunks.push(Buffer.from(end));
  return Buffer.concat(chunks);
}
