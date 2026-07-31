/** 고객화면 평상시 배경 미디어 — MIME 정규화 (presign·브라우저 PUT 공통) */

export const CUSTOMER_DISPLAY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export const CUSTOMER_DISPLAY_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const

const IMAGE_SET = new Set<string>(CUSTOMER_DISPLAY_IMAGE_MIME_TYPES)
const VIDEO_SET = new Set<string>(CUSTOMER_DISPLAY_VIDEO_MIME_TYPES)

export function normalizeCustomerDisplayMediaContentType(raw: unknown): string {
  let ct = String(raw || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (ct === 'image/jpg' || ct === 'image/pjpeg') ct = 'image/jpeg'
  if (ct === 'video/x-mp4' || ct === 'audio/mp4') ct = 'video/mp4'
  return ct
}

/** 파일 선두 바이트로 MIME 추정 (확장자·type 비어 있는 Windows GUID 파일 대응) */
export async function sniffCustomerDisplayMediaContentType(file: Blob): Promise<string> {
  try {
    const buf = await file.slice(0, 16).arrayBuffer()
    const b = new Uint8Array(buf)
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return 'image/png'
    }
    if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
    if (
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    ) {
      return 'image/webp'
    }
    // ISO BMFF (mp4/mov): ....ftyp
    if (b.length >= 8 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      return 'video/mp4'
    }
    // WebM / Matroska: 1A 45 DF A3
    if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
      return 'video/webm'
    }
  } catch {
    /* ignore */
  }
  return ''
}

/** 브라우저 file.type 이 비어 있거나 octet-stream / image/jpg 인 경우 확장자로 보정 */
export function guessCustomerDisplayMediaContentType(
  file: File,
  preferredKind?: 'image' | 'video'
): string {
  const normalized = normalizeCustomerDisplayMediaContentType(file.type)
  if (normalized && normalized !== 'application/octet-stream') {
    if (IMAGE_SET.has(normalized) || VIDEO_SET.has(normalized)) return normalized
  }
  const n = (file.name || '').toLowerCase()
  if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg'
  if (/\.png$/i.test(n)) return 'image/png'
  if (/\.gif$/i.test(n)) return 'image/gif'
  if (/\.webp$/i.test(n)) return 'image/webp'
  if (/\.mp4$/i.test(n)) return 'video/mp4'
  if (/\.webm$/i.test(n)) return 'video/webm'
  // Windows Photos 등 GUID 파일명·확장자 숨김에서 type만 있는 경우
  if (IMAGE_SET.has(normalized)) return normalized
  if (VIDEO_SET.has(normalized)) return normalized
  // type·확장자 모두 없을 때 UI에서 고른 종류로 기본값
  if (preferredKind === 'video') return 'video/mp4'
  if (preferredKind === 'image') return 'image/jpeg'
  return ''
}

/** Facebook CDN 등 만료·핫링크 차단되는 URL — 고객화면용으로 부적합 */
export function isUnstableCustomerDisplayMediaUrl(url: string): boolean {
  const u = String(url || '').trim().toLowerCase()
  if (!u) return false
  return (
    /fbcdn\.net|scontent[^.]*\.fna\.fbcdn|facebook\.com\/.*\/t\d+|lookaside\.fbsbx/i.test(u) ||
    /\.fna\.fbcdn\.net/i.test(u)
  )
}

function ensureFileNameExtension(fileName: string, contentType: string): string {
  const base = String(fileName || '').trim() || 'media'
  if (/\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(base)) return base
  const ext =
    contentType === 'image/png'
      ? '.png'
      : contentType === 'image/gif'
        ? '.gif'
        : contentType === 'image/webp'
          ? '.webp'
          : contentType === 'video/mp4'
            ? '.mp4'
            : contentType === 'video/webm'
              ? '.webm'
              : contentType.startsWith('image/')
                ? '.jpg'
                : contentType.startsWith('video/')
                  ? '.mp4'
                  : ''
  return ext ? `${base}${ext}` : base
}

/** Supabase signed PUT Content-Type 이 presign MIME 과 일치하도록 File 재래핑 */
export function fileForCustomerDisplayMediaUpload(
  file: File,
  preferredKind?: 'image' | 'video',
  sniffedContentType?: string
): { file: File; contentType: string } | null {
  let contentType = guessCustomerDisplayMediaContentType(file, preferredKind)
  const sniffed = normalizeCustomerDisplayMediaContentType(sniffedContentType || '')
  if (sniffed && (IMAGE_SET.has(sniffed) || VIDEO_SET.has(sniffed))) {
    // UI에서 고른 종류와 실제 바이트가 다르면 잘못된 MIME으로 올리지 않음
    if (preferredKind === 'image' && !IMAGE_SET.has(sniffed)) return null
    if (preferredKind === 'video' && !VIDEO_SET.has(sniffed)) return null
    const normalized = normalizeCustomerDisplayMediaContentType(file.type)
    const hasExt = /\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(file.name || '')
    if (
      !normalized ||
      normalized === 'application/octet-stream' ||
      !hasExt ||
      preferredKind != null
    ) {
      contentType = sniffed
    }
  }
  if (!contentType || (!IMAGE_SET.has(contentType) && !VIDEO_SET.has(contentType))) {
    return null
  }
  if (preferredKind === 'image' && !IMAGE_SET.has(contentType)) return null
  if (preferredKind === 'video' && !VIDEO_SET.has(contentType)) return null
  const name = ensureFileNameExtension(file.name || 'media', contentType)
  if (file.type === contentType && file.name === name) {
    return { file, contentType }
  }
  return {
    file: new File([file], name, { type: contentType, lastModified: file.lastModified }),
    contentType,
  }
}

/** 매직 바이트 스니프 후 File 재래핑 */
export async function prepareCustomerDisplayMediaUpload(
  file: File,
  preferredKind?: 'image' | 'video'
): Promise<{ file: File; contentType: string } | null> {
  const sniffed = await sniffCustomerDisplayMediaContentType(file)
  return fileForCustomerDisplayMediaUpload(file, preferredKind, sniffed)
}

export function isCustomerDisplayImageContentType(ct: string): boolean {
  return IMAGE_SET.has(normalizeCustomerDisplayMediaContentType(ct))
}

export function isCustomerDisplayVideoContentType(ct: string): boolean {
  return VIDEO_SET.has(normalizeCustomerDisplayMediaContentType(ct))
}
