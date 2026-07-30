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
  preferredKind?: 'image' | 'video'
): { file: File; contentType: string } | null {
  const contentType = guessCustomerDisplayMediaContentType(file, preferredKind)
  if (!contentType || (!IMAGE_SET.has(contentType) && !VIDEO_SET.has(contentType))) {
    return null
  }
  const name = ensureFileNameExtension(file.name || 'media', contentType)
  if (file.type === contentType && file.name === name) {
    return { file, contentType }
  }
  return {
    file: new File([file], name, { type: contentType, lastModified: file.lastModified }),
    contentType,
  }
}

export function isCustomerDisplayImageContentType(ct: string): boolean {
  return IMAGE_SET.has(normalizeCustomerDisplayMediaContentType(ct))
}

export function isCustomerDisplayVideoContentType(ct: string): boolean {
  return VIDEO_SET.has(normalizeCustomerDisplayMediaContentType(ct))
}
