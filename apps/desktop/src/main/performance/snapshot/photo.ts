// The snapshot's header photo: a JPEG or PNG the DSP picks once (Reports tab). It is read from
// disk each time the snapshot is drawn and put into the page as a data URL, with its size in
// pixels so the top band can be shown at its true shape. Nothing about the file is logged but a
// reason code.

import { readFileSync, statSync } from 'node:fs';
import type { SnapshotPhoto } from './html';

/** Bigger files are refused: a photo this size would make every email huge. */
export const PHOTO_MAX_BYTES = 6 * 1024 * 1024;

export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png'];

export type PhotoProblem = 'missing' | 'too-big' | 'not-an-image';

/** The pixel size and type of a JPEG or PNG, read from its header. Null for anything else. */
export function imageSize(
  bytes: Uint8Array,
): { width: number; height: number; type: 'jpeg' | 'png' } | null {
  // PNG: an 8-byte signature, then the IHDR chunk with width and height as big-endian 32-bit.
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[12] === 0x49 &&
    bytes[13] === 0x48 &&
    bytes[14] === 0x44 &&
    bytes[15] === 0x52
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return width > 0 && height > 0 ? { width, height, type: 'png' } : null;
  }
  // JPEG: FF D8, then segments; the first SOFn segment holds height then width.
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1] as number;
      if (
        marker === 0xd8 ||
        (marker >= 0xd0 && marker <= 0xd7) ||
        marker === 0x01 ||
        marker === 0xff
      ) {
        at += marker === 0xff ? 1 : 2;
        continue;
      }
      const length = view.getUint16(at + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = view.getUint16(at + 5);
        const width = view.getUint16(at + 7);
        return width > 0 && height > 0 ? { width, height, type: 'jpeg' } : null;
      }
      if (marker === 0xd9 || marker === 0xda) return null;
      at += 2 + length;
    }
  }
  return null;
}

/** A photo from its bytes: the data URL and its size. Null when it is not a JPEG or PNG. */
export function photoFromBytes(bytes: Uint8Array): SnapshotPhoto | null {
  const size = imageSize(bytes);
  if (!size) return null;
  const mime = size.type === 'png' ? 'image/png' : 'image/jpeg';
  return {
    dataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
    width: size.width,
    height: size.height,
  };
}

/** Reads the chosen photo. The problem code says why it could not be used. */
export function readSnapshotPhoto(
  file: string,
): { photo: SnapshotPhoto; problem: null } | { photo: null; problem: PhotoProblem } {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return { photo: null, problem: 'missing' };
  }
  if (size > PHOTO_MAX_BYTES) return { photo: null, problem: 'too-big' };
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    return { photo: null, problem: 'missing' };
  }
  const photo = photoFromBytes(bytes);
  return photo ? { photo, problem: null } : { photo: null, problem: 'not-an-image' };
}
