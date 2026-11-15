/**
 * True only when the request's media type is exactly application/json.
 *
 * Comparing just the media type (the part before ";") matters: a header like
 * "text/plain; note=application/json" CONTAINS the words but is really text/plain, a type that
 * another website can send without the browser asking the server first.
 */
export function isJsonRequest(request: Request): boolean {
  const mediaType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  return mediaType === 'application/json';
}
