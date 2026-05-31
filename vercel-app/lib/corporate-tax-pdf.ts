import type { CorporateTaxComputationData } from "@/lib/api-client"

export type CorporateTaxPdfValidation = {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

type CorporateTaxPdfBuildInput = {
  data: CorporateTaxComputationData
  title: string
  subtitle: string
  amountLabel: string
  generatedAtLabel: string
  storeScopeLabel: string
  storeScopeValue: string
  periodLabel: string
  filingFormLabel: string
  accountingProfitLabel: string
  taxAddBackLabel: string
  taxDeductionLabel: string
  taxableIncomeLabel: string
  projectedAnnualTaxableIncomeLabel: string
  taxRateLabel: string
  estimatedTaxLabel: string
  filingTaxDueLabel: string
  adjustmentsTitle: string
  adjustmentsTypeLabel: string
  adjustmentsItemLabel: string
  adjustmentsAmountLabel: string
  adjustmentsMemoLabel: string
  adjustmentTypeAddBackLabel: string
  adjustmentTypeDeductionLabel: string
  noAdjustmentsLabel: string
}

function escHtml(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function toAmount(n: number): string {
  const num = Number(n || 0)
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sanitizeFilenamePart(s: string): string {
  return String(s || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .slice(0, 80) || "report"
}

export function validateCorporateTaxForPdf(data: CorporateTaxComputationData | null): CorporateTaxPdfValidation {
  if (!data) {
    return { isValid: false, errors: ["NO_DATA"], warnings: [] }
  }
  const errors = [...(Array.isArray(data.validation?.errors) ? data.validation.errors : [])]
  const warnings = [...(Array.isArray(data.validation?.warnings) ? data.validation.warnings : [])]
  if (!data.pdfMeta?.periodLabel) errors.push("MISSING_PDF_PERIOD_LABEL")
  if (!data.pdfMeta?.formCode) errors.push("MISSING_PDF_FORM_CODE")
  if (!Number.isFinite(Number(data.taxableIncome))) errors.push("INVALID_TAXABLE_INCOME")
  if (!Number.isFinite(Number(data.taxRate))) errors.push("INVALID_TAX_RATE")
  if (!Number.isFinite(Number(data.filingTaxDue))) errors.push("INVALID_FILING_TAX_DUE")
  return { isValid: errors.length === 0, errors, warnings }
}

export function buildCorporateTaxPdfHtml(input: CorporateTaxPdfBuildInput): string {
  const { data } = input
  const adjustmentRows = (data.adjustments || [])
    .map((item) => {
      const typeLabel =
        item.type === "deduction" ? input.adjustmentTypeDeductionLabel : input.adjustmentTypeAddBackLabel
      return `
        <tr>
          <td>${escHtml(typeLabel)}</td>
          <td>${escHtml(item.itemName || "-")}</td>
          <td class="num">${toAmount(item.amount)}</td>
          <td>${escHtml(item.memo || "-")}</td>
        </tr>
      `
    })
    .join("")

  const taxRatePct = Number(data.taxRate || 0) * 100
  const generatedAt = data.pdfMeta?.generatedAtBangkok || ""
  const scopeValue = input.storeScopeValue || data.pdfMeta?.storeScopeLabel || data.storeFilter || "-"
  const periodValue = data.pdfMeta?.periodLabel || data.periodKey
  const filingForm = data.pdfMeta?.formCode || (data.filingForm === "pnd51" ? "P.N.D.51" : "P.N.D.50")

  return `
    <div class="pnd-pdf">
      <style>
        .pnd-pdf{font-family: Arial, "Noto Sans Thai", sans-serif; color:#111; width:186mm; padding:0; margin:0;}
        .pnd-head{border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:12px;}
        .pnd-title{font-size:20px; font-weight:700; margin:0 0 2px;}
        .pnd-subtitle{font-size:12px; color:#444; margin:0;}
        .pnd-meta{display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;}
        .pnd-meta-item{border:1px solid #ddd; border-radius:6px; padding:8px;}
        .pnd-meta-label{font-size:11px; color:#666; margin-bottom:2px;}
        .pnd-meta-value{font-size:13px; font-weight:600;}
        .pnd-table{width:100%; border-collapse:collapse; margin-top:8px;}
        .pnd-table th,.pnd-table td{border:1px solid #ddd; padding:7px 8px; font-size:12px; vertical-align:top;}
        .pnd-table th{background:#f7f7f7; text-align:left;}
        .pnd-table .num{text-align:right; font-variant-numeric:tabular-nums;}
        .pnd-section-title{font-size:14px; font-weight:700; margin:14px 0 8px;}
        .pnd-small{font-size:11px; color:#666;}
      </style>

      <div class="pnd-head">
        <h1 class="pnd-title">${escHtml(input.title)}</h1>
        <p class="pnd-subtitle">${escHtml(input.subtitle)}</p>
      </div>

      <div class="pnd-meta">
        <div class="pnd-meta-item">
          <div class="pnd-meta-label">${escHtml(input.filingFormLabel)}</div>
          <div class="pnd-meta-value">${escHtml(filingForm)}</div>
        </div>
        <div class="pnd-meta-item">
          <div class="pnd-meta-label">${escHtml(input.periodLabel)}</div>
          <div class="pnd-meta-value">${escHtml(periodValue)}</div>
        </div>
        <div class="pnd-meta-item">
          <div class="pnd-meta-label">${escHtml(input.storeScopeLabel)}</div>
          <div class="pnd-meta-value">${escHtml(scopeValue)}</div>
        </div>
        <div class="pnd-meta-item">
          <div class="pnd-meta-label">${escHtml(input.generatedAtLabel)}</div>
          <div class="pnd-meta-value">${escHtml(generatedAt || "-")}</div>
        </div>
      </div>

      <table class="pnd-table">
        <thead>
          <tr>
            <th>${escHtml(input.amountLabel)}</th>
            <th class="num">${escHtml(input.amountLabel)}</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>${escHtml(input.accountingProfitLabel)}</td><td class="num">${toAmount(data.accountingProfit)}</td></tr>
          <tr><td>${escHtml(input.taxAddBackLabel)}</td><td class="num">${toAmount(data.taxAddBack)}</td></tr>
          <tr><td>${escHtml(input.taxDeductionLabel)}</td><td class="num">${toAmount(data.taxDeduction)}</td></tr>
          <tr><td>${escHtml(input.taxableIncomeLabel)}</td><td class="num">${toAmount(data.taxableIncome)}</td></tr>
          <tr><td>${escHtml(input.projectedAnnualTaxableIncomeLabel)}</td><td class="num">${toAmount(data.projectedAnnualTaxableIncome)}</td></tr>
          <tr><td>${escHtml(input.taxRateLabel)}</td><td class="num">${taxRatePct.toFixed(2)}%</td></tr>
          <tr><td>${escHtml(input.estimatedTaxLabel)}</td><td class="num">${toAmount(data.estimatedTax)}</td></tr>
          <tr><td>${escHtml(input.filingTaxDueLabel)}</td><td class="num">${toAmount(data.filingTaxDue)}</td></tr>
        </tbody>
      </table>

      <div class="pnd-section-title">${escHtml(input.adjustmentsTitle)}</div>
      <table class="pnd-table">
        <thead>
          <tr>
            <th style="width:16%">${escHtml(input.adjustmentsTypeLabel)}</th>
            <th style="width:34%">${escHtml(input.adjustmentsItemLabel)}</th>
            <th style="width:20%" class="num">${escHtml(input.adjustmentsAmountLabel)}</th>
            <th style="width:30%">${escHtml(input.adjustmentsMemoLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${
            adjustmentRows ||
            `<tr><td colspan="4" class="pnd-small">${escHtml(input.noAdjustmentsLabel)}</td></tr>`
          }
        </tbody>
      </table>
    </div>
  `
}

export async function exportCorporateTaxPdf(input: {
  data: CorporateTaxComputationData
  html: string
}): Promise<string> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ])
  const host = document.createElement("div")
  host.style.position = "fixed"
  host.style.left = "-100000px"
  host.style.top = "0"
  host.style.width = "210mm"
  host.style.background = "#fff"
  host.style.padding = "12mm"
  host.innerHTML = input.html
  document.body.appendChild(host)

  try {
    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    })
    const imgData = canvas.toDataURL("image/png")
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 8
    const imgW = pageW - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    const usableH = pageH - margin * 2
    let heightLeft = imgH
    let y = margin
    pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
    heightLeft -= usableH
    while (heightLeft > 0) {
      y = margin - (imgH - heightLeft)
      pdf.addPage()
      pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
      heightLeft -= usableH
    }
    const period = input.data.periodKey || "period"
    const form = input.data.pdfMeta?.formCode || "PND50-51"
    const filename = `tax-filing-${sanitizeFilenamePart(form)}-${sanitizeFilenamePart(period)}.pdf`
    pdf.save(filename)
    return filename
  } finally {
    document.body.removeChild(host)
  }
}
