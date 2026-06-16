import { apiFetch } from '@/lib/api/fetch'
import { putFileToSupabaseSignedUploadUrl } from '@/lib/storage-client-upload'

export const MEMBER_PORTAL_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

const ALLOWED = new Set<string>(MEMBER_PORTAL_IMAGE_MIME_TYPES)

/** presign·PUT 공통 — MIME 정규화 */
export function normalizeMemberPortalImageContentType(raw: unknown): string {
  let ct = String(raw || 'image/jpeg')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (ct === 'image/jpg' || ct === 'image/pjpeg') ct = 'image/jpeg'
  return ct
}

/** 브라우저 file.type 이 비어 있거나 octet-stream 인 경우 확장자로 보정 */
export function guessMemberPortalImageContentType(file: File): string {
  const rawType = String(file.type || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (rawType === 'image/jpg' || rawType === 'image/pjpeg') return 'image/jpeg'
  if (rawType && rawType !== 'application/octet-stream' && ALLOWED.has(rawType)) return rawType
  const n = (file.name || '').toLowerCase()
  if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg'
  if (/\.png$/i.test(n)) return 'image/png'
  if (/\.webp$/i.test(n)) return 'image/webp'
  if (/\.gif$/i.test(n)) return 'image/gif'
  return 'image/jpeg'
}

/** Supabase signed PUT Content-Type 이 presign MIME 과 일치하도록 File 재래핑 */
export function fileForMemberPortalImageUpload(file: File): File {
  const ct = guessMemberPortalImageContentType(file)
  if (file.type === ct) return file
  return new File([file], file.name || 'image.jpg', { type: ct, lastModified: file.lastModified })
}

export type MemberPortalImageUploadResult =
  | { ok: true; publicUrl: string }
  | { ok: false; message: string }

/** 회원앱 관리자 — Storage presign 후 브라우저에서 직접 PUT */
export async function uploadMemberPortalContentImageToStorage(
  file: File
): Promise<MemberPortalImageUploadResult> {
  const contentType = guessMemberPortalImageContentType(file)
  const fileForUpload = fileForMemberPortalImageUpload(file)

  const presignRes = await apiFetch('/api/uploadMemberPortalContentImage/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      fileSize: file.size,
    }),
  })
  const presign = (await presignRes.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!presignRes.ok || !presign.success || !presign.signedUrl || !presign.publicUrl) {
    return { ok: false, message: presign.message || 'UPLOAD_PRESIGN_FAIL' }
  }

  const putRes = await putFileToSupabaseSignedUploadUrl(presign.signedUrl, fileForUpload, {
    timeoutMs: 180000,
  })
  if (!putRes.ok) {
    const body = await putRes.text().catch(() => '')
    return {
      ok: false,
      message: body.trim() || `STORAGE_PUT_FAIL_${putRes.status}`,
    }
  }

  return { ok: true, publicUrl: presign.publicUrl }
}

/** 업로드 직후 public URL 로딩 가능 여부 확인 (버킷 공개·CORS 문제 조기 발견) */
export function verifyMemberPortalImagePublicUrl(url: string, timeoutMs = 15000): Promise<boolean> {
  const trimmed = String(url || '').trim()
  if (!trimmed || typeof window === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    const img = new window.Image()
    const timer = window.setTimeout(() => resolve(false), timeoutMs)
    img.onload = () => {
      window.clearTimeout(timer)
      resolve(true)
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(false)
    }
    const sep = trimmed.includes('?') ? '&' : '?'
    img.src = `${trimmed}${sep}verify=${Date.now()}`
  })
}

export function withMemberPortalImageCacheBust(url: string, nonce: number): string {
  const trimmed = String(url || '').trim()
  if (!trimmed || nonce <= 0) return trimmed
  const sep = trimmed.includes('?') ? '&' : '?'
  return `${trimmed}${sep}v=${nonce}`
}
