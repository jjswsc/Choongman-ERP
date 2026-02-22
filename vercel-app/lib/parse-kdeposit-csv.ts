/**
 * K-DEPOSIT (Kasikorn Bank) CSV 파서
 * 은행에서 다운받은 거래내역 CSV 파싱
 */

export interface KDepositParsedRow {
  transDate: string
  transType: "deposit" | "withdraw"
  amount: number
  memo: string
  rawDescription: string
  rawDetails: string
}

export interface KDepositParsedResult {
  beginningBalance: number
  endingBalance: number
  periodStart: string
  periodEnd: string
  accountNumber: string
  rows: KDepositParsedRow[]
  totalDeposits: number
  totalWithdrawals: number
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if (c === "," && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += c
    }
  }
  result.push(current.trim())
  return result
}

function parseAmount(s: string): number {
  if (!s) return 0
  const cleaned = String(s).replace(/,/g, "").trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function parseDate(ddMmYy: string): string {
  const m = ddMmYy.match(/^(\d{2})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  const yy = m[3]
  const year = parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`
  return `${year}-${m[2]}-${m[1]}`
}

export function parseKDepositCsv(content: string): KDepositParsedResult {
  const lines = content.split(/\r?\n/)
  let beginningBalance = 0
  let endingBalance = 0
  let periodStart = ""
  let periodEnd = ""
  let accountNumber = ""
  const rows: KDepositParsedRow[] = []

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i]
    if (line.includes("ENDING BALANCE")) {
      const m = line.match(/"([\d,]+\.?\d*)"/)
      if (m) endingBalance = parseAmount(m[1])
    }
    if (line.includes("Account Number")) {
      const m = line.match(/Account Number,{2,}(\d[\d\-]+)/)
      if (m) accountNumber = m[1].trim()
    }
    if (line.includes("Period") && line.includes("/")) {
      const m = line.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/)
      if (m) {
        periodStart = `${m[3]}-${m[2]}-${m[1]}`
        periodEnd = `${m[6]}-${m[5]}-${m[4]}`
      }
    }
  }

  const dataStartIdx = lines.findIndex((l) => /^,\d{2}-\d{2}-\d{2},/.test(l))
  if (dataStartIdx < 0) return { beginningBalance, endingBalance, periodStart, periodEnd, accountNumber, rows: [], totalDeposits: 0, totalWithdrawals: 0 }

  let totalDeposits = 0
  let totalWithdrawals = 0

  for (let i = dataStartIdx; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue

    const cols = parseCsvLine(line)
    if (cols.length < 7) continue

    const dateStr = cols[1] || ""
    const desc = (cols[3] || "").trim()
    const withdrawalStr = (cols[4] || "").replace(/"/g, "")
    const depositStr = (cols[6] || "").replace(/"/g, "")
    const details = (cols[11] || cols[12] || "").trim()

    if (!dateStr || !/^\d{2}-\d{2}-\d{2}$/.test(dateStr)) continue

    if (desc === "Beginning Balance") {
      const balStr = (cols[8] || "").replace(/"/g, "")
      beginningBalance = parseAmount(balStr)
      continue
    }

    const withdrawal = parseAmount(withdrawalStr)
    const deposit = parseAmount(depositStr)

    if (withdrawal > 0) {
      rows.push({
        transDate: parseDate(dateStr),
        transType: "withdraw",
        amount: withdrawal,
        memo: desc + (details ? ` | ${details}` : ""),
        rawDescription: desc,
        rawDetails: details,
      })
      totalWithdrawals += withdrawal
    } else if (deposit > 0) {
      rows.push({
        transDate: parseDate(dateStr),
        transType: "deposit",
        amount: deposit,
        memo: desc + (details ? ` | ${details}` : ""),
        rawDescription: desc,
        rawDetails: details,
      })
      totalDeposits += deposit
    }
  }

  return {
    beginningBalance,
    endingBalance,
    periodStart,
    periodEnd,
    accountNumber,
    rows,
    totalDeposits,
    totalWithdrawals,
  }
}
