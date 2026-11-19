// Runs in the BROWSER. A phone photo is 3-8 MB; the menu needs a small picture. We shrink it before sending:
// faster upload for the owner, faster page for the customer, and far less storage used.

export const PHOTO_MAX_SIDE = 640; // pixels, the longer side
const QUALITY = 0.8;

export type Compressed = { blob: Blob; name: string };

/** Shrinks a picture file. Returns null when the browser cannot read it as a picture. */
export async function compressImage(file: File): Promise<Compressed | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // keeps a phone photo upright
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; // a transparent PNG would turn black as a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
    const webp = await toBlob('image/webp');
    if (webp && webp.type === 'image/webp') return { blob: webp, name: 'photo.webp' }; // older browsers silently give PNG
    const jpeg = await toBlob('image/jpeg');
    return jpeg ? { blob: jpeg, name: 'photo.jpg' } : null;
  } finally {
    bitmap.close();
  }
}
