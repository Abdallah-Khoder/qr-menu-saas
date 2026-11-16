import QRCode from 'qrcode';

/** The QR code of a link as an SVG picture (made on the server, nothing is sent anywhere). */
export function qrSvg(link: string): Promise<string> {
  return QRCode.toString(link, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
}
