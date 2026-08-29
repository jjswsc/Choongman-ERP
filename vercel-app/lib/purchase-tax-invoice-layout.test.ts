import { describe, expect, it } from 'vitest'
import {
  applyLayoutExtract,
  buildVendorInvoiceHints,
  extractFromLayout,
  findLayoutAmounts,
  findLayoutInvoiceNo,
  findLayoutTaxIds,
  learnVendorInvoiceHint,
  normalizeLabelText,
  type OcrLineBox,
  type OcrPageLayout,
} from './purchase-tax-invoice-layout'

/**
 * 실제 판독 결과처럼 단어마다 좌표가 붙은 지면을 만든다.
 * `words` 는 `[글자, x0]` 이며, x1 은 글자 수로 어림한다.
 */
function line(y: number, words: Array<[string, number]>, conf = 88): OcrLineBox {
  const boxes = words.map(([text, x0]) => ({
    text,
    conf,
    x0,
    y0: y,
    x1: x0 + Math.max(12, text.length * 14),
    y1: y + 28,
  }))
  return {
    text: words.map(([t]) => t).join(' '),
    conf,
    x0: boxes[0]?.x0 ?? 0,
    y0: y,
    x1: boxes[boxes.length - 1]?.x1 ?? 0,
    y1: y + 28,
    words: boxes,
  }
}

function page(lines: OcrLineBox[]): OcrPageLayout {
  return { width: 2480, height: 3506, lines }
}

describe('normalizeLabelText', () => {
  it('OCR이 흔히 흘리는 성조·모음 차이를 지워 라벨을 같은 모양으로 만든다', () => {
    expect(normalizeLabelText('เลขที่')).toBe(normalizeLabelText('เลขที'))
    expect(normalizeLabelText('แลข')).toBe(normalizeLabelText('เลข'))
  })
})

describe('findLayoutInvoiceNo', () => {
  it('라벨 오른쪽 값을 집는다', () => {
    const got = findLayoutInvoiceNo(page([line(400, [['เลขที่', 1500], ['IVT-69070062', 1800]])]))
    expect(got?.value).toBe('IVT-69070062')
  })

  it('날짜가 뒤따라도 번호에 붙이지 않는다', () => {
    const got = findLayoutInvoiceNo(
      page([line(400, [['เลขที่', 1400], ['110510042902', 1700], ['วันที่', 2050], ['2026', 2200]])])
    )
    expect(got?.value).toBe('110510042902')
  })

  it('주소 줄의 เลขที่ 는 번지수라 쓰지 않는다', () => {
    const got = findLayoutInvoiceNo(
      page([line(300, [['เลขที่', 200], ['545/45', 340], ['ถนน', 470], ['สุขุมวิท', 560]])])
    )
    expect(got).toBeUndefined()
  })

  it('구매처 세금번호 라벨 옆 숫자는 문서번호가 아니다', () => {
    const got = findLayoutInvoiceNo(page([line(300, [['เลขประจำตัวผู้เสียภาษี', 200], ['0105566137147', 700]])]))
    expect(got).toBeUndefined()
  })

  it('떨어져 찍힌 머리글자를 되붙인다', () => {
    const got = findLayoutInvoiceNo(page([line(500, [['เลขที่', 1800], ['IV', 2170], ['6907772', 2210]])]))
    expect(got?.value).toBe('IV6907772')
  })

  it('라벨이 없어도 머리말 오른쪽의 번호 꼴은 후보로 받는다', () => {
    const got = findLayoutInvoiceNo(page([line(120, [['Menustyle', 370], ['Printing', 670], ['IV-016119', 2010]])]))
    expect(got?.value).toBe('IV-016119')
    expect(got?.source).toBe('header-unlabeled')
  })

  it('전화번호 꼴은 라벨 옆이라도 밀어낸다', () => {
    const got = findLayoutInvoiceNo(
      page([
        line(300, [['เลขที่', 1400], ['0558996781', 1700]]),
        line(360, [['เลขที่ใบกำกับภาษี', 1400], ['INV2026070017', 1900]]),
      ])
    )
    expect(got?.value).toBe('INV2026070017')
  })

  it('같은 번호가 여러 곳에 찍혀 있으면 그쪽을 고른다', () => {
    const got = findLayoutInvoiceNo(
      page([
        line(300, [['เลขที่', 1400], ['0212345678', 1700]]),
        line(340, [['เลขที่', 1400], ['INV2026070017', 1700]]),
        line(3000, [['เลขที่', 900], ['INV2026070017', 1200]]),
      ])
    )
    expect(got?.value).toBe('INV2026070017')
  })

  it('Shopee 번호가 연도 없이 잘려도 다음 줄과 이어 붙인다', () => {
    const got = findLayoutInvoiceNo(
      page([
        line(514, [['เลขที่', 1379], ['No.', 1459], ['TRSPESPF00-00000-', 1545]]),
        line(562, [['ที่อยู่', 311], ['2026', 400], ['0701-017862', 1546]]),
      ])
    )
    expect(got?.value).toBe('TRSPESPF00-00000-260701-017862')
  })

  it('Shopee 번호가 다음 줄로 갈라져도 이어 붙인다', () => {
    const got = findLayoutInvoiceNo(
      page([
        line(514, [['เลขที่', 1379], ['No.', 1459], ['TRSPESPF00-00000-26', 1545]]),
        line(562, [['ที่อยู่', 311], ['Address', 388], ['เลขที่', 622], ['54', 690], ['0701-017862', 1546]]),
      ])
    )
    expect(got?.value).toBe('TRSPESPF00-00000-260701-017862')
  })
})

describe('거래처별 번호 꼴', () => {
  it('과거 번호에서 머리글자와 자릿수를 뽑는다', () => {
    const hint = learnVendorInvoiceHint(['IV-016057', 'IV-016119'])
    expect(hint?.prefix).toBe('IV')
    expect(hint?.digitCount).toBe(6)
    expect(hint?.digitPrefix).toBe('016')
  })

  it('꼴이 제각각이면 아무 꼴도 만들지 않는다', () => {
    expect(learnVendorInvoiceHint(['IV-016057', 'CS69070099'])).toBeUndefined()
  })

  it('머리글자만 다르고 자릿수가 같으면 자릿수만 기억한다', () => {
    const hint = learnVendorInvoiceHint(['IV690772', 'CS690099'])
    expect(hint?.prefix).toBe('')
    expect(hint?.digitCount).toBe(6)
  })

  it('근거가 없으면 만들지 않는다', () => {
    expect(learnVendorInvoiceHint([])).toBeUndefined()
    expect(learnVendorInvoiceHint(['x'])).toBeUndefined()
  })

  it('라벨이 뭉개진 장에서도 그 거래처 꼴에 맞는 번호를 찾아낸다', () => {
    const hints = buildVendorInvoiceHints([
      { sellerTaxId: '0605565002677', invoiceNo: '69070034' },
      { sellerTaxId: '0605565002677', invoiceNo: '69070361' },
    ])
    const got = extractFromLayout(
      page([
        line(300, [['เลขประจำตัวผู้เสียภาษี', 200], ['0605565002677', 800]]),
        line(490, [['HU', 1575], ['69070138', 1805]]),
      ]),
      '0105566137147',
      hints
    )
    expect(got.invoiceNo?.value).toBe('69070138')
    expect(got.invoiceNo?.source).toBe('vendor-pattern')
  })

  it('OCR이 흘린 머리글자를 과거 번호로 되살린다', () => {
    const hints = buildVendorInvoiceHints([{ sellerTaxId: '0115559009368', invoiceNo: 'IV 6907772' }])
    const got = extractFromLayout(
      page([
        line(300, [['เลขประจำตัวผู้เสียภาษี', 200], ['0115559009368', 800]]),
        line(520, [['เลขที่', 1810], ['\\', 2170], ['6907773', 2215]]),
      ]),
      '0105566137147',
      hints
    )
    expect(got.invoiceNo?.value).toBe('IV6907773')
  })
})

describe('findLayoutTaxIds', () => {
  it('구매자 세금번호는 판매자로 잡지 않는다', () => {
    const got = findLayoutTaxIds(
      page([
        line(300, [['เลขประจำตัวผู้เสียภาษี', 200], ['0105533116116', 800]]),
        line(600, [['ลูกค้า', 200], ['เลขประจำตัวผู้เสียภาษี', 400], ['0105566137147', 900]]),
      ]),
      '0105566137147'
    )
    expect(got.seller?.value).toBe('0105533116116')
    expect(got.buyer?.value).toBe('0105566137147')
  })

  it('주소의 이어진 번지수가 우연히 13자리가 되어도 세금번호로 보지 않는다', () => {
    const got = findLayoutTaxIds(page([line(300, [['145,147,149,151,153,151/1', 200]])]))
    expect(got.seller).toBeUndefined()
  })
})

describe('findLayoutAmounts', () => {
  it('공급가·부가세·합계가 서로 맞을 때만 채택한다', () => {
    const got = findLayoutAmounts(
      page([
        line(2600, [['มูลค่าสินค้า', 1400], ['3,200.00', 2100]]),
        line(2660, [['ภาษีมูลค่าเพิ่ม', 1400], ['224.00', 2100]]),
        line(2720, [['รวมทั้งสิ้น', 1400], ['3,424.00', 2100]]),
      ])
    )
    expect(got.net?.value).toBe(3200)
    expect(got.vat?.value).toBe(224)
    expect(got.total?.value).toBe(3424)
  })

  it('셋 중 하나가 안 읽혀도 나머지 둘로 되짚는다', () => {
    const got = findLayoutAmounts(
      page([
        line(2600, [['มูลค่าสินค้า', 1400], ['3,200.00', 2100]]),
        line(2660, [['ภาษีมูลค่าเพิ่ม', 1400], ['224.00', 2100]]),
      ])
    )
    expect(got.total?.value).toBe(3424)
    expect(got.source).toBeUndefined()
  })

  it('원천징수 줄의 숫자는 공급가로 쓰지 않는다', () => {
    const got = findLayoutAmounts(
      page([
        line(2600, [['หัก ณ ที่จ่าย', 1400], ['1,000.00', 2100]]),
        line(2660, [['ภาษีมูลค่าเพิ่ม', 1400], ['70.00', 2100]]),
      ])
    )
    expect(got.net?.value).not.toBe(1000)
  })

  it('맞는 조합이 없으면 지어내지 않는다', () => {
    const got = findLayoutAmounts(page([line(2600, [['ราคา', 1400], ['1,234.56', 2100]])]))
    expect(got.net).toBeUndefined()
  })
})

describe('applyLayoutExtract', () => {
  it('좌표 판독이 있으면 번호·세금번호·금액을 덮어쓴다', () => {
    const got = applyLayoutExtract(
      { invoiceNo: '545545', sellerTaxId: '0105533116116', netAmount: 100, vatAmount: 7, sellerName: 'ก' },
      {
        invoiceNo: { value: 'IV-016057', confidence: 80, source: 'bare-no-th' },
        netAmount: { value: 3200, confidence: 90, source: 'amount-triple' },
        vatAmount: { value: 224, confidence: 90, source: 'amount-triple' },
        totalAmount: { value: 3424, confidence: 90, source: 'amount-triple' },
      }
    )
    expect(got.fields.invoiceNo).toBe('IV-016057')
    expect(got.fields.netAmount).toBe(3200)
    expect(got.fields.sellerName).toBe('ก')
    expect(got.disagreed).toContain('invoiceNo')
  })

  it('약한 머리말 후보가 더 그럴듯한 텍스트 번호를 덮지 않는다', () => {
    const got = applyLayoutExtract(
      { invoiceNo: 'RV269070486' },
      { invoiceNo: { value: 'ud2932', confidence: 60, source: 'header-unlabeled' } }
    )
    expect(got.fields.invoiceNo).toBe('RV269070486')
    expect(got.usedLayout).toHaveLength(0)
  })

  it('흐릿한 값은 덮어쓰지 않는다', () => {
    const got = applyLayoutExtract(
      { invoiceNo: 'INV2026070017' },
      { invoiceNo: { value: 'S12607085123', confidence: 30, source: 'header-unlabeled' } }
    )
    expect(got.fields.invoiceNo).toBe('INV2026070017')
    expect(got.usedLayout).toHaveLength(0)
  })

  it('좌표 판독이 없으면 원본을 그대로 둔다', () => {
    const got = applyLayoutExtract({ invoiceNo: 'A1', netAmount: 5 }, undefined)
    expect(got.fields).toEqual({ invoiceNo: 'A1', netAmount: 5 })
  })

  it('카시콘 정답을 GD-19-20 같은 좌표 쓰레기가 덮지 않는다', () => {
    const got = applyLayoutExtract(
      { invoiceNo: '010726E00021480' },
      { invoiceNo: { value: 'GD-19-20', confidence: 82, source: 'bare-no-th' } }
    )
    expect(got.fields.invoiceNo).toBe('010726E00021480')
  })

  it('Grab IM 번호를 OCR이 TM으로 읽은 좌표가 덮지 않는다', () => {
    const got = applyLayoutExtract(
      { invoiceNo: 'IM20260701067378' },
      { invoiceNo: { value: 'TM20260701067378', confidence: 88, source: 'invoice-no' } }
    )
    expect(got.fields.invoiceNo).toBe('IM20260701067378')
  })

  it('텍스트 금액이 7%를 통과하면 깨진 좌표 금액을 쓰지 않는다', () => {
    const got = applyLayoutExtract(
      { invoiceNo: 'IM20260704039284', netAmount: 1148.36, vatAmount: 80.38 },
      {
        netAmount: { value: 1, confidence: 90, source: 'amount-triple' },
        vatAmount: { value: 48.36, confidence: 90, source: 'amount-triple' },
      }
    )
    expect(got.fields.netAmount).toBe(1148.36)
    expect(got.fields.vatAmount).toBe(80.38)
  })
})

describe('마켓형 금액', () => {
  it('배송비+수수료 합이 부가세의 과세표준이면 공급가로 쓴다', () => {
    const got = findLayoutAmounts(
      page([
        line(2880, [['ค่าจัดส่ง', 1400], ['SHIPPING', 1600], ['73.83', 2100]]),
        line(2920, [['ค่าบริการ', 1400], ['SERVICE', 1600], ['FEE', 1750], ['17.76', 2100]]),
        line(2960, [['ภาษีมูลค่าเพิ่ม', 1400], ['VAT', 1700], ['6.41', 2100]]),
        line(3000, [['รวมทั้งสิ้น', 1400], ['756.00', 2100]]),
      ])
    )
    expect(got.net?.value).toBe(91.59)
    expect(got.vat?.value).toBe(6.41)
  })
})
