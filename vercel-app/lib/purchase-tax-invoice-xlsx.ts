/**
 * ภาษีซื้อ 직원 템플릿 — 8열 태국어 엑셀 (RD Prep 영문 검수용과 별도)
 */
import { utils, type WorkBook } from 'xlsx'
import { applyErpDownloadFontToWorkbook } from '@/lib/erp-excel-export'
import {
  gregorianYmdToBuddhistHint,
  PURCHASE_TAX_INVOICE_EXCEL_HEADERS,
  type PurchaseTaxInvoiceRow,
} from '@/lib/purchase-tax-invoice-core'

export function buildPurchaseTaxInvoiceThaiAoa(rows: PurchaseTaxInvoiceRow[]): (string | number)[][] {
  const header = [...PURCHASE_TAX_INVOICE_EXCEL_HEADERS]
  const body = [...rows]
    .sort((a, b) => {
      const da = String(a.docDate || '')
      const db = String(b.docDate || '')
      if (da !== db) return da.localeCompare(db)
      return String(a.invoiceNo || '').localeCompare(String(b.invoiceNo || ''))
    })
    .map((r, i) => [
      i + 1,
      String(r.docDate || '').slice(0, 10),
      String(r.invoiceNo || ''),
      String(r.sellerName || ''),
      String(r.sellerTaxId || ''),
      String(r.sellerBranch || ''),
      Number(r.netAmount) || 0,
      Number(r.vatAmount) || 0,
    ])
  return [header, ...body]
}

export function buildPurchaseTaxInvoiceThaiWorkbook(rows: PurchaseTaxInvoiceRow[], opts?: { taxMonth?: string }): WorkBook {
  const aoa = buildPurchaseTaxInvoiceThaiAoa(rows)
  const month = String(opts?.taxMonth || rows[0]?.taxMonth || '').slice(0, 7)
  const y = Number(month.slice(0, 4))
  const beHint = Number.isFinite(y) && y >= 1900 ? gregorianYmdToBuddhistHint(`${month}-01`) : 'ค.ศ. 2026 = พ.ศ. 2569'
  const note: (string | number)[][] = [
    ['คำอธิบาย'],
    ['วันที่ใบกำกับภาษี ในไฟล์นี้เป็น ค.ศ. เพื่อให้ Excel เรียงได้'],
    [beHint],
    ['มูลค่า = ฐานภาษี (ไม่รวมภาษี) — ไม่รวมสินค้ายกเว้น VAT'],
    ['สำเนาใบกำกับภาษี (เลขที่ซ้ำ) ไม่บันทึกซ้ำ'],
  ]
  const wb = utils.book_new()
  const sheet = utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 18 },
    { wch: 22 },
    { wch: 36 },
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
  ]
  utils.book_append_sheet(wb, sheet, 'ภาษีซื้อ')
  utils.book_append_sheet(wb, utils.aoa_to_sheet(note), 'คำอธิบาย')
  applyErpDownloadFontToWorkbook(wb)
  return wb
}

export function buildPurchaseTaxInvoiceThaiFilename(taxMonth: string, buyerTaxId?: string): string {
  const ym = String(taxMonth || '').slice(0, 7).replace('-', '')
  const tin = String(buyerTaxId || '').replace(/\D/g, '').slice(0, 13)
  const suffix = tin ? `_${tin}` : ''
  return `รายการใบกำกับภาษีซื้อ_${ym || 'export'}${suffix}.xlsx`
}
