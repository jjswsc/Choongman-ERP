/**
 * 감사 재무제표(DBD용) 스냅샷 — 세무 장부 Flow 기초(7/1)와 별도.
 * 전년 비교·이월 검증용. S&J/Jinwon/ACT는 7/1 기초가 이미 있으므로
 * 여기 숫자를 다시 tax_opening으로 넣지 않는다.
 */
import { accountLine } from '@/lib/chart-of-accounts-mapping'
import { roundTaxAmount, taxJournalBalanced, type TaxJournalLineDraft } from '@/lib/tax-book'

export type AuditedBalanceSheet = {
  cash: number
  tradeAndOtherReceivables: number
  inventories: number
  equipmentNet: number
  tradeAndOtherPayables: number
  shortTermLoansRelatedParties: number
  shareCapital: number
  /** 음수 = 결손(미처분 누적) */
  retainedEarnings: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
}

export type AuditedIncomeStatement = {
  revenueSalesOrService: number
  otherIncome: number
  totalRevenue: number
  costOfSalesOrService: number
  administrativeExpenses: number
  totalExpenses: number
  profitBeforeTax: number
  incomeTaxExpense: number
  netIncome: number
}

export type AuditedFinancialStatementSnapshot = {
  taxId: string
  taxEntityCode: string
  entityNameTh: string
  entityNameEn: string
  /** 회계연도 종료일 (그레고리력) */
  fiscalYearEnd: string
  /** 불기 연도 표기 (예: 2568) */
  fiscalYearBe: number
  periodStart: string
  periodEnd: string
  sourceLabel: string
  bs: AuditedBalanceSheet
  pl: AuditedIncomeStatement
  priorBs?: AuditedBalanceSheet | null
  priorPl?: AuditedIncomeStatement | null
}

/** 감사 BS 요약 → 세무 기초 분개(ERP 계정). 재고 없으면 inventories=0. */
export function buildOpeningLinesFromAuditedBs(bs: AuditedBalanceSheet): TaxJournalLineDraft[] {
  const buckets: Record<string, { debit: number; credit: number }> = {}
  const add = (code: string, debit: number, credit: number) => {
    if (!buckets[code]) buckets[code] = { debit: 0, credit: 0 }
    buckets[code].debit += debit
    buckets[code].credit += credit
  }

  const cash = roundTaxAmount(bs.cash)
  const ar = roundTaxAmount(bs.tradeAndOtherReceivables)
  const inv = roundTaxAmount(bs.inventories)
  const ppe = roundTaxAmount(bs.equipmentNet)
  const ap = roundTaxAmount(bs.tradeAndOtherPayables)
  const loans = roundTaxAmount(bs.shortTermLoansRelatedParties)
  const capital = roundTaxAmount(bs.shareCapital)
  const re = roundTaxAmount(bs.retainedEarnings)

  if (cash > 0.005) add('1010', cash, 0)
  if (ar > 0.005) add('1130', ar, 0)
  if (inv > 0.005) add('1460', inv, 0)
  if (ppe > 0.005) add('1490', ppe, 0)
  if (ap > 0.005) add('2110', 0, ap)
  if (loans > 0.005) add('2150', 0, loans)
  if (capital > 0.005) add('3110', 0, capital)
  if (re > 0.005) add('3120', 0, re)
  else if (re < -0.005) add('3120', -re, 0)

  let debit = 0
  let credit = 0
  for (const b of Object.values(buckets)) {
    const net = b.debit - b.credit
    if (net > 0.005) debit += net
    else if (net < -0.005) credit += -net
  }
  const diff = roundTaxAmount(debit - credit)
  if (Math.abs(diff) >= 0.005) {
    if (!buckets['3120']) buckets['3120'] = { debit: 0, credit: 0 }
    if (diff > 0) buckets['3120'].credit += diff
    else buckets['3120'].debit += -diff
  }

  const lines: TaxJournalLineDraft[] = []
  for (const code of Object.keys(buckets).sort()) {
    const b = buckets[code]
    const net = roundTaxAmount(b.debit - b.credit)
    if (Math.abs(net) < 0.005) continue
    const meta = accountLine(code)
    lines.push({
      accountCode: code,
      accountName: meta.accountName,
      side: net > 0 ? 'debit' : 'credit',
      amount: Math.abs(net),
    })
  }
  if (!taxJournalBalanced(lines)) throw new Error('UNBALANCED_AUDITED_BS_OPENING')
  return lines
}

/** 설립 시점(자본금만) — ACT 등 첫 해 */
export function incorporationOpeningBs(shareCapital: number): AuditedBalanceSheet {
  const cap = roundTaxAmount(shareCapital)
  return {
    cash: cap,
    tradeAndOtherReceivables: 0,
    inventories: 0,
    equipmentNet: 0,
    tradeAndOtherPayables: 0,
    shortTermLoansRelatedParties: 0,
    shareCapital: cap,
    retainedEarnings: 0,
    totalAssets: cap,
    totalLiabilities: 0,
    totalEquity: cap,
  }
}

function pushDelta(
  buckets: Record<string, { debit: number; credit: number }>,
  code: string,
  delta: number,
  normal: 'debit' | 'credit'
) {
  const d = roundTaxAmount(delta)
  if (Math.abs(d) < 0.005) return
  if (!buckets[code]) buckets[code] = { debit: 0, credit: 0 }
  // 자산 정상차변: 증가=차변. 부채·자본 정상대변: 증가=대변.
  if (normal === 'debit') {
    if (d > 0) buckets[code].debit += d
    else buckets[code].credit += -d
  } else if (d > 0) {
    buckets[code].credit += d
  } else {
    buckets[code].debit += -d
  }
}

/**
 * 전기 말 BS → 당기 말 BS 증감(이익잉여금 제외) + 당기 손익 계정.
 * 항등식 Δ자산−Δ부채 = 당기순손익 이므로 차대가 맞는다. RE는 기초에만 두고 미마감 손익으로 남긴다.
 */
export function buildAuditedYearActivityLines(input: {
  openingBs: AuditedBalanceSheet
  endingBs: AuditedBalanceSheet
  pl: AuditedIncomeStatement
}): TaxJournalLineDraft[] {
  const o = input.openingBs
  const e = input.endingBs
  const pl = input.pl
  const buckets: Record<string, { debit: number; credit: number }> = {}

  pushDelta(buckets, '1010', e.cash - o.cash, 'debit')
  pushDelta(buckets, '1130', e.tradeAndOtherReceivables - o.tradeAndOtherReceivables, 'debit')
  pushDelta(buckets, '1460', e.inventories - o.inventories, 'debit')
  pushDelta(buckets, '1490', e.equipmentNet - o.equipmentNet, 'debit')
  pushDelta(buckets, '2110', e.tradeAndOtherPayables - o.tradeAndOtherPayables, 'credit')
  pushDelta(buckets, '2150', e.shortTermLoansRelatedParties - o.shortTermLoansRelatedParties, 'credit')
  pushDelta(buckets, '3110', e.shareCapital - o.shareCapital, 'credit')
  // retainedEarnings 증감은 넣지 않음 — 손익 계정이 미마감 순이익으로 대체

  const rev = roundTaxAmount(pl.revenueSalesOrService)
  const other = roundTaxAmount(pl.otherIncome)
  const cogs = roundTaxAmount(pl.costOfSalesOrService)
  const admin = roundTaxAmount(pl.administrativeExpenses)
  const tax = roundTaxAmount(pl.incomeTaxExpense)
  if (rev > 0.005) {
    if (!buckets['4110']) buckets['4110'] = { debit: 0, credit: 0 }
    buckets['4110'].credit += rev
  }
  if (other > 0.005) {
    if (!buckets['4191']) buckets['4191'] = { debit: 0, credit: 0 }
    buckets['4191'].credit += other
  }
  if (cogs > 0.005) {
    if (!buckets['5110']) buckets['5110'] = { debit: 0, credit: 0 }
    buckets['5110'].debit += cogs
  }
  if (admin > 0.005) {
    if (!buckets['5520']) buckets['5520'] = { debit: 0, credit: 0 }
    buckets['5520'].debit += admin
  }
  if (tax > 0.005) {
    // 차트에 법인세비용 전용 코드가 없어 기타경비로 구분(계정명 오버라이드)
    if (!buckets['5520']) buckets['5520'] = { debit: 0, credit: 0 }
    buckets['5520'].debit += tax
  }

  let debit = 0
  let credit = 0
  for (const b of Object.values(buckets)) {
    const net = b.debit - b.credit
    if (net > 0.005) debit += net
    else if (net < -0.005) credit += -net
  }
  const diff = roundTaxAmount(debit - credit)
  if (Math.abs(diff) >= 0.005) {
    if (!buckets['3120']) buckets['3120'] = { debit: 0, credit: 0 }
    if (diff > 0) buckets['3120'].credit += diff
    else buckets['3120'].debit += -diff
  }

  const nameOverride: Record<string, string> = {
    '5520': tax > 0.005 ? '관리비·법인세비용' : '관리비',
  }

  const lines: TaxJournalLineDraft[] = []
  for (const code of Object.keys(buckets).sort()) {
    const b = buckets[code]
    const net = roundTaxAmount(b.debit - b.credit)
    if (Math.abs(net) < 0.005) continue
    const meta = accountLine(code)
    lines.push({
      accountCode: code,
      accountName: nameOverride[code] || meta.accountName,
      side: net > 0 ? 'debit' : 'credit',
      amount: Math.abs(net),
    })
  }
  if (!taxJournalBalanced(lines)) throw new Error('UNBALANCED_AUDITED_YEAR_ACTIVITY')
  return lines
}

export const AUDITED_FS_FY2568: AuditedFinancialStatementSnapshot[] = [
  {
    taxId: '0105566137147',
    taxEntityCode: 'tin:0105566137147',
    entityNameTh: 'บริษัท เอสแอนด์เจ โกลบอล จำกัด',
    entityNameEn: 'S&J Global Co., Ltd.',
    fiscalYearEnd: '2025-12-31',
    fiscalYearBe: 2568,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    sourceLabel: 'Audited FS BSPL68 S&J Global YE2568',
    bs: {
      cash: 2379160.91,
      tradeAndOtherReceivables: 1967132.94,
      inventories: 6117698.34,
      equipmentNet: 329971.16,
      tradeAndOtherPayables: 8000704.74,
      shortTermLoansRelatedParties: 10228589.1,
      shareCapital: 2000000,
      retainedEarnings: -9435330.49,
      totalAssets: 10793963.35,
      totalLiabilities: 18229293.84,
      totalEquity: -7435330.49,
    },
    pl: {
      revenueSalesOrService: 35466997.6,
      otherIncome: 134789.97,
      totalRevenue: 35601787.57,
      costOfSalesOrService: 27297580.75,
      administrativeExpenses: 10303098.42,
      totalExpenses: 37600679.17,
      profitBeforeTax: -1998891.6,
      incomeTaxExpense: 0,
      netIncome: -1998891.6,
    },
    priorBs: {
      cash: 527995.53,
      tradeAndOtherReceivables: 2074343.65,
      inventories: 1298332.29,
      equipmentNet: 225952.55,
      tradeAndOtherPayables: 3384473.81,
      shortTermLoansRelatedParties: 6178589.1,
      shareCapital: 2000000,
      retainedEarnings: -7436438.89,
      totalAssets: 4126624.02,
      totalLiabilities: 9563062.91,
      totalEquity: -5436438.89,
    },
    priorPl: {
      revenueSalesOrService: 26894513.11,
      otherIncome: 7267.13,
      totalRevenue: 26901780.24,
      costOfSalesOrService: 23784325.83,
      administrativeExpenses: 9452351.95,
      totalExpenses: 33236677.78,
      profitBeforeTax: -6334897.54,
      incomeTaxExpense: 0,
      netIncome: -6334897.54,
    },
  },
  {
    taxId: '0105566228126',
    taxEntityCode: 'tin:0105566228126',
    entityNameTh: 'บริษัท จินวอน เอฟแอนด์บี จำกัด',
    entityNameEn: 'Jinwon F&B Co., Ltd.',
    fiscalYearEnd: '2025-12-31',
    fiscalYearBe: 2568,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    sourceLabel: 'Audited FS BSPL68 Jinwon F&B YE2568',
    bs: {
      cash: 559686.94,
      tradeAndOtherReceivables: 203716.91,
      inventories: 0,
      equipmentNet: 276781.27,
      tradeAndOtherPayables: 567572.62,
      shortTermLoansRelatedParties: 4028679.54,
      shareCapital: 1000000,
      retainedEarnings: -4556067.04,
      totalAssets: 1040185.12,
      totalLiabilities: 4596252.16,
      totalEquity: -3556067.04,
    },
    pl: {
      revenueSalesOrService: 24302686.23,
      otherIncome: 20871.93,
      totalRevenue: 24323558.16,
      costOfSalesOrService: 10854765.4,
      administrativeExpenses: 12515791.2,
      totalExpenses: 23370556.6,
      profitBeforeTax: 953001.56,
      incomeTaxExpense: 0,
      netIncome: 953001.56,
    },
    priorBs: {
      cash: 890296.73,
      tradeAndOtherReceivables: 111054.26,
      inventories: 0,
      equipmentNet: 160597.26,
      tradeAndOtherPayables: 625073.56,
      shortTermLoansRelatedParties: 5045943.29,
      shareCapital: 1000000,
      retainedEarnings: -5509068.6,
      totalAssets: 1161948.25,
      totalLiabilities: 5671016.85,
      totalEquity: -4509068.6,
    },
    priorPl: {
      revenueSalesOrService: 9110170.43,
      otherIncome: 47603.93,
      totalRevenue: 9157774.36,
      costOfSalesOrService: 6965889.67,
      administrativeExpenses: 7689953.29,
      totalExpenses: 14655842.96,
      profitBeforeTax: -5498068.6,
      incomeTaxExpense: 0,
      netIncome: -5498068.6,
    },
  },
  {
    taxId: '0105568080622',
    taxEntityCode: 'tin:0105568080622',
    entityNameTh: 'บริษัท เอเชีย คอมเมิร์ส แอนด์ เทรด จำกัด',
    entityNameEn: 'Asia Commerce & Trade Co., Ltd.',
    fiscalYearEnd: '2025-12-31',
    fiscalYearBe: 2568,
    periodStart: '2025-04-22',
    periodEnd: '2025-12-31',
    sourceLabel: 'Audited FS BSPL68 ACT YE2568 (incorporation period)',
    bs: {
      cash: 1323288.09,
      tradeAndOtherReceivables: 1544617.65,
      inventories: 0,
      equipmentNet: 26760.62,
      tradeAndOtherPayables: 18390.91,
      shortTermLoansRelatedParties: 2694458.81,
      shareCapital: 1000000,
      retainedEarnings: -818183.36,
      totalAssets: 2894666.36,
      totalLiabilities: 2712849.72,
      totalEquity: 181816.64,
    },
    pl: {
      revenueSalesOrService: 12316983.78,
      otherIncome: 0,
      totalRevenue: 12316983.78,
      costOfSalesOrService: 8272671.06,
      administrativeExpenses: 4862496.08,
      totalExpenses: 13135167.14,
      profitBeforeTax: -818183.36,
      incomeTaxExpense: 0,
      netIncome: -818183.36,
    },
    priorBs: null,
    priorPl: null,
  },
  {
    // 법인 상호는 Bangna Bizzo이나, 현재 영업 매장은 CM Union Mall.
    // 예전 방나 직영에 쓰던 법인을 유니온몰 인수 시 이전. 현재 CM Bangna는 가맹(K Market) 별도 법인.
    taxId: '0105563161764',
    taxEntityCode: 'tin:0105563161764',
    entityNameTh: 'บริษัท ชุงมัน ชิคเค่น บางนา บิซโซ จำกัด',
    entityNameEn: 'Choongman Chicken Bangna Bizzo Co., Ltd. (Union Mall)',
    fiscalYearEnd: '2025-12-31',
    fiscalYearBe: 2568,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31',
    sourceLabel: 'Audited FS BSPL68 Bangna Bizzo YE2568 — operating store CM Union Mall (not CM Bangna)',
    bs: {
      cash: 299915.41,
      tradeAndOtherReceivables: 395949.66,
      inventories: 0,
      equipmentNet: 2216070.55,
      tradeAndOtherPayables: 22094.45,
      shortTermLoansRelatedParties: 4944601.63,
      shareCapital: 1000000,
      retainedEarnings: -3054760.46,
      totalAssets: 2911935.62,
      totalLiabilities: 4966696.08,
      totalEquity: -2054760.46,
    },
    pl: {
      revenueSalesOrService: 7583417.78,
      otherIncome: 800,
      totalRevenue: 7584217.78,
      costOfSalesOrService: 3983530.44,
      administrativeExpenses: 5458153.6,
      totalExpenses: 9441684.04,
      profitBeforeTax: -1857466.26,
      incomeTaxExpense: 0,
      netIncome: -1857466.26,
    },
    priorBs: {
      cash: 427880.19,
      tradeAndOtherReceivables: 299816.14,
      inventories: 0,
      equipmentNet: 225801.99,
      tradeAndOtherPayables: 50792.52,
      shortTermLoansRelatedParties: 1100000,
      shareCapital: 1000000,
      retainedEarnings: -1197294.2,
      totalAssets: 953498.32,
      totalLiabilities: 1150792.52,
      totalEquity: -197294.2,
    },
    priorPl: {
      revenueSalesOrService: 10620009.32,
      otherIncome: 7310.96,
      totalRevenue: 10627320.28,
      costOfSalesOrService: 9298885.14,
      administrativeExpenses: 945632.61,
      totalExpenses: 10244517.75,
      profitBeforeTax: 382802.53,
      incomeTaxExpense: 16250.87,
      netIncome: 366551.66,
    },
  },
]

export function auditedFsByTaxId(taxId: string): AuditedFinancialStatementSnapshot | undefined {
  const id = String(taxId || '').trim()
  return AUDITED_FS_FY2568.find((r) => r.taxId === id)
}

/** 법인 TIN — 상호 Bangna Bizzo, 영업 매장은 CM Union Mall */
export const BANGNA_BIZZO_TAX_ID = '0105563161764'
export const BANGNA_BIZZO_TAX_ENTITY = 'tin:0105563161764'
export const BANGNA_BIZZO_OPENING_DATE = '2026-01-01'
/** 이 법인이 실제로 묶인 POS/세무 매장 코드 (CM Bangna 아님) */
export const BANGNA_BIZZO_OPERATING_STORE = 'CM Union Mall'
