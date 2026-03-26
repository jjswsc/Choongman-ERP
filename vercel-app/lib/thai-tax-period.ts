type FilingPeriodType = 'monthly' | 'half_year' | 'annual'

type FilingPeriodRange = {
  periodType: FilingPeriodType
  periodKey: string
  startMonth: string
  endMonth: string
  months: string[]
}

function parseYearMonth(yearMonth: string): { y: number; m: number } {
  const ym = String(yearMonth || '').slice(0, 7)
  const m = ym.match(/^(\d{4})-(\d{2})$/)
  if (!m) throw new Error('INVALID_YEAR_MONTH')
  const y = Number(m[1])
  const mm = Number(m[2])
  if (mm < 1 || mm > 12) throw new Error('INVALID_YEAR_MONTH')
  return { y, m: mm }
}

function ym(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, '0')}`
}

export function getThaiTaxFilingPeriodRange(input: {
  yearMonth: string
  periodType?: FilingPeriodType
}): FilingPeriodRange {
  const { y, m } = parseYearMonth(input.yearMonth)
  const periodType = (input.periodType || 'monthly') as FilingPeriodType

  if (periodType === 'monthly') {
    const one = ym(y, m)
    return {
      periodType,
      periodKey: one,
      startMonth: one,
      endMonth: one,
      months: [one],
    }
  }

  if (periodType === 'half_year') {
    const isFirstHalf = m <= 6
    const start = isFirstHalf ? 1 : 7
    const end = isFirstHalf ? 6 : 12
    const months: string[] = []
    for (let mm = start; mm <= end; mm++) months.push(ym(y, mm))
    return {
      periodType,
      periodKey: `${y}-H${isFirstHalf ? '1' : '2'}`,
      startMonth: ym(y, start),
      endMonth: ym(y, end),
      months,
    }
  }

  const months: string[] = []
  for (let mm = 1; mm <= 12; mm++) months.push(ym(y, mm))
  return {
    periodType: 'annual',
    periodKey: String(y),
    startMonth: ym(y, 1),
    endMonth: ym(y, 12),
    months,
  }
}

export function buildMonthInFilter(months: string[]): string {
  const clean = (months || []).map((m) => String(m || '').slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))
  if (!clean.length) throw new Error('INVALID_MONTHS')
  return clean.map((m) => encodeURIComponent(m)).join(',')
}

