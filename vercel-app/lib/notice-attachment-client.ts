'use client'

import { putFileToSupabaseSignedUploadUrl } from '@/lib/storage-client-upload'
import { presignNoticeAttachment } from '@/lib/api-client'
import {
  type NoticeAttachedFile,
  formatNoticeFileSize,
  isAllowedNoticeContentType,
  maxBytesForNoticeMime,
  noticeFileKind,
} from '@/lib/notice-attachments'

function effectiveMimeForNotice(file: File): string {
  const raw = (file.type || '').trim()
  if (raw) return raw
  const n = file.name.toLowerCase()
  if (/\.(mp4|m4v|mov|webm|avi|mkv|3gp)$/.test(n)) return 'video/mp4'
  if (/\.(jpe?g|png|gif|webp|heic)$/.test(n)) return 'image/jpeg'
  if (/\.pdf$/.test(n)) return 'application/pdf'
  return 'application/octet-stream'
}

/**
 * Supabase signed URL로 직접 업로드 → sendNotice에는 public URL만 전달 (대용량·동영상 대응)
 */
export async function uploadAndBuildNoticeAttachment(
  file: File,
  id: string
): Promise<NoticeAttachedFile> {
  const mime = effectiveMimeForNotice(file)
  if (!isAllowedNoticeContentType(mime)) {
    throw new Error('이미지·PDF·문서·동영상만 첨부할 수 있습니다.')
  }
  if (file.size > maxBytesForNoticeMime(mime)) {
    const m = mime.toLowerCase().split(';')[0].trim()
    throw new Error(
      m.startsWith('video/') ? '동영상은 80MB 이하여야 합니다.' : '이미지·PDF·문서는 파일당 5MB 이하여야 합니다.'
    )
  }
  const p = await presignNoticeAttachment({
    fileName: file.name,
    contentType: mime,
    fileSize: file.size,
  })
  if (!p.success || !p.signedUrl || !p.publicUrl) {
    throw new Error(p.message || '업로드 준비에 실패했습니다.')
  }
  const fileForUpload =
    file.type && file.type.length > 0 ? file : new File([file], file.name, { type: mime })
  const putRes = await putFileToSupabaseSignedUploadUrl(p.signedUrl, fileForUpload, { timeoutMs: 600_000 })
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => '')
    throw new Error(body || `업로드 실패 (${putRes.status})`)
  }
  return {
    id,
    name: file.name,
    size: formatNoticeFileSize(file.size),
    type: noticeFileKind(mime),
    url: p.publicUrl,
    mime,
  }
}
