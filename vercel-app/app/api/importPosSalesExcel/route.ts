/**
 * POS 매출 상세 엑셀 업로드 → pos_sales_imports + pos_sales_details
 * FormData (file) 필수. 결제 금액 기준 매출 산출.
 * 수정(업로드)은 오피스 직원만 가능.
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabaseInsert, supabaseInsertMany } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

const COLS = {
  salesDatetime: 0,
  receiptNo: 1,
  void: 2,
  pos: 3,
  channel: 4,
  menuName: 6,
  barcode: 7,
  unitPrice: 8,
  qty: 9,
  menuSalePrice: 10,
  receiptTotal: 11,
  paymentAmount: 22,
  staff: 19,
  cash: 27,
  card: 28,
  lineDelivery: 34,
} as const

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''))
  return Number.isNaN(n) ? 0 : n
}

function parseDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).trim()
  if (!s) return null
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s*(\d{2})?:?(\d{2})?:?(\d{2})?/)
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', sec = '0'] = m
    return `${y}-${mo}-${d}T${h.padStart(2, '0')}:${mi.padStart(2, '0')}:${sec.padStart(2, '0')}.000Z`
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const ct = request.headers.get('content-type') || ''
    if (!ct.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, message: 'multipart/form-data 필요' }, { headers })
    }
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
    }

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0] || 'Sheet1']
    if (!ws) {
      return NextResponse.json({ success: false, message: '시트가 없습니다.' }, { headers })
    }
    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]
    if (data.length < 2) {
      return NextResponse.json({ success: false, message: '헤더 외 데이터가 없습니다.' }, { headers })
    }

    const rows: Record<string, unknown>[] = []
    let totalSales = 0
    let lastReceiptNo = ''
    const importId = crypto.randomUUID()

    for (let i = 1; i < data.length; i++) {
      const r = data[i] as unknown[]
      const receiptNo = String(r[COLS.receiptNo] ?? '').trim()
      if (!receiptNo) continue
      const dt = parseDate(r[COLS.salesDatetime])
      if (!dt) continue

      const paymentAmt = parseNum(r[COLS.paymentAmount])
      const isFirstRowOfReceipt = receiptNo !== lastReceiptNo
      if (isFirstRowOfReceipt) {
        lastReceiptNo = receiptNo
        totalSales += paymentAmt
      }

      rows.push({
        import_id: importId,
        sales_datetime: dt,
        receipt_no: receiptNo,
        is_void: String(r[COLS.void] ?? '').trim().toLowerCase() === 'void' || String(r[COLS.void]) === '1',
        pos: String(r[COLS.pos] ?? '').trim() || null,
        channel: String(r[COLS.channel] ?? '').trim() || null,
        menu_name: String(r[COLS.menuName] ?? '').trim() || null,
        barcode: String(r[COLS.barcode] ?? '').trim() || null,
        unit_price: parseNum(r[COLS.unitPrice]),
        qty: Math.max(0, Math.floor(parseNum(r[COLS.qty]))),
        menu_sale_price: parseNum(r[COLS.menuSalePrice]),
        receipt_total: parseNum(r[COLS.receiptTotal]),
        payment_amount: isFirstRowOfReceipt ? paymentAmt : 0,
        staff: String(r[COLS.staff] ?? '').trim() || null,
        cash: parseNum(r[COLS.cash]),
        card: parseNum(r[COLS.card]),
        line_delivery: parseNum(r[COLS.lineDelivery]),
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 행이 없습니다.' }, { headers })
    }

    const yearMonth = (() => {
      const firstDt = rows[0]?.sales_datetime as string
      if (firstDt) return firstDt.slice(0, 7)
      return new Date().toISOString().slice(0, 7)
    })()

    await supabaseInsert('pos_sales_imports', {
      id: importId,
      file_name: file.name,
      year_month: yearMonth,
      row_count: rows.length,
      total_sales: totalSales,
    })

    const chunkSize = 500
    for (let j = 0; j < rows.length; j += chunkSize) {
      const chunk = rows.slice(j, j + chunkSize)
      await supabaseInsertMany('pos_sales_details', chunk)
    }

    return NextResponse.json(
      {
        success: true,
        importId,
        yearMonth,
        rowCount: rows.length,
        totalSales,
        message: `${rows.length}건 등록 완료 (총 매출 ฿${totalSales.toLocaleString()})`,
      },
      { headers }
    )
  } catch (e) {
    console.error('importPosSalesExcel:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '가져오기 실패' },
      { headers }
    )
  }
}
