import { apiFetch } from '@/lib/api/fetch'
import { putFileToSupabaseSignedUploadUrl } from '@/lib/storage-client-upload'

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

export function guessMarketingMaterialInstallPhotoContentType(file: File): string {
  const rawType = String(file.type || '')
    .trim()
    .toLowerCase()
    .split(';')[0]
    .trim()
  if (rawType === 'image/jpg' || rawType === 'image/pjpeg') return 'image/jpeg'
  if (rawType && rawType !== 'application/octet-stream' && IMAGE_TYPES.has(rawType)) return rawType
  const n = (file.name || '').toLowerCase()
  if (/\.(jpe?g)$/i.test(n)) return 'image/jpeg'
  if (/\.png$/i.test(n)) return 'image/png'
  if (/\.webp$/i.test(n)) return 'image/webp'
  if (/\.gif$/i.test(n)) return 'image/gif'
  if (/\.heic$/i.test(n)) return 'image/heic'
  if (/\.heif$/i.test(n)) return 'image/heif'
  return 'image/jpeg'
}

export async function uploadMarketingMaterialInstallPhoto(params: {
  storeName: string
  materialId: string
  campaignId?: string | null
  file: File
}): Promise<{ success: boolean; url?: string; message?: string }> {
  const storeName = String(params.storeName || '').trim()
  const materialId = String(params.materialId || '').trim()
  const campaignId = String(params.campaignId || '').trim()
  if (!storeName || !materialId) {
    return { success: false, message: '매장과 홍보물 ID가 필요합니다.' }
  }

  const contentType = guessMarketingMaterialInstallPhotoContentType(params.file)
  const fileForUpload =
    params.file.type === contentType
      ? params.file
      : new File([params.file], params.file.name || 'install.jpg', {
          type: contentType,
          lastModified: params.file.lastModified,
        })

  const pres = await apiFetch('/api/uploadMarketingMaterialInstallPhoto/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeName,
      materialId,
      campaignId: campaignId || undefined,
      fileName: params.file.name,
      contentType,
      fileSize: params.file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false, message: pjson.message || '업로드 준비 실패' }
  }

  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, fileForUpload, {
    upsert: false,
    timeoutMs: 120000,
  })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    return { success: false, message: t.trim() || `STORAGE_PUT_FAIL_${putRes.status}` }
  }

  return { success: true, url: pjson.publicUrl }
}
