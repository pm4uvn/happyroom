/** QR code generation (lazy-loaded so the library is only fetched when a QR is shown). */
export async function toQrDataUrl(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 272,
    color: { dark: "#182238", light: "#FFFFFF" },
  });
}
