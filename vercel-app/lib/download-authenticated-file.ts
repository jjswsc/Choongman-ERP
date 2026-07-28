/**
 * 인증 헤더가 필요한 API 첨부파일을 새 탭 없이 현재 창에서 저장.
 * window.open 은 Bearer 토큰이 빠져 text/plain 이 메모장·새 탭으로 열리기 쉬움.
 */
import { apiFetch } from '@/lib/api/fetch'

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  const cd = String(header || '')
  const star = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"+|"+$/g, ''))
    } catch {
      /* ignore */
    }
  }
  const plain = cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;]+)/i)
  if (plain?.[1]) return plain[1].trim().replace(/^"+|"+$/g, '')
  return fallback
}

export async function downloadAuthenticatedFile(url: string, fallbackFilename: string): Promise<void> {
  const res = await apiFetch(url)
  if (!res.ok) {
    let detail = `HTTP_${res.status}`
    try {
      const j = (await res.json()) as { error?: string; message?: string }
      detail = String(j?.error || j?.message || detail)
    } catch {
      try {
        const t = await res.text()
        if (t.trim()) detail = t.trim().slice(0, 240)
      } catch {
        /* keep detail */
      }
    }
    throw new Error(detail)
  }
  const blob = await res.blob()
  const filename = filenameFromContentDisposition(res.headers.get('Content-Disposition'), fallbackFilename)
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}
