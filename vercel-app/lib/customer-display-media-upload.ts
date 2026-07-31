/** 고객화면 평상시 배경 미디어 — MIME 정규화 (presign·브라우저 PUT 공통) */

export const CUSTOMER_DISPLAY_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export const CUSTOMER_DISPLAY_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const

/** 영문 고정 — 비한국어 UI에서 한글 message가 fallback으로 가려지는 것 방지 */
export const CUSTOMER_DISPLAY_MEDIA_ERR = {
  TYPE_INVALID: 'Only JPG, PNG, GIF, WebP images or MP4, WebM videos can be uploaded.',
  HEIC_UNSUPPORTED:
    'HEIC/HEIF photos are not supported. Please export or Save As JPG/PNG, then upload again.',
  IMAGE_TOO_LARGE: 'Images must be 4MB or smaller.',
  VIDEO_TOO_LARGE: 'Videos must be 50MB or smaller.',
  STORE_REQUIRED: 'Store code is required.',
  FILE_REQUIRED: 'A file is required.',
  BUCKET_MISSING:
    'Storage bucket "pos-menu-images" is missing. Create it in Supabase Dashboard > Storage.',
  VIDEO_SERVER_UNSUPPORTED: 'Videos must use direct upload. Please try again.',
  UPLOAD_FAILED: 'Media upload failed.',
} as const

const IMAGE_SET = new Set<string>(CUSTOMER_DISPLAY_IMAGE_MIME_TYPES)
const VIDEO_SET = new Set<string>(CUSTOMER_DISPLAY_VIDEO_MIME_TYPES)

const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'mif1',
  'msf1',
  'heim',
  'heis',
  'hevm',
  'hevs',
])
const AVIF_BRANDS = new Set(['avif', 'avis', 'mif1']) // mif1 also HEIF container

function readFourCc(b: Uint8Array, offset: number): string {
  if (b.length < offset + 4) return ''
  return String.fromCharCode(b[offset]!, b[offset + 1]!, b[offset + 2]!, b[offset + 3]!).toLowerCase()
}

export function normalizeCustomerDisplayMediaContentType(raw: unknown): string {
  let ct = String(raw || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (ct === 'image/jpg' || ct === 'image/pjpeg') ct = 'image/jpeg'
  if (ct === 'image/heif') ct = 'image/heic'
  if (ct === 'video/x-mp4' || ct === 'audio/mp4') ct = 'video/mp4'
  return ct
}

export function isHeicOrAvifContentType(ct: string): boolean {
  const n = normalizeCustomerDisplayMediaContentType(ct)
  return n === 'image/heic' || n === 'image/avif'
}

export function looksLikeHeicFileName(name: string): boolean {
  return /\.(heic|heif)$/i.test(String(name || ''))
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
    // ISO BMFF: ....ftyp + major brand (HEIC/AVIF를 mp4로 오인하지 않음)
    if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = readFourCc(b, 8)
      if (HEIC_BRANDS.has(brand) || brand === 'heic' || brand === 'heif') return 'image/heic'
      if (AVIF_BRANDS.has(brand) && brand !== 'mif1') return 'image/avif'
      if (brand === 'mif1' || brand === 'msf1') return 'image/heic'
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
    if (isHeicOrAvifContentType(normalized)) return normalized
  }
  const n = (file.name || '').toLowerCase()
  if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg'
  if (/\.png$/i.test(n)) return 'image/png'
  if (/\.gif$/i.test(n)) return 'image/gif'
  if (/\.webp$/i.test(n)) return 'image/webp'
  if (/\.(heic|heif)$/i.test(n)) return 'image/heic'
  if (/\.avif$/i.test(n)) return 'image/avif'
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

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name || 'media'
}

/**
 * 브라우저에서 이미지를 JPEG로 재인코딩 (HEIC·이상 MIME·GUID 파일 복구).
 * decode 불가 시 null.
 */
export async function reencodeCustomerDisplayImageAsJpeg(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null
  let bmp: ImageBitmap | undefined
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return null
  }
  try {
    const maxEdge = 1920
    const longEdge = Math.max(bmp.width, bmp.height)
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.88)
    })
    if (!blob || blob.size <= 0) return null
    const outName = `${stripExtension(file.name || 'photo')}.jpg`
    return new File([blob], outName, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    try {
      bmp.close()
    } catch {
      /* ignore */
    }
  }
}

/** Supabase signed PUT Content-Type 이 presign MIME 과 일치하도록 File 재래핑 */
export function fileForCustomerDisplayMediaUpload(
  file: File,
  preferredKind?: 'image' | 'video',
  sniffedContentType?: string
): { file: File; contentType: string } | null {
  let contentType = guessCustomerDisplayMediaContentType(file, preferredKind)
  const sniffed = normalizeCustomerDisplayMediaContentType(sniffedContentType || '')

  // HEIC/AVIF는 허용 MIME이 아님 — 호출측에서 재인코딩 유도
  if (isHeicOrAvifContentType(sniffed) || isHeicOrAvifContentType(contentType)) {
    return null
  }

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

export type PrepareCustomerDisplayMediaResult =
  | { ok: true; file: File; contentType: string }
  | { ok: false; message: string; code: 'type_invalid' | 'heic_unsupported' }

/** 매직 바이트 스니프 후 File 재래핑 (+ 이미지면 JPEG 재인코딩 폴백) */
export async function prepareCustomerDisplayMediaUpload(
  file: File,
  preferredKind?: 'image' | 'video'
): Promise<PrepareCustomerDisplayMediaResult> {
  const sniffed = await sniffCustomerDisplayMediaContentType(file)
  const wrapped = fileForCustomerDisplayMediaUpload(file, preferredKind, sniffed)
  if (wrapped) return { ok: true, file: wrapped.file, contentType: wrapped.contentType }

  const heicLike =
    isHeicOrAvifContentType(sniffed) ||
    isHeicOrAvifContentType(file.type) ||
    looksLikeHeicFileName(file.name)

  // 사진 선택 시: HEIC·이상 MIME·GUID 파일을 브라우저 디코드 → JPEG 로 복구 시도
  if (preferredKind !== 'video') {
    const reencoded = await reencodeCustomerDisplayImageAsJpeg(file)
    if (reencoded) {
      return { ok: true, file: reencoded, contentType: 'image/jpeg' }
    }
    if (heicLike) {
      return { ok: false, message: CUSTOMER_DISPLAY_MEDIA_ERR.HEIC_UNSUPPORTED, code: 'heic_unsupported' }
    }
  }

  return { ok: false, message: CUSTOMER_DISPLAY_MEDIA_ERR.TYPE_INVALID, code: 'type_invalid' }
}

export function isCustomerDisplayImageContentType(ct: string): boolean {
  return IMAGE_SET.has(normalizeCustomerDisplayMediaContentType(ct))
}

export function isCustomerDisplayVideoContentType(ct: string): boolean {
  return VIDEO_SET.has(normalizeCustomerDisplayMediaContentType(ct))
}
