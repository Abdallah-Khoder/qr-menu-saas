// What kind of image are these bytes? Decided from the FIRST BYTES of the file, never from the name or the
// type the browser claims (both can be faked). Only JPEG, PNG and WebP are accepted: no SVG (it can contain
// scripts) and no other formats.

export type ImageType = 'jpeg' | 'png' | 'webp';

/** The browser shrinks every photo before sending it (about 50 KB); this is the most the server accepts. */
export const MAX_IMAGE_BYTES = 500 * 1024;

export const IMAGE_MIME: Record<ImageType, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const IMAGE_EXT: Record<ImageType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

const startsWith = (b: Uint8Array, bytes: number[], at = 0) => bytes.every((v, i) => b[at + i] === v);

export function detectImageType(b: Uint8Array): ImageType | null {
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (b.length >= 12 && startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

/** The header our own page always sends with a photo. A web page of another site cannot add it without our permission. */
export const UPLOAD_HEADER = 'x-menu-upload';
