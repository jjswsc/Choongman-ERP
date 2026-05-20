import type { WhtCertificateData } from '@/lib/wht-certificate-data'
import { buildWhtCertificateDocumentHtml } from '@/lib/wht-certificate-html'

export const WHT_CERT_PRINT_STORAGE_KEY = 'wht-certificate-print-data'

export function openWhtCertificatePrintWindow(items: WhtCertificateData[], lang: string): boolean {
  if (typeof window === 'undefined') return false
  const list = (items || []).filter((d) => d.whtAmount > 0)
  if (!list.length) return false
  try {
    sessionStorage.setItem(
      WHT_CERT_PRINT_STORAGE_KEY,
      JSON.stringify({ items: list, lang: lang || 'ko' })
    )
  } catch {
    return false
  }
  const w = window.open('/admin/wht-certificate-print', '_blank')
  if (w) w.focus()
  return !!w
}

export function printWhtCertificatesInline(items: WhtCertificateData[], lang: string): boolean {
  if (typeof window === 'undefined') return false
  const list = (items || []).filter((d) => d.whtAmount > 0)
  if (!list.length) return false
  const html = buildWhtCertificateDocumentHtml(list, lang || 'ko')
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => {
    w.print()
    w.close()
  }, 400)
  return true
}
