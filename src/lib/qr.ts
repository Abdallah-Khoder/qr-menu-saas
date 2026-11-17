import QRCode from 'qrcode';

// margin 4 = the 4 empty squares on every side that QR readers need
const OPTIONS = { margin: 4, errorCorrectionLevel: 'M' } as const;

/** The QR code of a link as an SVG picture (made on the server, nothing is sent anywhere). */
export function qrSvg(link: string): Promise<string> {
  return QRCode.toString(link, { type: 'svg', ...OPTIONS });
}

/** The same code as a PNG picture (black on white), large enough to print sharply. */
export function qrPng(link: string): Promise<Buffer> {
  return QRCode.toBuffer(link, { type: 'png', width: 1200, ...OPTIONS });
}
