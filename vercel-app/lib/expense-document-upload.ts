import { apiFetch } from '@/lib/api/fetch'
import { putFileToSupabaseSignedUploadUrl } from '@/lib/storage-client-upload'
import { MAX_EXPENSE_DATA_URL_CHARS } from '@/lib/expense-attachment-urls'
import { compressImageForUpload } from '@/lib/utils'

function isPdfFile(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

async function uploadExpenseAttachmentToStorage(file: File): Promise<string> {
  const contentType =
    file.type && file.type.length > 0
      ? file.type
      : isPdfFile(file)
        ? 'application/pdf'
        : 'application/octet-stream'
  const pres = await apiFetch('/api/uploadExpenseAttachment/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType,
      fileSize: file.size,
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    throw new Error(pjson.message || 'UPLOAD_PRESIGN_FAIL')
  }
  const fileForUpload =
    file.type && file.type.length > 0 ? file : new File([file], file.name, { type: contentType })
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, fileForUpload, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => '')
    throw new Error(t || `UPLOAD_FAIL_${putRes.status}`)
  }
  return pjson.publicUrl
}

export async function fileToExpenseAttachmentDataUrl(file: File): Promise<string> {
  if (file.type.startsWith('image/')) {
    return compressImageForUpload(file, 1200, 0.65)
  }
  const max = 1.5 * 1024 * 1024
  if (file.size > max) {
    throw new Error('FILE_TOO_LARGE')
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('read_fail'))
    r.readAsDataURL(file)
  })
}

export async function processExpenseAttachmentFiles(
  files: File[]
): Promise<{ attachmentUrls: string[]; invoicePhotoUrl?: string }> {
  const urls: string[] = []
  let invoicePhotoUrl: string | undefined
  for (const f of files.slice(0, 3)) {
    if (isPdfFile(f)) {
      const url = await uploadExpenseAttachmentToStorage(f)
      urls.push(url)
      continue
    }
    if (f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(f.name)) {
      const dataUrl = await fileToExpenseAttachmentDataUrl(f)
      if (dataUrl.length > MAX_EXPENSE_DATA_URL_CHARS) {
        const url = await uploadExpenseAttachmentToStorage(f)
        urls.push(url)
      } else {
        urls.push(dataUrl)
      }
      if (!invoicePhotoUrl) invoicePhotoUrl = urls[urls.length - 1]
      continue
    }
    const url = await uploadExpenseAttachmentToStorage(f)
    urls.push(url)
  }
  return { attachmentUrls: urls, invoicePhotoUrl }
}
