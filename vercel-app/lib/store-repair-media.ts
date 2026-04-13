/** store-repair Storage public URL — 확장자로 동영상 여부 판별 (DB에 MIME 없음) */
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?|#|$)/i

export function isStoreRepairVideoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return VIDEO_EXT.test(u.pathname)
  } catch {
    return VIDEO_EXT.test(url)
  }
}

/** 모바일에서 file.type 이 비어 있는 경우 확장자로 presign용 MIME 보정 */
export function guessStoreRepairUploadContentType(file: File): string {
  const raw = (file.type || "").split(";")[0].trim().toLowerCase()
  if (raw && raw !== "application/octet-stream") return raw
  const n = (file.name || "").toLowerCase()
  if (/\.(jpe?g)$/i.test(n)) return "image/jpeg"
  if (/\.png$/i.test(n)) return "image/png"
  if (/\.webp$/i.test(n)) return "image/webp"
  if (/\.gif$/i.test(n)) return "image/gif"
  if (/\.heic$/i.test(n)) return "image/heic"
  if (/\.heif$/i.test(n)) return "image/heif"
  if (/\.(mp4|m4v)$/i.test(n)) return "video/mp4"
  if (/\.mov$/i.test(n)) return "video/quicktime"
  if (/\.webm$/i.test(n)) return "video/webm"
  if (/\.(3gp|3gpp)$/i.test(n)) return "video/3gpp"
  return raw || "application/octet-stream"
}
