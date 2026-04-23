/** 공지 첨부 — 클라이언트/서버 공용 크기·타입 제한 (presign + sendNotice URL만 저장) */

export const MAX_NOTICE_FILES = 3
export const MAX_NOTICE_NON_VIDEO_BYTES = 5 * 1024 * 1024
export const MAX_NOTICE_VIDEO_BYTES = 80 * 1024 * 1024

const CT = (s: string) => s.toLowerCase().split(';')[0].trim()

function isImageMime(mime: string) {
  return CT(mime).startsWith('image/')
}

function isVideoMime(mime: string) {
  return CT(mime).startsWith('video/')
}

const DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
])

export function maxBytesForNoticeMime(mime: string): number {
  if (isVideoMime(mime)) return MAX_NOTICE_VIDEO_BYTES
  return MAX_NOTICE_NON_VIDEO_BYTES
}

export function isAllowedNoticeContentType(mime: string): boolean {
  const m = CT(mime)
  if (isImageMime(mime) || isVideoMime(mime)) return true
  if (DOC_MIMES.has(m)) return true
  return m === 'application/octet-stream'
}

export function noticeFileKind(
  mime: string
): 'image' | 'pdf' | 'doc' | 'video' {
  const m = CT(mime)
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.includes('pdf')) return 'pdf'
  return 'doc'
}

export function formatNoticeFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export interface NoticeAttachedFile {
  id: string
  name: string
  size: string
  type: 'image' | 'pdf' | 'doc' | 'video'
  url: string
  mime: string
}
