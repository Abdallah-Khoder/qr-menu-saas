// The owner opens his own menu from the dashboard with "?preview=1" on the link. Only then does the menu show a bar
// that leads back to the dashboard. A customer's link (QR code, WhatsApp) never has it. The browser reads the address by
// itself, so the server does not look at it and the cached menu stays the same for everybody.
export const PREVIEW_PARAM = 'preview';

/** The path of the restaurant's public menu, opened as a preview by its owner. */
export const previewMenuPath = (slug: string) => `/m/${slug}?${PREVIEW_PARAM}=1`;

/** Does this address ("?preview=1", as `location.search` gives it) ask for the owner's preview bar? */
export const isPreviewSearch = (search: string) => new URLSearchParams(search).get(PREVIEW_PARAM) === '1';
