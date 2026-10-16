/**
 * 입고 헤더 ส่วนลด(할인) — IV 공급가와 맞추기 위해 줄 단가에 배분
 */
import { roundMoney2 } from './invoice-vat-total'
import {
  computeInboundBatchAmounts,
  type InboundPayableLine,
} from './inbound-payable-amount'
import type { ItemTaxType } from './income-statement-item-vat'
import { roundErp3 } from './utils'

/** 매입처 드롭다운 — 기타(직접 입력) */
export const INBOUND_VENDOR_OTHER = '__other__'

export function parseInboundDiscountAmt(raw: unknown): number {
  if (raw == null || raw === '') return 0
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return 0
  return roundMoney2(n)
}

export type InboundDiscountAllocLine = {
  qty: number
  unitCost: number
  lineNetBefore: number
  lineDiscount: number
  lineNetAfter: number
  /** 할인 반영 후 단가 (재고 unit_cost) */
  unitCostAfter: number
}

/**
 * 공급가(줄 합)에 대한 헤더 할인을 줄별 비율로 배분 (largest remainder, 0.001 단위).
 * 재고·미지급은 unitCostAfter 기준으로 저장한다.
 */
export function allocateInboundHeaderDiscount(
  lines: { qty: number; unitCost: number }[],
  discountAmt: number
): { appliedDiscount: number; lines: InboundDiscountAllocLine[] } {
  const prepared = lines.map((line) => {
    const qty = Math.max(0, Number(line.qty) || 0)
    const unitCost = Math.max(0, Number(line.unitCost) || 0)
    const lineNetBefore = roundErp3(qty * unitCost)
    return { qty, unitCost, lineNetBefore }
  })
  const sumNet = roundMoney2(prepared.reduce((s, l) => s + l.lineNetBefore, 0))
  const want = parseInboundDiscountAmt(discountAmt)
  const appliedDiscount = Math.min(want, sumNet)

  if (appliedDiscount <= 0 || sumNet <= 0) {
    return {
      appliedDiscount: 0,
      lines: prepared.map((l) => ({
        ...l,
        lineDiscount: 0,
        lineNetAfter: l.lineNetBefore,
        unitCostAfter: l.unitCost,
      })),
    }
  }

  // 1/1000 THB 단위로 배분 후 largest remainder
  const totalUnits = Math.round(appliedDiscount * 1000)
  const rawShares = prepared.map((l) =>
    sumNet > 0 ? (l.lineNetBefore / sumNet) * totalUnits : 0
  )
  const floors = rawShares.map((s) => Math.floor(s))
  let remain = totalUnits - floors.reduce((a, b) => a + b, 0)
  const order = rawShares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const allocUnits = [...floors]
  for (let k = 0; k < order.length && remain > 0; k++) {
    allocUnits[order[k].i] += 1
    remain -= 1
  }

  const out: InboundDiscountAllocLine[] = prepared.map((l, i) => {
    let lineDiscount = roundErp3(allocUnits[i] / 1000)
    if (lineDiscount > l.lineNetBefore) lineDiscount = l.lineNetBefore
    const lineNetAfter = roundErp3(l.lineNetBefore - lineDiscount)
    const unitCostAfter = l.qty > 0 ? roundErp3(lineNetAfter / l.qty) : 0
    return {
      ...l,
      lineDiscount,
      lineNetAfter,
      unitCostAfter,
    }
  })

  // 반올림으로 합이 어긋나면 마지막 양의 줄에서 보정
  const sumDisc = roundMoney2(out.reduce((s, l) => s + l.lineDiscount, 0))
  let gap = roundMoney2(appliedDiscount - sumDisc)
  if (Math.abs(gap) >= 0.001) {
    for (let i = out.length - 1; i >= 0 && Math.abs(gap) >= 0.001; i--) {
      const maxAdd = roundErp3(out[i].lineNetBefore - out[i].lineDiscount)
      const maxSub = out[i].lineDiscount
      const adj = gap > 0 ? Math.min(gap, maxAdd) : -Math.min(-gap, maxSub)
      if (Math.abs(adj) < 0.001) continue
      out[i].lineDiscount = roundErp3(out[i].lineDiscount + adj)
      out[i].lineNetAfter = roundErp3(out[i].lineNetBefore - out[i].lineDiscount)
      out[i].unitCostAfter = out[i].qty > 0 ? roundErp3(out[i].lineNetAfter / out[i].qty) : 0
      gap = roundMoney2(gap - adj)
    }
  }

  return { appliedDiscount, lines: out }
}

/** 화면·저장용: 할인 반영 전후 공급가·VAT·합계 */
export function computeInboundBatchAmountsWithDiscount(
  lines: InboundPayableLine[],
  taxByCode: ReadonlyMap<string, ItemTaxType>,
  discountAmt: number
): {
  netBefore: number
  discount: number
  net: number
  vat: number
  gross: number
  batchDateYmd: string
  allocated: ReturnType<typeof allocateInboundHeaderDiscount>
} {
  const before = computeInboundBatchAmounts(lines, taxByCode)
  const allocated = allocateInboundHeaderDiscount(
    lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost })),
    discountAmt
  )
  const afterLines: InboundPayableLine[] = lines.map((l, i) => ({
    ...l,
    unitCost: allocated.lines[i]?.unitCostAfter ?? l.unitCost,
  }))
  const after = computeInboundBatchAmounts(afterLines, taxByCode)
  return {
    netBefore: before.netTotal,
    discount: allocated.appliedDiscount,
    net: after.netTotal,
    vat: after.vatTotal,
    gross: after.grossTotal,
    batchDateYmd: after.batchDateYmd,
    allocated,
  }
}
