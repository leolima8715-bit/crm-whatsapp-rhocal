/* eslint-disable @typescript-eslint/no-explicit-any */
// Extrai o QR (base64) e o código de pareamento das respostas da Evolution.
export function extractQr(data: any): { qr: string | null; pairingCode: string | null } {
  const qr = data?.qrcode?.base64 ?? data?.base64 ?? null;
  const pairingCode = data?.qrcode?.pairingCode ?? data?.pairingCode ?? null;
  return { qr, pairingCode };
}
