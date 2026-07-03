import { compressImageForUpload } from '@/lib/utils'

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
    const url = await fileToExpenseAttachmentDataUrl(f)
    urls.push(url)
    if (!invoicePhotoUrl && f.type.startsWith('image/')) {
      invoicePhotoUrl = url
    }
  }
  return { attachmentUrls: urls, invoicePhotoUrl }
}
