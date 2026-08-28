import { describe, expect, it } from "vitest"
import { buildPurchaseOrderExcelHtml, PO_EXCEL_MIN_ITEM_ROWS, type PoExcelInput } from "./purchase-order-excel-html"

const labels: PoExcelInput["labels"] = {
  docTitle: "Invoice/Tax invoice",
  docNoLabel: "Invoice No.",
  dateLabel: "날짜",
  fromLabel: "FROM",
  billToLabel: "청구처 (가맹)",
  shipToLabel: "수령처",
  taxIdLabel: "Tax ID",
  addressLabel: "주소",
  phoneLabel: "Phone",
  no: "No",
  item: "품목",
  spec: "규격",
  unitPrice: "단가",
  qty: "수량",
  amount: "합계",
  subtotal: "소계",
  vatLine: "VAT (7%)",
  invoiceTotal: "합계",
  preparedBy: "작성자",
  receivedBy: "수령자",
  signatureDate: "날짜",
  authorizedStamp: "승인 서명 및 회사 인",
  storeLabel: "매장",
  headerBadge: "Approved",
  whtLabel: "원천징수 (3%)",
  netAfterWht: "차감 후 지급액(참고)",
}

function sampleAccountingPo(overrides: Partial<PoExcelInput> = {}): PoExcelInput {
  return {
    poNo: "PO-20260826-1345",
    dateStr: "2026년 08월 26일",
    from: {
      name: "S&J GLOBAL",
      address: "101 true digital park pegasus building, floor 5, unit 545, Sukhumvit Rd. Bangkok 10260",
      taxId: "0105551234567",
      phone: "02-000-0000",
    },
    billTo: {
      name: "CM MBK",
      address: "MBK Center",
      taxId: "0105550000001",
      extraLines: [{ label: "법인명 (거래처 마스터)", value: "Jinwon f&b Co.,Ltd. (00001)" }],
    },
    shipToName: "본사",
    shipToAddress:
      "101 true digital park pegasus building, floor 5, unit 545, Sukhumvit Rd. Khwang Bang Chak, Khet Phra Khanong, Bangkok 10260",
    lines: [
      {
        name: "ค่าบริการทำบัญชี กรกฎาคม 2569",
        spec: "-",
        price: 4800,
        qty: 1,
      },
    ],
    subtotal: 4800,
    vat: 336,
    total: 5136,
    withholdingTaxAmount: 144,
    preparedByName: "회계",
    labels,
    ...overrides,
  }
}

describe("buildPurchaseOrderExcelHtml", () => {
  it("sets A4 portrait print at 100% so Excel does not shrink the sheet", () => {
    const html = buildPurchaseOrderExcelHtml(sampleAccountingPo())
    expect(html).toContain("<x:PaperSizeIndex>9</x:PaperSizeIndex>")
    expect(html).toContain('x:Orientation="Portrait"')
    expect(html).toContain("<x:Scale>100</x:Scale>")
    expect(html).not.toContain("<x:FitToPage/>")
    expect(html).toContain("size: A4 portrait")
    expect(html).toContain("width:190mm")
    expect(html).toContain("<x:DoNotDisplayGridlines/>")
  })

  it("renders accounting invoice header, parties, item, VAT and WHT", () => {
    const html = buildPurchaseOrderExcelHtml(sampleAccountingPo())
    expect(html).toContain("Invoice/Tax invoice")
    expect(html).toContain("PO-20260826-1345")
    expect(html).toContain("CM MBK")
    expect(html).toContain("Jinwon f&amp;b Co.,Ltd. (00001)")
    expect(html).toContain("본사")
    expect(html).toContain("ค่าบริการทำบัญชี กรกฎาคม 2569")
    expect(html).toContain(">4800</td>")
    expect(html).toContain(">336</td>")
    expect(html).toContain(">5136</td>")
    expect(html).toContain(">-144</td>")
    expect(html).toContain(">4992</td>")
    expect(html).toContain("원천징수 (3%)")
    expect(html).toContain("차감 후 지급액(참고)")
  })

  it("escapes HTML in names and wraps long addresses", () => {
    const html = buildPurchaseOrderExcelHtml(
      sampleAccountingPo({
        billTo: { name: 'A <B> & "C"', address: "long" },
      })
    )
    expect(html).toContain("A &lt;B&gt; &amp; &quot;C&quot;")
    expect(html).not.toContain("A <B>")
    expect(html).toContain("po-addr")
    expect(html).toContain("<br/>")
  })

  it("omits WHT rows when withholding is zero", () => {
    const html = buildPurchaseOrderExcelHtml(
      sampleAccountingPo({ withholdingTaxAmount: 0, labels: { ...labels, whtLabel: "원천징수 (3%)" } })
    )
    expect(html).not.toContain("원천징수 (3%)")
    expect(html).not.toContain("차감 후 지급액")
  })

  it("groups item rows by store when store is set", () => {
    const html = buildPurchaseOrderExcelHtml(
      sampleAccountingPo({
        lines: [
          { name: "A", price: 100, qty: 1, store: "Silom" },
          { name: "B", price: 200, qty: 1, store: "MBK" },
        ],
        withholdingTaxAmount: 0,
      })
    )
    expect(html).toContain("매장: Silom")
    expect(html).toContain("매장: MBK")
  })

  it("pads short invoices with blank item rows so A4 is filled", () => {
    const html = buildPurchaseOrderExcelHtml(sampleAccountingPo())
    const blanks = (html.match(/class="xl-body po-blank"/g) || []).length
    expect(blanks).toBe(PO_EXCEL_MIN_ITEM_ROWS - 1)
    expect(html).toContain("font-size: 26pt")
    expect(html).toContain("font-size: 16pt")
    expect(html).toContain(`height:${108}pt`)
  })

  it("keeps 13-digit tax IDs as text so Excel does not show scientific notation", () => {
    const html = buildPurchaseOrderExcelHtml(sampleAccountingPo())
    expect(html).toContain('x:str="0105551234567"')
    expect(html).toContain("po-text")
    expect(html).not.toMatch(/1\.0555\d*E\+/i)
  })
})
