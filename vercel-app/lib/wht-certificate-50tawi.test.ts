import { describe, expect, it } from 'vitest'
import { thaiBahtInWords } from '@/lib/thai-baht-text'
import {
  buildWht50TawiCertificateHtml,
  buildWht50TawiCertificateHtmlBothCopies,
  resolveWht50Tawi,
} from '@/lib/wht-certificate-50tawi'
import { buildWhtCertificateDocumentHtml } from '@/lib/wht-certificate-html'
import type { WhtCertificateData } from '@/lib/wht-certificate-data'

describe('thaiBahtInWords', () => {
  it('formats whole baht', () => {
    expect(thaiBahtInWords(279)).toContain('บาท')
    expect(thaiBahtInWords(279)).toContain('ถ้วน')
  })
})

describe('resolveWht50Tawi', () => {
  const base: WhtCertificateData = {
    certificateNo: 'EAW-42',
    formHint: 'PND53',
    paymentDate: '2026-07-16',
    taxMonth: '2026-07',
    incomeType: 'ค่าบริการ',
    grossAmount: 9300,
    whtRate: 3,
    whtAmount: 279,
    direction: 'outbound',
    withholdingAgent: { name: 'บริษัท ทดสอบ', taxId: '0123456789012', address: 'กรุงเทพฯ' },
    incomeRecipient: { name: 'Polonext Co., Ltd.', taxId: '9876543210987' },
  }

  it('maps service income to row 5 and PND53 for juristic person vendor', () => {
    const r = resolveWht50Tawi(base)
    expect(r.incomeRow).toBe('r5')
    expect(r.pndChecks.pnd53).toBe(true)
    expect(r.pndChecks.pnd3).toBe(false)
    expect(r.bookNo).toBe('EAW')
    expect(r.certNo).toBe('42')
    expect(r.paymentDateDisplay).toBe('16/7/2569')
  })

  it('uses PND3 for natural person when form hint is not set', () => {
    const r = resolveWht50Tawi({
      ...base,
      formHint: '',
      incomeRecipient: { name: 'นายสมชาย ใจดี', taxId: '1234567890123' },
    })
    expect(r.pndChecks.pnd3).toBe(true)
    expect(r.pndChecks.pnd53).toBe(false)
  })

  it('overrides stale PND3 form hint when recipient is a juristic person', () => {
    const r = resolveWht50Tawi({
      ...base,
      formHint: 'PND3',
      incomeRecipient: { name: 'Polonext Co., Ltd.', taxId: '0105561000000' },
    })
    expect(r.pndChecks.pnd53).toBe(true)
    expect(r.pndChecks.pnd3).toBe(false)
  })

  it('places title header first, then payer, payee, income table', () => {
    const html = buildWht50TawiCertificateHtml(base, 1)
    const titleIdx = html.indexOf('wht-ttl')
    const agentIdx = html.indexOf('ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -')
    const recipientIdx = html.indexOf('ผู้ถูกหักภาษี ณ ที่จ่าย : -')
    const tableIdx = html.indexOf('ประเภทเงินได้พึงประเมินที่จ่าย')
    expect(titleIdx).toBeGreaterThanOrEqual(0)
    expect(agentIdx).toBeGreaterThan(titleIdx)
    expect(recipientIdx).toBeGreaterThan(agentIdx)
    expect(tableIdx).toBeGreaterThan(recipientIdx)
  })

  it('marks active copy number in header legend', () => {
    const copy1 = buildWht50TawiCertificateHtml(base, 1)
    const copy2 = buildWht50TawiCertificateHtml(base, 2)
    expect(copy1).toContain('data-copy="1"')
    expect(copy2).toContain('data-copy="2"')
    expect(copy1).toContain('wht-copy wht-on">ฉบับที่ 1')
    expect(copy2).toContain('wht-copy wht-on">ฉบับที่ 2')
  })

  it('includes full official dividend sub-rows (2.1)–(2.5)', () => {
    const html = buildWht50TawiCertificateHtml(base, 1)
    expect(html).toContain('(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล')
    expect(html).toContain('(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)')
    expect(html).toContain('(2.5) อื่น ๆ (ระบุ)')
    expect(html).toContain('ประทับตรา')
    expect(html).toContain('คำเตือน')
  })

  it('prints each copy as its own A4 page (like original PDF)', () => {
    const both = buildWht50TawiCertificateHtmlBothCopies(base)
    expect((both.match(/class="wht50-sheet"/g) || []).length).toBe(2)
    expect(both).not.toContain('wht50-page')
    expect(both).toContain('data-copy="1"')
    expect(both).toContain('data-copy="2"')
    const doc = buildWhtCertificateDocumentHtml([base])
    expect((doc.match(/class="wht50-sheet"/g) || []).length).toBe(2)
  })
})
