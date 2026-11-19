import type { CurrentUser } from './current-user';
import type { Db } from './db';
import { saveImage } from './image-storage';
import { detectImageType, MAX_IMAGE_BYTES, UPLOAD_HEADER } from './image-type';
import { getOwnerRestaurant, SUSPENDED_MESSAGE } from './owner-menu';
import { reserveAttempt } from './rate-limit';

export type UploadResponse = { status: number; body: { error?: string; url?: string } };
const err = (status: number, error: string): UploadResponse => ({ status, body: { error } });

/** Photos an owner may upload in 15 minutes (a new menu of 100 dishes fits; a script flooding the storage does not). */
export const UPLOAD_LIMIT = { max: 60, minutes: 15 };
// The multipart envelope adds a little to the file itself.
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 16 * 1024;

/**
 * "Here is a photo for my menu". Order of the checks (cheapest and most basic first):
 * who are you (401) → are you an owner (403) → is it from our own page (400) → is it small (413) →
 * is the restaurant active (403) → limit (429) → is it really an image (400) → save.
 * The restaurant is found from the logged-in owner, never from the request.
 */
export async function handleImageUpload(request: Request, user: CurrentUser | null, db: Db): Promise<UploadResponse> {
  if (!user) return err(401, 'يجب تسجيل الدخول');
  if (user.role !== 'owner') return err(403, 'غير مصرّح لك بهذا الإجراء');
  if (request.headers.get(UPLOAD_HEADER) !== '1') return err(400, 'طلب غير صالح');
  const length = Number(request.headers.get('content-length'));
  if (!Number.isFinite(length) || length <= 0) return err(400, 'طلب غير صالح');
  if (length > MAX_BODY_BYTES) return err(413, 'حجم الصورة كبير جدًا');

  const restaurant = await getOwnerRestaurant(db, user.id);
  if (!restaurant) return err(404, 'المطعم غير موجود');
  if (restaurant.status !== 'active') return err(403, SUSPENDED_MESSAGE);

  const slot = await reserveAttempt(db, [`upload:${user.id}`], UPLOAD_LIMIT);
  if (!slot.allowed) return err(429, 'رفعت عددًا كبيرًا من الصور خلال وقت قصير. يُرجى المحاولة بعد قليل.');

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return err(400, 'طلب غير صالح');
  }
  if (!(file instanceof File)) return err(400, 'لم يتم اختيار صورة');
  if (file.size > MAX_IMAGE_BYTES) return err(413, 'حجم الصورة كبير جدًا');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return err(400, 'الملف ليس صورة مقبولة. استخدم صورة بصيغة JPG أو PNG أو WebP.');

  try {
    return { status: 200, body: { url: await saveImage(restaurant.id, bytes, type) } };
  } catch (e) {
    console.error('image upload failed:', e instanceof Error ? e.message : e);
    return err(502, 'تعذّر رفع الصورة الآن. يُرجى المحاولة مرة أخرى.');
  }
}
