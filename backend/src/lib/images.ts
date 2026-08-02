import crypto from 'node:crypto';
import FileType from 'file-type';
import sharp from 'sharp';
import { badRequest, payloadTooLarge } from './errors';

export interface ProcessedImage {
  buffer: Buffer;
  mime: string;
  extension: string;
  bytes: number;
  width: number;
  height: number;
  sha256: string;
}

const MAX_DIMENSION = 3000;
const MAX_PIXELS = 40_000_000; // guards against decompression bombs

/**
 * Validation is layered because file extensions and Content-Type headers are
 * attacker controlled:
 *   1. declared size and type
 *   2. magic bytes sniffed from the buffer itself
 *   3. re-encode through sharp, which discards EXIF/GPS and any appended
 *      payload, so what gets stored is a freshly generated image
 */
export async function processUpload(
  input: Buffer,
  allowedMimes: readonly string[],
  maxBytes: number,
): Promise<ProcessedImage> {
  if (input.length === 0) throw badRequest('The uploaded file is empty.');
  if (input.length > maxBytes) {
    throw payloadTooLarge(`Image must be ${Math.floor(maxBytes / (1024 * 1024))}MB or smaller.`);
  }

  const sniffed = await FileType.fromBuffer(input);
  if (!sniffed || !allowedMimes.includes(sniffed.mime)) {
    throw badRequest(
      `That file is not a supported image. Allowed types: ${allowedMimes
        .map((m) => m.replace('image/', '').toUpperCase())
        .join(', ')}.`,
    );
  }

  let pipeline: sharp.Sharp;
  let metadata: sharp.Metadata;
  try {
    pipeline = sharp(input, { failOn: 'error', limitInputPixels: MAX_PIXELS });
    metadata = await pipeline.metadata();
  } catch {
    throw badRequest('That image could not be read. Try saving it again and re-uploading.');
  }

  if (!metadata.width || !metadata.height) {
    throw badRequest('That image could not be read. Try saving it again and re-uploading.');
  }

  const isPng = sniffed.mime === 'image/png';
  const output = await pipeline
    .rotate() // apply EXIF orientation before the metadata is stripped
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(isPng ? 'png' : 'jpeg', isPng ? { compressionLevel: 9 } : { quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    mime: isPng ? 'image/png' : 'image/jpeg',
    extension: isPng ? 'png' : 'jpg',
    bytes: output.data.length,
    width: output.info.width,
    height: output.info.height,
    sha256: crypto.createHash('sha256').update(output.data).digest('hex'),
  };
}
