/**
 * 급여 계산 유틸 (태국 SSO 등)
 * 테스트 가능하도록 순수 함수로 분리
 */

/** 연도별 SSO 한도 (태국) */
export function getSSOLimitsByYear(year: number): { ceiling: number; maxDed: number } {
  const y = year
  if (y <= 2025) return { ceiling: 15000, maxDed: 750 }
  if (y <= 2028) return { ceiling: 17500, maxDed: 875 }
  if (y <= 2031) return { ceiling: 20000, maxDed: 1000 }
  return { ceiling: 23000, maxDed: 1150 }
}

/** SSO 공제액 계산 (급여의 5%, ceiling·maxDed 한도 적용 - getPayrollCalc와 동일 로직) */
export function calcSSO(grossSalary: number, year: number): number {
  const { ceiling, maxDed } = getSSOLimitsByYear(year)
  const contributable = Math.min(grossSalary, ceiling)
  return Math.min(Math.floor(contributable * 0.05), maxDed)
}
