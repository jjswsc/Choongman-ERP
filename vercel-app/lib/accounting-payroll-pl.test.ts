import { describe, expect, it } from 'vitest'
import {
  aggregatePayrollRecordsForPl,
  isPayrollRecordIncludedInPl,
  isSalaryLikePlExpenseRow,
  payrollRecordGrossExpenseBaht,
  resolveSalaryAccountSubjects,
  resolveSalaryCashPlDecision,
  salaryCashAttributionYearMonth,
} from '@/lib/accounting-payroll-pl'

describe('payrollRecordGrossExpenseBaht', () => {
  it('sums net + sso + tax', () => {
    expect(payrollRecordGrossExpenseBaht({ net_pay: 9000, sso: 500, tax: 200 })).toBe(9700)
  })
})

describe('isPayrollRecordIncludedInPl', () => {
  it('includes 확정 and paid', () => {
    expect(isPayrollRecordIncludedInPl('확정')).toBe(true)
    expect(isPayrollRecordIncludedInPl('paid')).toBe(true)
  })
  it('excludes cancelled/draft', () => {
    expect(isPayrollRecordIncludedInPl('취소')).toBe(false)
    expect(isPayrollRecordIncludedInPl('draft')).toBe(false)
  })
})

describe('resolveSalaryAccountSubjects + salary-like rows', () => {
  const meta = new Map([
    [10, { code: '5310', name: '급여', type: 'expense' }],
    [20, { code: '5520', name: '기타경비', type: 'expense' }],
    [30, { code: '1110', name: '현금이체', type: 'asset' }],
  ])

  it('prefers 5310', () => {
    const r = resolveSalaryAccountSubjects(meta)
    expect(r.preferredId).toBe(10)
    expect(r.salarySubjectIds.has(10)).toBe(true)
  })

  it('detects salary-like by account or memo', () => {
    const { salarySubjectIds } = resolveSalaryAccountSubjects(meta)
    expect(
      isSalaryLikePlExpenseRow({
        accountSubjectId: 10,
        memo: null,
        subjectMeta: meta,
        salarySubjectIds,
      })
    ).toBe(true)
    expect(
      isSalaryLikePlExpenseRow({
        accountSubjectId: 20,
        memo: '6월 급여 지급',
        subjectMeta: meta,
        salarySubjectIds,
      })
    ).toBe(true)
    expect(
      isSalaryLikePlExpenseRow({
        accountSubjectId: 20,
        memo: '렌트료',
        subjectMeta: meta,
        salarySubjectIds,
      })
    ).toBe(false)
  })
})

describe('aggregatePayrollRecordsForPl', () => {
  it('aggregates HQ stores only for HQ scope', () => {
    const { preferredId, salarySubjectIds } = resolveSalaryAccountSubjects(
      new Map([[10, { code: '5310', name: '급여', type: 'expense' }]])
    )
    const agg = aggregatePayrollRecordsForPl({
      rows: [
        { id: 1, store: '본사', name: 'A', net_pay: 10000, sso: 500, tax: 0, status: '확정' },
        { id: 2, store: 'Ekkamai', name: 'B', net_pay: 8000, sso: 400, tax: 0, status: '확정' },
      ],
      storeFilter: '본사',
      isHQ: true,
      preferredSubjectId: preferredId,
      salarySubjectIds,
    })
    expect(agg.rowCount).toBe(1)
    expect(agg.total).toBe(10500)
  })
})

describe('salary cash P&L attribution', () => {
  it('puts Aug 5 payment into July', () => {
    expect(salaryCashAttributionYearMonth({ transDate: '2026-08-05', expenseDate: '2026-08-05' })).toBe(
      '2026-07'
    )
  })

  it('keeps accrual expense_date month when it differs from pay date', () => {
    expect(salaryCashAttributionYearMonth({ transDate: '2026-08-05', expenseDate: '2026-07-01' })).toBe(
      '2026-07'
    )
  })

  it('does not treat July pay (Aug 5) as an August payroll duplicate', () => {
    expect(
      resolveSalaryCashPlDecision({
        isSalaryLike: true,
        payrollExpenseThisMonth: 100,
        transDate: '2026-08-05',
        expenseDate: '2026-08-05',
        plYearMonth: '2026-08',
      })
    ).toBe('skip-other-month')
  })

  it('skips same-month salary cash when that month has confirmed payroll', () => {
    expect(
      resolveSalaryCashPlDecision({
        isSalaryLike: true,
        payrollExpenseThisMonth: 100,
        transDate: '2026-08-20',
        expenseDate: '2026-08-20',
        plYearMonth: '2026-08',
      })
    ).toBe('skip-payroll-dup')
  })

  it('excludes Aug 5 cash from August when no August payroll (귀속은 7월)', () => {
    expect(
      resolveSalaryCashPlDecision({
        isSalaryLike: true,
        payrollExpenseThisMonth: 0,
        transDate: '2026-08-05',
        expenseDate: '2026-08-05',
        plYearMonth: '2026-08',
      })
    ).toBe('skip-other-month')
  })

  it('includes Aug 5 cash in July when July payroll is not saved', () => {
    expect(
      resolveSalaryCashPlDecision({
        isSalaryLike: true,
        payrollExpenseThisMonth: 0,
        transDate: '2026-08-05',
        expenseDate: '2026-08-05',
        plYearMonth: '2026-07',
      })
    ).toBe('include')
  })

  it('skips July cash when July payroll records exist (이중 방지)', () => {
    expect(
      resolveSalaryCashPlDecision({
        isSalaryLike: true,
        payrollExpenseThisMonth: 50_000,
        transDate: '2026-08-05',
        expenseDate: '2026-07-01',
        plYearMonth: '2026-07',
      })
    ).toBe('skip-payroll-dup')
  })
})
