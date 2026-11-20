import { compressImage } from './compress-image';
import { UPLOAD_HEADER } from './image-type';

/** Shrinks the chosen picture and uploads it. Returns the saved link, or an Arabic error message. */
export async function uploadPhoto(file: File): Promise<{ url: string } | { error: string }> {
  const small = await compressImage(file);
  if (!small) return { error: 'تعذّر قراءة الصورة. اختر صورة بصيغة JPG أو PNG أو WebP.' };
  const form = new FormData();
  form.append('file', small.blob, small.name);
  try {
    const res = await fetch('/api/owner/upload', { method: 'POST', headers: { [UPLOAD_HEADER]: '1' }, body: form });
    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.url === 'string') return { url: data.url };
    return { error: data.error ?? 'حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.' };
  } catch {
    return { error: 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.' };
  }
}
