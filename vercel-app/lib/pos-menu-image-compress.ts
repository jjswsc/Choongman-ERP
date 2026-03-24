'use client'

/** Vercel 서버리스 요청 한도(~4.5MB)·멀티파트 여유를 두고 목표 용량 */
const TARGET_MAX_BYTES = 3 * 1024 * 1024
const MAX_EDGE_PX = 1600

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name || 'menu'
}

/**
 * POS 메뉴 이미지 업로드 전 처리.
 * 고해상도·고용량 파일은 축소·JPEG 재인코딩으로 요청 크기를 줄임 (413/HTML 응답 방지).
 */
export async function preparePosMenuImageFileForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  let bmp: ImageBitmap | undefined
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('POS_MENU_IMAGE_DECODE_FAIL')
  }

  try {
    const longEdge = Math.max(bmp.width, bmp.height)
    const needsResize = longEdge > MAX_EDGE_PX
    const needsShrink = file.size > TARGET_MAX_BYTES

    if (!needsResize && !needsShrink) {
      return file
    }

    const scale = needsResize ? Math.min(1, MAX_EDGE_PX / longEdge) : 1
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('POS_MENU_IMAGE_CANVAS')
    ctx.drawImage(bmp, 0, 0, w, h)

    let quality = 0.88
    for (let i = 0; i < 10; i++) {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality)
      })
      if (!blob) break
      if (blob.size <= TARGET_MAX_BYTES || quality <= 0.52) {
        const outName = `${stripExtension(file.name)}.jpg`
        return new File([blob], outName, { type: 'image/jpeg', lastModified: Date.now() })
      }
      quality -= 0.08
    }

    const w2 = Math.max(1, Math.round(w * 0.72))
    const h2 = Math.max(1, Math.round(h * 0.72))
    canvas.width = w2
    canvas.height = h2
    ctx.drawImage(bmp, 0, 0, w2, h2)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.7)
    })
    if (!blob) throw new Error('POS_MENU_IMAGE_BLOB')
    return new File([blob], `${stripExtension(file.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    bmp.close()
  }
}
