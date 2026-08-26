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

  it('places rent and service as two amount rows like the official 50 ทวิ', () => {
    const multi: WhtCertificateData = {
      ...base,
      incomeType: 'ค่าเช่า, ค่าบริการ',
      grossAmount: 80000,
      whtRate: null,
      whtAmount: 3520,
      incomeLines: [
        { incomeType: 'ค่าเช่า', paymentDate: '2026-08-25', grossAmount: 56000, whtAmount: 2800, whtRate: 5 },
        { incomeType: 'ค่าบริการ', paymentDate: '2026-08-25', grossAmount: 24000, whtAmount: 720, whtRate: 3 },
      ],
    }
    const r = resolveWht50Tawi(multi)
    expect(r.amountsByRow.r5).toEqual([
      expect.objectContaining({ gross: 56000, wht: 2800 }),
    ])
    expect(r.amountsByRow.r6).toEqual([
      expect.objectContaining({ gross: 24000, wht: 720 }),
    ])
    expect(r.incomeOtherText).toBe('ค่าเช่า, ค่าบริการ')
    const html = buildWht50TawiCertificateHtml(multi, 1)
    expect(html).toContain('56,000.00')
    expect(html).toContain('24,000.00')
    expect(html).toContain('2,800.00')
    expect(html).toContain('720.00')
    expect(html).toContain('80,000.00')
    expect(html).toContain('3,520.00')
    expect(html).toContain('6. อื่น ๆ (ระบุ) ค่าเช่า, ค่าบริการ')
  })

  it('fills payee address and 13-digit tax id cells when provided', () => {
    const withPayee: WhtCertificateData = {
      ...base,
      incomeRecipient: {
        name: 'ทรู มูฟ เอช ยูนิเวอร์แซล คอมมูนิเคชั่น จำกัด',
        taxId: '0105553045044',
        address: '18 อาคารทรู ทาวเวอร์ ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
      },
    }
    const r = resolveWht50Tawi(withPayee)
    expect(r.recipientTaxId).toBe('0105553045044')
    expect(r.recipientAddress).toContain('ทรู ทาวเวอร์')
    const html = buildWht50TawiCertificateHtml(withPayee, 1)
    expect(html).toContain('ทรู ทาวเวอร์')
    expect(html).not.toContain('wht-addr2')
    for (const d of '0105553045044') {
      expect(html).toContain(`class="wht-tin-cell">${d}</td>`)
    }
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

  it('uses PND3 for Thai personal names without title', () => {
    const r = resolveWht50Tawi({
      ...base,
      formHint: 'PND53',
      incomeRecipient: { name: 'รักษา วิจิตรโสภาพันธ์', taxId: '3101800833583' },
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

  it('puts withholder name in the top box and withholdee in the bottom box', () => {
    const html = buildWht50TawiCertificateHtml(
      {
        ...base,
        direction: 'inbound',
        withholdingAgent: {
          name: 'Aisa Commerce & Trade Co., Ltd.',
          taxId: '0105568080622',
          address: 'No. 60/1 Silom Road',
        },
        incomeRecipient: {
          name: 'S&J GLOBAL CO., LTD. (Head Office)',
          taxId: '0105566137147',
          address: '101 true digital park',
        },
      },
      1
    )
    const agentIdx = html.indexOf('ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -')
    const recipientIdx = html.indexOf('ผู้ถูกหักภาษี ณ ที่จ่าย : -')
    const aisaIdx = html.indexOf('Aisa Commerce &amp; Trade Co., Ltd.')
    const sjIdx = html.indexOf('S&amp;J GLOBAL CO., LTD. (Head Office)')
    expect(aisaIdx).toBeGreaterThan(agentIdx)
    expect(aisaIdx).toBeLessThan(recipientIdx)
    expect(sjIdx).toBeGreaterThan(recipientIdx)
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
    expect(both).not.toContain('wht50-pagebreak')
    expect(both).not.toMatch(/class="wht50-page"/)
    expect(both).toContain('data-copy="1"')
    expect(both).toContain('data-copy="2"')
    const doc = buildWhtCertificateDocumentHtml([base])
    expect((doc.match(/class="wht50-sheet"/g) || []).length).toBe(2)
    expect(doc).toContain('page-break-after: always')
    expect(doc).toContain('min-height: 285mm')
    expect(doc).toContain('height: 285mm')
    expect(doc).toContain('max-height: 285mm')
    expect(doc).toContain('wht-tbl-slot')
    expect(doc).toContain('break-before: page')
    // screen 미리보기도 고정 높이(auto 로 줄이면 테두리가 A4를 못 채움)
    expect(doc).toMatch(/@media screen[\s\S]*?\.wht50-sheet\s*\{[\s\S]*?height:\s*285mm\s*!important/)
  })

  it('keeps one A4 sheet per certificate copy when printing multiple payees', () => {
    const second = { ...base, payeeName: 'บริษัท ทดสอบ จำกัด', certNo: '2' }
    const doc = buildWhtCertificateDocumentHtml([base, second])
    expect((doc.match(/class="wht50-sheet"/g) || []).length).toBe(4)
    expect(doc).toContain('@page { size: A4 portrait')
  })
})
