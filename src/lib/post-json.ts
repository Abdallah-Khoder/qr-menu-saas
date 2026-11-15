/** Sends a JSON POST (the server refuses anything else). Returns an error message, or null on success. */
export async function postJson(url: string, body: unknown = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error ?? 'حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.';
  } catch {
    return 'تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.';
  }
}
