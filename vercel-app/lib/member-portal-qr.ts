import QRCode from 'qrcode'

/** POS·USB 스캐너 호환 — 회원번호 그대로 인코딩 */
export function buildMemberPortalQrPayload(memberNo: string): string {
  return String(memberNo ?? '').trim()
}

export type MemberPortalQrOptions = {
  width?: number
  dark?: string
  light?: string
}

export async function buildMemberPortalQrDataUrl(
  memberNo: string,
  options: MemberPortalQrOptions = {}
): Promise<string> {
  const payload = buildMemberPortalQrPayload(memberNo)
  if (!payload) return ''

  const width = options.width ?? 400
  return QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: options.dark ?? '#1a1208',
      light: options.light ?? '#fff9f0',
    },
  })
}
