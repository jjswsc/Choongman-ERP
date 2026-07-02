/**
 * 본사 창고 일별 입출고 — XLSX / CSV보내기
 */
import * as XLSX from 'xlsx'
import { writeErpXlsxWorkbook } from '@/lib/erp-excel-export'
import type {
  HqWarehouseDailyItemRow,
  HqWarehouseDayInvoice,
  HqWarehouseMovementColumn,
} from '@/lib/hq-warehouse-daily-stock-matrix'
import { formatYmdThaiBuddhist } from '@/lib/hq-warehouse-daily-stock-matrix-view'

type ExportLabels = {
  code: string
  name: string
  unit: string
  cost: string
  price: string
  beginning: string
  balance: string
  minQty: string
  totalIn: string
  totalOut: string
  avgDay: string
  avgWeek: string
  avgMonth: string
  orderPeriod: string
  costGoods: string
  priorOut: string
  outChange: string
  invoicesTitle: string
  invoiceNo: string
  taxInvoice: string
  receipt: string
  totalPrice: string
  subtotal: string
  vat: string
  grandTotal: string
  date: string
  store: string
}

function formatNum(n: number, maxFrac = 2): string {
  if (!Number.isFinite(n)) return '0'
  return Number(n.toFixed(maxFrac)).toLocaleString()
}

export async function exportStockDailyMatrixXlsx(params: {
  items: HqWarehouseDailyItemRow[]
  columns: HqWarehouseMovementColumn[]
  dayInvoices: HqWarehouseDayInvoice[]
  startStr: string
  endStr: string
  useThaiDate: boolean
  labels: ExportLabels
}) {
  const { items, columns, dayInvoices, startStr, endStr, useThaiDate, labels } = params
  const fmtDate = (ymd: string) => (ymd ? formatYmdThaiBuddhist(ymd, useThaiDate) : '')

  const headerRow: (string | number)[] = [
    labels.code,
    labels.name,
    labels.unit,
    labels.cost,
    labels.price,
    ...columns.map((c) => {
      const d = c.ymd ? fmtDate(c.ymd) : ''
      return d ? `${d} ${c.label}` : c.label
    }),
    labels.beginning,
    labels.balance,
    labels.minQty,
    labels.totalIn,
    labels.totalOut,
    labels.priorOut,
    labels.outChange,
    labels.avgDay,
    labels.avgWeek,
    labels.avgMonth,
    labels.orderPeriod,
    labels.costGoods,
  ]

  const dataRows: (string | number)[][] = items.map((row) => [
    row.code,
    row.name,
    row.unit,
    row.cost,
    row.price,
    ...columns.map((c) => row.cells[c.key] ?? ''),
    row.beginning,
    row.balance,
    row.minQty,
    row.totalIn,
    row.totalOut,
    row.priorTotalOut ?? '',
    row.outChangePct != null ? `${row.outChangePct}%` : '',
    row.avgOutPerDay,
    row.avgOutPerWeek,
    row.avgOutPerMonth,
    row.orderPeriodDays ?? '',
    row.costOfGoods,
  ])

  const invoiceRows: (string | number)[][] = []
  invoiceRows.push([])
  invoiceRows.push([labels.invoicesTitle])
  invoiceRows.push([labels.date, labels.store, labels.invoiceNo, labels.taxInvoice, labels.receipt, labels.totalPrice])
  for (const inv of dayInvoices) {
    invoiceRows.push([
      inv.ymd,
      inv.store,
      inv.invoiceNo,
      inv.invoiceNo,
      inv.invoiceNo,
      inv.grandTotal,
    ])
    invoiceRows.push(['', labels.subtotal, inv.subtotal, labels.vat, inv.vat])
  }

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows, ...invoiceRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'DailyStock')
  await writeErpXlsxWorkbook(wb, `hq_daily_stock_${startStr}_${endStr}.xlsx`)
}
