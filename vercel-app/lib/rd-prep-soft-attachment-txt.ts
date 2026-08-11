/**
 * RD Prep 소프트 매핑용 TXT (pipe `|`, UTF-8, CRLF)
 *
 * 샘플:
 * |seq|tin||name|addr1|addr2|addr3||||dd/mm/yyyy|incomeDesc|rate|gross|wht|1
 */

export type RdPrepSoftAttachmentRow = {
  payee_name?: string | null
  payee_tax_id?: string | null
  payee_address?: string | null
  payment_date?: string | null
  income_type?: string | null
  wht_rate?: number | string | null
  gross_amount?: number | string | null
  wht_amount?: number | string | null
}

export type RdPrepSoftAttachmentTxtOptions = {
  includeHeader?: boolean
}

function pipeSafe(v: unknown): string {
  return String(v ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/[|]/g, ' ')
    .trim()
}

function digitsOnly(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function formatAmount(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

function toChristianDdMmYyyy(v: unknown): string {
  const s = String(v ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const y = Number(s.slice(0, 4))
  const m = s.slice(5, 7)
  const d = s.slice(8, 10)
  if (!Number.isFinite(y)) return ''
  return `${d}/${m}/${String(y)}`
}

function resolveWhtRatePercent(row: RdPrepSoftAttachmentRow): number {
  const fromCol = Number(row.wht_rate)
  if (Number.isFinite(fromCol) && fromCol >= 0) return fromCol
  const gross = Number(row.gross_amount)
  const wht = Number(row.wht_amount)
  if (Number.isFinite(gross) && gross > 0 && Number.isFinite(wht) && wht >= 0) {
    return (wht / gross) * 100
  }
  return 0
}

function formatRateField(rate: number): string {
  if (!Number.isFinite(rate)) return '0.0'
  return (Math.round(rate * 10) / 10).toFixed(1)
}

function formatIncomeDesc(incomeType: string, rate: number): string {
  const base = pipeSafe(incomeType)
  if (!base) return ''
  if (/%/.test(base)) return base
  const rounded = Math.round(rate * 10) / 10
  const pct = Number.isInteger(rounded) ? String(rounded) : String(rounded)
  return `${base} ${pct}%`
}

/** 주소를 약 35자 단위로 3칸 분할 */
export function splitPayeeAddressParts(address: unknown): [string, string, string] {
  const raw = pipeSafe(address)
  if (!raw) return ['', '', '']
  const maxLen = 35
  const parts: string[] = []
  let rest = raw
  for (let i = 0; i < 3 && rest; i++) {
    if (rest.length <= maxLen || i === 2) {
      parts.push(rest.slice(0, i === 2 ? 80 : maxLen).trim())
      rest = ''
      break
    }
    let cut = maxLen
    const window = rest.slice(0, maxLen + 1)
    const sp = Math.max(window.lastIndexOf(' '), window.lastIndexOf('/'), window.lastIndexOf(','))
    if (sp >= 12) cut = sp
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  while (parts.length < 3) parts.push('')
  return [parts[0] || '', parts[1] || '', parts[2] || '']
}

export function ledgerRowsToRdPrepSoftAttachmentTxt(
  rows: RdPrepSoftAttachmentRow[],
  opts: RdPrepSoftAttachmentTxtOptions = {}
): string {
  const includeHeader = opts.includeHeader === true
  const headerFields = [
    'seq',
    'payee_tax_id',
    'payee_branch',
    'payee_name',
    'address1',
    'address2',
    'address3',
    'empty1',
    'empty2',
    'empty3',
    'empty4',
    'payment_date',
    'income_desc',
    'wht_rate',
    'gross_amount',
    'withheld_amount',
    'pay_condition',
  ]

  const lines: string[] = []
  if (includeHeader) lines.push('|' + headerFields.join('|'))

  ;(rows || []).forEach((row, idx) => {
    const rate = resolveWhtRatePercent(row)
    const [addr1, addr2, addr3] = splitPayeeAddressParts(row.payee_address)
    const fields = [
      String(idx + 1),
      digitsOnly(row.payee_tax_id).slice(0, 13),
      '',
      pipeSafe(row.payee_name),
      addr1,
      addr2,
      addr3,
      '',
      '',
      '',
      '',
      toChristianDdMmYyyy(row.payment_date),
      formatIncomeDesc(String(row.income_type ?? ''), rate),
      formatRateField(rate),
      formatAmount(row.gross_amount),
      formatAmount(row.wht_amount),
      '1',
    ]
    lines.push('|' + fields.join('|'))
  })

  return lines.join('\r\n')
}
