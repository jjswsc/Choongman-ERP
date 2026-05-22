/**
 * 배달앱·카드 채널 정산서 CSV (NET/GROSS/FEE)
 * 헤더 자동 인식 + CM 표준 헤더
 */

import {
  normalizePosChannelSettlementChannel,
  roundSettlementMoney,
  type PosChannelSettlementChannel,
} from '@/lib/pos-channel-settlement'

export type ParsedChannelSettlementRow = {
  storeCode: string
  settleDate: string
  channel: PosChannelSettlementChannel
  gross: number
  net: number
  fee: number
  memo?: string
}

export type ParseChannelSettlementCsvResult = {
  rows: ParsedChannelSettlementRow[]
  errors: string[]
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if ((c === ',' || c === '\t' || c === ';') && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else current += c
  }
  result.push(current.trim())
  return result
}

function parseAmount(s: string): number {
  const cleaned = String(s || '')
    .replace(/[฿\s]/g, '')
    .replace(/,/g, '')
    .trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function normalizeDate(raw: string): string {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/)
  if (dmy) {
    const y = dmy[3].length === 2 ? (Number(dmy[3]) >= 50 ? `19${dmy[3]}` : `20${dmy[3]}`) : dmy[3]
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  return ''
}

function detectChannel(text: string): PosChannelSettlementChannel | null {
  const t = String(text || '').toLowerCase()
  if (/\bgrab\b/.test(t)) return 'grab'
  if (/\b(line\s*man|lineman)\b/.test(t)) return 'lineman'
  if (/\bshopee\b/.test(t)) return 'shopee'
  if (/\b(card|credit|visa|master)\b/.test(t) || /카드/.test(t)) return 'card'
  const n = normalizePosChannelSettlementChannel(t)
  return n
}

function headerIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase()
    if (patterns.some((p) => p.test(h))) return i
  }
  return -1
}

export function parseChannelSettlementCsv(
  content: string,
  defaults: { storeCode?: string; settleDate?: string }
): ParseChannelSettlementCsvResult {
  const errors: string[] = []
  const rows: ParsedChannelSettlementRow[] = []
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) {
    return { rows: [], errors: ['EMPTY_FILE'] }
  }

  let headerRow = -1
  let cols: string[] = []
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const parts = parseCsvLine(lines[i])
    const joined = parts.join(' ').toLowerCase()
    if (
      /channel|채널|grab|lineman|gross|net|fee|매출|입금|정산|settle/.test(joined) &&
      parts.length >= 3
    ) {
      headerRow = i
      cols = parts.map((c) => c.toLowerCase())
      break
    }
  }

  const defaultStore = String(defaults.storeCode || '').trim()
  const defaultDate = String(defaults.settleDate || '').slice(0, 10)

  if (headerRow >= 0) {
    const idxDate = headerIndex(cols, [/date|일자|날짜|settle|정산/])
    const idxStore = headerIndex(cols, [/store|매장|branch/])
    const idxChannel = headerIndex(cols, [/channel|채널|app|플랫폼/])
    const idxGross = headerIndex(cols, [/gross|sales|매출|total.*sales|gmv/])
    const idxNet = headerIndex(cols, [/net|payout|입금|deposit|정산.*금|받은/])
    const idxFee = headerIndex(cols, [/fee|commission|수수료|gp|차감/])

    for (let i = headerRow + 1; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i])
      if (!parts.some((p) => p.trim())) continue

      const storeCode =
        (idxStore >= 0 ? String(parts[idxStore] || '').trim() : '') || defaultStore
      const settleDate =
        (idxDate >= 0 ? normalizeDate(parts[idxDate]) : '') || defaultDate
      const channelRaw = idxChannel >= 0 ? parts[idxChannel] : parts[0]
      const channel = detectChannel(channelRaw)
      const gross = idxGross >= 0 ? parseAmount(parts[idxGross]) : 0
      const net = idxNet >= 0 ? parseAmount(parts[idxNet]) : 0
      const fee = idxFee >= 0 ? parseAmount(parts[idxFee]) : 0

      if (!storeCode || !settleDate || !channel) {
        errors.push(`ROW_${i + 1}:MISSING_STORE_DATE_CHANNEL`)
        continue
      }
      let g = roundSettlementMoney(gross)
      const n = roundSettlementMoney(net)
      let f = roundSettlementMoney(fee)
      if (g <= 0 && n > 0 && f > 0) g = roundSettlementMoney(n + f)
      if (g <= 0 && n > 0 && f <= 0) g = roundSettlementMoney(n)
      if (f <= 0 && g > 0 && n >= 0) f = roundSettlementMoney(Math.max(0, g - n))
      if (g <= 0 || n < 0) {
        errors.push(`ROW_${i + 1}:INVALID_AMOUNTS`)
        continue
      }
      if (Math.abs(g - f - n) > 0.05) {
        errors.push(`ROW_${i + 1}:GROSS_FEE_NET_MISMATCH`)
        continue
      }
      rows.push({
        storeCode,
        settleDate,
        channel,
        gross: g,
        net: n,
        fee: f,
        memo: 'CSV import',
      })
    }
    return { rows, errors }
  }

  /** 헤더 없음: 한 줄 요약 (channel,gross,net) 또는 gross,net 두 숫자 */
  const parts = parseCsvLine(lines[0])
  if (parts.length >= 2) {
    const ch = detectChannel(parts[0]) || (defaultStore ? 'grab' : null)
    const a = parseAmount(parts[parts.length - 2])
    const b = parseAmount(parts[parts.length - 1])
    const channel = ch || normalizePosChannelSettlementChannel(parts[0])
    if (channel && defaultStore && defaultDate) {
      const g = roundSettlementMoney(Math.max(a, b))
      const n = roundSettlementMoney(Math.min(a, b))
      const f = roundSettlementMoney(g - n)
      rows.push({
        storeCode: defaultStore,
        settleDate: defaultDate,
        channel,
        gross: g,
        net: n,
        fee: f,
        memo: 'CSV import (single row)',
      })
    }
  }

  if (!rows.length && !errors.length) {
    errors.push('UNRECOGNIZED_FORMAT')
  }
  return { rows, errors }
}
