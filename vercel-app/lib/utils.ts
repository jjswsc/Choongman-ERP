import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** HTML에 삽입할 문자열 이스케이프 (XSS 방지). innerHTML/문자열 템플릿에 사용 */
export function escapeHtml(s: string | null | undefined): string {
  const str = String(s ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 직원 닉네임/역할 표시 시 "(Part-Time)"을 "(P/T)"로 줄여서 표시 */
export function displayLabelShort(val: string | null | undefined): string {
  const s = String(val ?? '').trim()
  if (!s) return s
  if (s === 'Part-Time') return 'P/T'
  return s.replace(/\s*\(Part-Time\)\s*/gi, ' (P/T)')
}

/** 모바일 사진 업로드 전 압축 (base64 크기 제한 회피). HEIC/일부 포맷 실패 시 FileReader fallback */
export function compressImageForUpload(file: File, maxWidth = 1024, quality = 0.65): Promise<string> {
  const tryCompress = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        let w = img.width
        let h = img.height
        if (w > maxWidth || h > maxWidth) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w)
            w = maxWidth
          } else {
            w = Math.round((w * maxWidth) / h)
            h = maxWidth
          }
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas not supported'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(dataUrl)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Image load failed'))
      }
      img.src = url
    })

  return tryCompress().catch((err) => {
    // 모바일 HEIC/일부 포맷에서 Image 로드 실패 시 FileReader로 fallback (압축 없이, 2MB 제한)
    if (file.size > 2 * 1024 * 1024) {
      return Promise.reject(new Error('Image too large or unsupported format (max 2MB for HEIC)'))
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string' && result.startsWith('data:')) resolve(result)
        else reject(err)
      }
      reader.onerror = () => reject(err)
      reader.readAsDataURL(file)
    })
  })
}
