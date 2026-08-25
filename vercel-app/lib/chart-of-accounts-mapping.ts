/**
 * 계정과목·TFRS for NPAEs 정렬 참고 메타데이터 + 자동분개용 계정 해석.
 * journal_lines에 저장되는 표시명은 기존과 동일(한국어)으로 유지해 DB 연속성을 맞춤.
 */

export type AccountMeta = {
  code: string
  nameKo: string
  nameEn: string
  tfrsNpaesGroupKo: string
  statement: 'bs' | 'pl'
  normalSide: 'debit' | 'credit'
  vatRelated?: boolean
  whtRelated?: boolean
}

/** 코드 → 메타 (미등록 시 null) */
export const CHART_OF_ACCOUNTS_BY_CODE: Record<string, AccountMeta> = {
  '1010': {
    code: '1010',
    nameKo: '현금및예금',
    nameEn: 'Cash and cash equivalents',
    tfrsNpaesGroupKo: '유동자산 — 현금성',
    statement: 'bs',
    normalSide: 'debit',
  },
  '1130': {
    code: '1130',
    nameKo: '매출채권',
    nameEn: 'Trade receivables',
    tfrsNpaesGroupKo: '유동자산 — 매출채권',
    statement: 'bs',
    normalSide: 'debit',
  },
  '1150': {
    code: '1150',
    nameKo: '대여금',
    nameEn: 'Loans receivable',
    tfrsNpaesGroupKo: '유동/비유동 — 기타채권',
    statement: 'bs',
    normalSide: 'debit',
  },
  '1160': {
    code: '1160',
    nameKo: '선급금',
    nameEn: 'Prepayments',
    tfrsNpaesGroupKo: '유동자산 — 선급비용',
    statement: 'bs',
    normalSide: 'debit',
  },
  '1460': {
    code: '1460',
    nameKo: '재고자산',
    nameEn: 'Inventories',
    tfrsNpaesGroupKo: '유동자산 — 재고',
    statement: 'bs',
    normalSide: 'debit',
  },
  '1470': {
    code: '1470',
    nameKo: '감가상각누계액',
    nameEn: 'Accumulated depreciation',
    tfrsNpaesGroupKo: '비유동자산 — 차감계정',
    statement: 'bs',
    normalSide: 'credit',
  },
  '1490': {
    code: '1490',
    nameKo: '기타유형자산',
    nameEn: 'Other PPE',
    tfrsNpaesGroupKo: '비유동자산 — 유형자산',
    statement: 'bs',
    normalSide: 'debit',
  },
  '2110': {
    code: '2110',
    nameKo: '매입채무',
    nameEn: 'Trade payables',
    tfrsNpaesGroupKo: '유동부채 — 매입채무',
    statement: 'bs',
    normalSide: 'credit',
  },
  '2150': {
    code: '2150',
    nameKo: '차입금',
    nameEn: 'Borrowings',
    tfrsNpaesGroupKo: '유동/비유동부채 — 차입금',
    statement: 'bs',
    normalSide: 'credit',
  },
  '2170': {
    code: '2170',
    nameKo: '법인세납부예정금',
    nameEn: 'Corporate income tax payable',
    tfrsNpaesGroupKo: '유동부채 — 법인세',
    statement: 'bs',
    normalSide: 'credit',
  },
  '2180': {
    code: '2180',
    nameKo: '부가세예수금',
    nameEn: 'VAT payable',
    tfrsNpaesGroupKo: '유동부채 — 부가세',
    statement: 'bs',
    normalSide: 'credit',
    vatRelated: true,
  },
  '2190': {
    code: '2190',
    nameKo: '원천세예수금',
    nameEn: 'Withholding tax payable',
    tfrsNpaesGroupKo: '유동부채 — 원천징수',
    statement: 'bs',
    normalSide: 'credit',
    whtRelated: true,
  },
  '2195': {
    code: '2195',
    nameKo: '사회보험예수금',
    nameEn: 'SSO payable',
    tfrsNpaesGroupKo: '유동부채 — 사회보험(SSO)',
    statement: 'bs',
    normalSide: 'credit',
  },
  '3110': {
    code: '3110',
    nameKo: '자본금',
    nameEn: 'Share capital',
    tfrsNpaesGroupKo: '자본',
    statement: 'bs',
    normalSide: 'credit',
  },
  '3120': {
    code: '3120',
    nameKo: '이익잉여금',
    nameEn: 'Retained earnings',
    tfrsNpaesGroupKo: '자본 — 이익잉여금',
    statement: 'bs',
    normalSide: 'credit',
  },
  '4110': {
    code: '4110',
    nameKo: '매출',
    nameEn: 'Revenue',
    tfrsNpaesGroupKo: '수익',
    statement: 'pl',
    normalSide: 'credit',
    vatRelated: true,
  },
  '5110': {
    code: '5110',
    nameKo: '매출원가',
    nameEn: 'Cost of sales',
    tfrsNpaesGroupKo: '매출원가',
    statement: 'pl',
    normalSide: 'debit',
  },
  '5500': {
    code: '5500',
    nameKo: '감가상각비',
    nameEn: 'Depreciation',
    tfrsNpaesGroupKo: '판관비/경비',
    statement: 'pl',
    normalSide: 'debit',
  },
  '5520': {
    code: '5520',
    nameKo: '기타경비',
    nameEn: 'Other expenses',
    tfrsNpaesGroupKo: '판관비/경비',
    statement: 'pl',
    normalSide: 'debit',
  },
  '5528': {
    code: '5528',
    nameKo: '배달앱수수료',
    nameEn: 'Delivery Fee',
    tfrsNpaesGroupKo: '판관비/경비',
    statement: 'pl',
    normalSide: 'debit',
  },
  '5529': {
    code: '5529',
    nameKo: '카드수수료',
    nameEn: 'Card Fee',
    tfrsNpaesGroupKo: '판관비/경비',
    statement: 'pl',
    normalSide: 'debit',
  },
}

export function accountLine(code: string, overrides?: Partial<{ nameKo: string }>) {
  const meta = CHART_OF_ACCOUNTS_BY_CODE[code]
  const nameKo = overrides?.nameKo ?? meta?.nameKo ?? code
  return { accountCode: code, accountName: nameKo }
}

/** 은행 입금 category(소문자) → 분개 라인 */
export function linesForBankDeposit(
  categoryLower: string,
  amount: number
): { accountCode: string; accountName: string; side: 'debit' | 'credit'; amount: number }[] {
  const cash = accountLine('1010')
  const receivable = accountLine('1130')
  const revenue = accountLine('4110')
  if (categoryLower === 'receivable_receive') {
    return [
      { ...cash, side: 'debit', amount },
      { ...receivable, side: 'credit', amount },
    ]
  }
  if (categoryLower === 'loan' || categoryLower === 'loan_borrow') {
    const borrowings = accountLine('2150')
    return [
      { ...cash, side: 'debit', amount },
      { ...borrowings, side: 'credit', amount },
    ]
  }
  return [
    { ...cash, side: 'debit', amount },
    { ...revenue, side: 'credit', amount },
  ]
}

/** 통장 출금 시 비용(차변) 계정 — 없으면 기타경비(5520) */
export type BankWithdrawExpenseOverride = {
  accountCode: string
  accountName: string
  accountSubjectId?: number | null
}

/** 은행 출금 category(소문자) → 분개 라인 (미분개 유형은 빈 배열) */
export function linesForBankWithdraw(
  categoryLower: string,
  amount: number,
  expenseOverride?: BankWithdrawExpenseOverride | null
): {
  accountCode: string
  accountName: string
  side: 'debit' | 'credit'
  amount: number
  accountSubjectId?: number | null
}[] {
  const cash = accountLine('1010')
  const expenseDebit = expenseOverride
    ? {
        accountCode: expenseOverride.accountCode,
        accountName: expenseOverride.accountName,
        ...(expenseOverride.accountSubjectId != null && expenseOverride.accountSubjectId > 0
          ? { accountSubjectId: expenseOverride.accountSubjectId }
          : {}),
      }
    : accountLine('5520')
  const payable = accountLine('2110')
  if (categoryLower === 'purchase_payment') {
    return [
      { ...payable, side: 'debit', amount },
      { ...cash, side: 'credit', amount },
    ]
  }
  if (['transfer', 'loan', 'advance', 'correction', 'unclassified'].includes(categoryLower)) {
    return []
  }
  return [
    { ...expenseDebit, side: 'debit', amount },
    { ...cash, side: 'credit', amount },
  ]
}

/** POS/매입/감가 등 고정 분개 */
export const GL = {
  cash: () => accountLine('1010'),
  revenue: () => accountLine('4110'),
  inventory: () => accountLine('1460'),
  payables: () => accountLine('2110'),
  miscExpense: () => accountLine('5520'),
  depreciationExpense: () => accountLine('5500'),
  accumulatedDepreciation: () => accountLine('1470'),
} as const
