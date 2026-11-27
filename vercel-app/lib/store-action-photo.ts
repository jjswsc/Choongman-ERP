/** 현장 사진 — Cached Egress·업로드 용량 절감 (긴 변·목표 바이트) */
export const STORE_ACTION_PHOTO_MAX_EDGE_PX = 1280
export const STORE_ACTION_PHOTO_TARGET_MAX_BYTES = 450 * 1024

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name || 'photo'
}

/**
 * 개선과제·방문 사진 업로드 전 축소·JPEG 재인코딩.
 * 실패 시 원본 파일을 그대로 반환(호출측 5MB 한도).
 * iOS 카메라·앨범은 type이 비어 있거나 HEIC인 경우가 많아 decode를 먼저 시도한다.
 */
export async function prepareStoreActionPhotoForUpload(file: File): Promise<File> {
  if (typeof window === 'undefined') return file
  const mime = String(file.type || '').toLowerCase()
  const nameLooksImage = /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || '')
  if (mime && !mime.startsWith('image/') && !nameLooksImage) return file

  let bmp: ImageBitmap | undefined
  try {
    bmp = await createImageBitmap(file)
  } catch {
    // HEIC 등 decode 실패 → 원본 유지(호출측 5MB·MIME 검사)
    return file
  }

  try {
    const longEdge = Math.max(bmp.width, bmp.height)
    const needsResize = longEdge > STORE_ACTION_PHOTO_MAX_EDGE_PX
    const needsShrink = file.size > STORE_ACTION_PHOTO_TARGET_MAX_BYTES
    if (!needsResize && !needsShrink) return file

    const scale = needsResize ? Math.min(1, STORE_ACTION_PHOTO_MAX_EDGE_PX / longEdge) : 1
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bmp, 0, 0, w, h)

    let quality = 0.78
    for (let i = 0; i < 10; i++) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
      })
      if (!blob) break
      if (blob.size <= STORE_ACTION_PHOTO_TARGET_MAX_BYTES || quality <= 0.5) {
        return new File([blob], `${stripExtension(file.name)}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })
      }
      quality -= 0.08
    }

    const w2 = Math.max(1, Math.round(w * 0.72))
    const h2 = Math.max(1, Math.round(h * 0.72))
    canvas.width = w2
    canvas.height = h2
    ctx.drawImage(bmp, 0, 0, w2, h2)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.65)
    })
    if (!blob) return file
    return new File([blob], `${stripExtension(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    bmp.close()
  }
}

/**
 * 목록·카드·미리보기용 URL.
 * Supabase Image Transformation을 쓰지 않음(원본 object URL) —
 * 열어봐도 Storage Image Transformations 사용량에 잡히지 않게 함.
 * 용량은 업로드 시 prepareStoreActionPhotoForUpload로 이미 줄여 둠.
 */
export function storeActionPhotoThumbUrl(raw: string): string {
  return String(raw || '').trim()
}
