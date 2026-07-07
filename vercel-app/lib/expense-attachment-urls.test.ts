import { describe, expect, it } from 'vitest'
import {
  MAX_EXPENSE_DATA_URL_CHARS,
  normalizeExpenseAttachmentUrlsInput,
  parseExpenseAttachmentUrls,
} from './expense-attachment-urls'

describe('expense-attachment-urls', () => {
  it('parse keeps up to 8 attachments for display', () => {
    const raw = JSON.stringify(Array.from({ length: 9 }, (_, i) => `https://x/${i}.pdf`))
    expect(parseExpenseAttachmentUrls(raw)).toHaveLength(8)
  })

  it('normalize accepts https storage urls', () => {
    const result = normalizeExpenseAttachmentUrlsInput(['https://cdn.example.com/a.pdf'])
    expect(result).toEqual({ ok: true, json: JSON.stringify(['https://cdn.example.com/a.pdf']) })
  })

  it('normalize rejects oversized data urls instead of silently dropping', () => {
    const huge = `data:application/pdf;base64,${'A'.repeat(MAX_EXPENSE_DATA_URL_CHARS + 1)}`
    const result = normalizeExpenseAttachmentUrlsInput([huge])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('다시 업로드')
    }
  })
})
