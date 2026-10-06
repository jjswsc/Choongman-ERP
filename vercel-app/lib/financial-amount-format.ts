import { roundMoney2 } from '@/lib/invoice-vat-total'

/** 손익·재무상태표·재고금액: 바트 소수 둘째 자리(0.01). */
export function roundFinancialAmount(n: number | null | undefined): number {
  return roundMoney2(Number(n) || 0)
}

export function formatMoney2(n: number | null | undefined): string {
  return roundFinancialAmount(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 화면 통화. 이름은 기존 호출부 호환용이며, 표시는 소수 둘째 자리입니다. */
export function formatBahtInteger(n: number | null | undefined): string {
  return `฿${formatMoney2(n)}`
}
