import * as XLSX from 'xlsx'
import { writeErpXlsxWorkbook } from '@/lib/erp-excel-export'
import type { PosSalesHierarchyLevel, PosSalesHierarchyRow } from '@/lib/api-client'
import { sanitizeFilenamePart } from '@/lib/income-statement-export'
import type { PosOrderTypeValue } from '@/lib/pos-sales-order-type-filter'
import type { TotalSalesChannelCompareRow } from '@/lib/pos-sales-menu-hierarchy-compare'

const LEVEL_ORDER: PosSalesHierarchyLevel[] = ['main', 'category', 'menu', 'option']

export function buildTotalSalesExportFilename(parts: {
  startStr: string
  endStr: string
  storePart: string
}): string {
  return `total-sales_${sanitizeFilenamePart(parts.startStr)}_${sanitizeFilenamePart(parts.endStr)}_${sanitizeFilenamePart(parts.storePart)}.xlsx`
}

export async function downloadTotalSalesHierarchyXlsx(params: {
  filename: string
  metaRows: string[][]
  sheetNames: Record<PosSalesHierarchyLevel, string>
  col: {
    no: string
    name: string
    main: string
    category: string
    qty: string
    sales: string
  }
  levels: Record<PosSalesHierarchyLevel, PosSalesHierarchyRow[]>
}): Promise<void> {
  const wb = XLSX.utils.book_new()

  for (const level of LEVEL_ORDER) {
    const rows = params.levels[level] ?? []
    const aoa: (string | number)[][] = [...params.metaRows, []]

    if (level === 'main') {
      aoa.push([params.col.no, params.col.name, params.col.qty, params.col.sales])
      rows.forEach((r, i) => {
        aoa.push([i + 1, r.label, r.qty, Math.round(r.sales)])
      })
    } else if (level === 'category') {
      aoa.push([params.col.no, params.col.name, params.col.main, params.col.qty, params.col.sales])
      rows.forEach((r, i) => {
        aoa.push([i + 1, r.label, r.categoryMain ?? '', r.qty, Math.round(r.sales)])
      })
    } else {
      aoa.push([
        params.col.no,
        params.col.name,
        params.col.main,
        params.col.category,
        params.col.qty,
        params.col.sales,
      ])
      rows.forEach((r, i) => {
        aoa.push([
          i + 1,
          r.label,
          r.categoryMain ?? '',
          r.category ?? '',
          r.qty,
          Math.round(r.sales),
        ])
      })
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 18 }, { wch: 22 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, ws, params.sheetNames[level].slice(0, 31))
  }

  await writeErpXlsxWorkbook(wb, params.filename)
}

export async function downloadTotalSalesChannelCompareXlsx(params: {
  filename: string
  metaRows: string[][]
  sheetNames: Record<PosSalesHierarchyLevel, string>
  col: {
    no: string
    name: string
    main: string
    category: string
    qty: string
    sales: string
  }
  channelLabels: Record<PosOrderTypeValue, string>
  channels: PosOrderTypeValue[]
  compareByLevel: Record<PosSalesHierarchyLevel, TotalSalesChannelCompareRow[]>
}): Promise<void> {
  const wb = XLSX.utils.book_new()

  for (const level of LEVEL_ORDER) {
    const rows = params.compareByLevel[level] ?? []
    const header: string[] = [params.col.no, params.col.name]
    if (level !== 'main') header.push(params.col.main)
    if (level === 'menu' || level === 'option') header.push(params.col.category)
    for (const ch of params.channels) {
      const label = params.channelLabels[ch]
      header.push(`${label} ${params.col.qty}`, `${label} ${params.col.sales}`)
    }
    header.push(`Σ ${params.col.qty}`, `Σ ${params.col.sales}`)

    const aoa: (string | number)[][] = [...params.metaRows, [], header]
    rows.forEach((r, i) => {
      const line: (string | number)[] = [i + 1, r.label]
      if (level !== 'main') line.push(r.categoryMain ?? '')
      if (level === 'menu' || level === 'option') line.push(r.category ?? '')
      for (const ch of params.channels) {
        const c = r.channels[ch]
        line.push(c?.qty ?? 0, Math.round(c?.sales ?? 0))
      }
      line.push(r.totalQty, Math.round(r.totalSales))
      aoa.push(line)
    })

    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, `${params.sheetNames[level]}`.slice(0, 31))
  }

  await writeErpXlsxWorkbook(wb, params.filename)
}
