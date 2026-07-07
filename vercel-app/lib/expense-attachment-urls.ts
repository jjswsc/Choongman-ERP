/** 지출 첨부 URL 정규화 — data URL 잘림(손상) 방지, https는 그대로 저장 */

export const MAX_EXPENSE_ATTACHMENTS_SAVE = 5
export const MAX_EXPENSE_ATTACHMENTS_PARSE = 8
const MAX_HTTPS_URL_LEN = 2048
/** 압축 이미지 data URL 상한 (초과 시 Storage 업로드 필요) */
export const MAX_EXPENSE_DATA_URL_CHARS = 600_000

export type ExpenseAttachmentUrlsNormalizeResult =
  | { ok: true; json: string | null }
  | { ok: false; message: string }

export function parseExpenseAttachmentUrls(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim()
  if (!s) return []
  try {
    const p = JSON.parse(s) as unknown
    if (!Array.isArray(p)) return []
    return p
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, MAX_EXPENSE_ATTACHMENTS_PARSE)
  } catch {
    return []
  }
}

function isSupportedAttachmentUrl(url: string): boolean {
  return (
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    (url.startsWith('data:') && url.length <= MAX_EXPENSE_DATA_URL_CHARS)
  )
}

export function normalizeExpenseAttachmentUrlsInput(raw: unknown): ExpenseAttachmentUrlsNormalizeResult {
  if (raw == null) return { ok: true, json: null }
  let urls: string[] = []
  if (Array.isArray(raw)) {
    urls = raw.map((x) => String(x ?? '').trim()).filter(Boolean)
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw) as unknown
      if (Array.isArray(p)) urls = p.map((x) => String(x ?? '').trim()).filter(Boolean)
    } catch {
      return { ok: false, message: '첨부 URL 형식이 올바르지 않습니다.' }
    }
  } else {
    return { ok: true, json: null }
  }

  const attempted = urls.slice(0, MAX_EXPENSE_ATTACHMENTS_SAVE)
  const rejected = attempted.filter((u) => !isSupportedAttachmentUrl(u))
  if (rejected.length > 0) {
    return {
      ok: false,
      message:
        '첨부 파일이 너무 커서 저장할 수 없습니다. PDF·이미지를 다시 업로드해 주세요.',
    }
  }

  const normalized: string[] = []
  for (const u of attempted) {
    if (u.startsWith('https://') || u.startsWith('http://')) {
      normalized.push(u.slice(0, MAX_HTTPS_URL_LEN))
      continue
    }
    if (u.startsWith('data:')) {
      normalized.push(u)
    }
  }

  if (attempted.length > 0 && normalized.length === 0) {
    return {
      ok: false,
      message:
        '첨부 파일이 너무 커서 저장할 수 없습니다. PDF·이미지를 다시 업로드해 주세요.',
    }
  }

  if (normalized.length === 0) return { ok: true, json: null }
  return { ok: true, json: JSON.stringify(normalized) }
}

/** 저장 시 잘려 손상된 PDF data URL 여부 (기존 데이터 안내용) */
export function isLikelyCorruptedExpensePdfDataUrl(url: string): boolean {
  const u = String(url || '').trim()
  if (!u.startsWith('data:application/pdf')) return false
  const comma = u.indexOf(',')
  if (comma < 0) return true
  const b64 = u.slice(comma + 1)
  if (!b64) return true
  if (u.length === 400_000 || u.length === 1_500_000) return true
  if (b64.length % 4 === 1) return true
  return false
}

export function expenseAttachmentKind(url: string): 'image' | 'pdf' | 'other' {
  const u = String(url || '').trim().toLowerCase()
  if (!u) return 'other'
  if (u.startsWith('data:image/')) return 'image'
  if (u.startsWith('data:application/pdf')) return 'pdf'
  if (/\.pdf(\?|#|$)/i.test(u)) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(u)) return 'image'
  if (u.includes('/accruals/') && /\.pdf/i.test(u)) return 'pdf'
  return 'other'
}
