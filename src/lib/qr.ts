import QRCode from 'qrcode';

/** The QR code of a link as an SVG picture (made on the server, nothing is sent anywhere). */
export function qrSvg(link: string): Promise<string> {
  // margin 4 = the 4 empty squares on every side that QR readers need
  return QRCode.toString(link, { type: 'svg', margin: 4, errorCorrectionLevel: 'M' });
}
