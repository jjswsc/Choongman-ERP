import type { RefObject } from 'react'
import type { OrderItem } from '@/lib/pos-types'
import { padSplitPersonFlags, padSplitPersonIds } from '@/lib/pos-split-person'
import { resolveCartLineQuantityForSave } from '@/lib/pos-order-item-map'
import {
  allocateLineDiscountByAssignedQty,
  computeMenuSplitDueByPerson,
  computeMenuSplitDueFromBaseSum,
} from '@/lib/pos-menu-split-due'
import {
  roundMenuSplitPaymentDues,
  resolvePaymentTotalRoundingMode,
  type PosPricingAdjustments,
} from '@/lib/pos-pricing'
import type {
  CartPanelSplitReceiptPayload,
  CartPanelOrderLinePayload,
  CartPanelPaymentPayload,
} from '@/components/pos/cart-panel-types'
import type { CartPanelAppliedCollab, CartPanelMemberMap } from '@/lib/cart-panel-discount-calcs'
import type { buildCartPanelOrderItemPayload } from '@/lib/cart-panel-payment-snapshot'

/** 배포 직후 옛 split-due 청크에 새 export가 없으면 POS 전체가 흰 오류 화면이 된다 */
function allocateLineDiscountOrZero(
  params: Parameters<typeof allocateLineDiscountByAssignedQty>[0]
): number[] {
  if (typeof allocateLineDiscountByAssignedQty === 'function') {
    return allocateLineDiscountByAssignedQty(params)
  }
  return (params.assignedQtyByPerson || []).map(() => 0)
}

export interface ComputeCartPanelMenuSplitBaseByPersonInput {
  splitCount: number
  cartItems: OrderItem[]
  menuSplitAssigned: Record<string, number[]>
  round2: (n: number) => number
}

export function computeCartPanelMenuSplitBaseByPerson({
  splitCount,
  cartItems,
  menuSplitAssigned,
  round2,
}: ComputeCartPanelMenuSplitBaseByPersonInput) {
  const count = Math.max(1, Number(splitCount) || 1)
  const baseByPerson = Array.from({ length: count }, () => 0)
  for (const item of cartItems) {
    const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
    for (let i = 0; i < count; i += 1) {
      const qty = Math.max(0, Number(row[i] || 0))
      baseByPerson[i] += (Number(item.price) || 0) * qty
    }
  }
  return baseByPerson.map((v) => round2(v))
}

export interface ComputeCartPanelMenuSplitDiscountByPersonInput {
  splitCount: number
  splitCollabJoinByPerson: boolean[]
  cartItems: OrderItem[]
  menuSplitAssigned: Record<string, number[]>
  otherLineDiscountSnapshot: number[]
  round2: (n: number) => number
  lineDiscountSnapshot: number[]
}

export function computeCartPanelMenuSplitDiscountByPerson({
  splitCount,
  splitCollabJoinByPerson,
  cartItems,
  menuSplitAssigned,
  otherLineDiscountSnapshot,
  round2,
  lineDiscountSnapshot,
}: ComputeCartPanelMenuSplitDiscountByPersonInput) {
  const count = Math.max(1, Number(splitCount) || 1)
  const discByPerson = Array.from({ length: count }, () => 0)
  const joinFlags = padSplitPersonFlags(splitCollabJoinByPerson, count, true)
  cartItems.forEach((item, cartIdx) => {
    const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
    const assignedQtyByPerson = Array.from({ length: count }, (_, i) => Math.max(0, Number(row[i] || 0)))
    const otherAmt = Math.max(0, Number(otherLineDiscountSnapshot[cartIdx] ?? 0) || 0)
    const collabAmt = Math.max(
      0,
      round2(Math.max(0, Number(lineDiscountSnapshot[cartIdx] ?? 0) || 0) - otherAmt)
    )
    const otherAlloc = allocateLineDiscountOrZero({
      lineDiscountAmt: otherAmt,
      lineQty: resolveCartLineQuantityForSave(item as { quantity?: unknown; qty?: unknown }),
      assignedQtyByPerson,
      round2,
    })
    const joinAssigned = assignedQtyByPerson.map((qty, i) => (joinFlags[i] === false ? 0 : qty))
    const collabAlloc = allocateLineDiscountOrZero({
      lineDiscountAmt: collabAmt,
      lineQty: joinAssigned.reduce((s, q) => s + q, 0),
      assignedQtyByPerson: joinAssigned,
      round2,
    })
    for (let i = 0; i < count; i += 1) {
      discByPerson[i] = round2(
        discByPerson[i] + Math.max(0, Number(otherAlloc[i] || 0)) + Math.max(0, Number(collabAlloc[i] || 0))
      )
    }
  })
  return discByPerson
}

export interface ComputeCartPanelMenuSplitUnassignedQtyInput {
  cartItems: OrderItem[]
  menuSplitAssigned: Record<string, number[]>
  round2: (n: number) => number
}

export function computeCartPanelMenuSplitUnassignedQty({ cartItems, menuSplitAssigned, round2 }: ComputeCartPanelMenuSplitUnassignedQtyInput) {
  let sum = 0
  for (const item of cartItems) {
    const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
    const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
    sum += Math.max(0, (Number(item.quantity) || 0) - assigned)
  }
  return round2(sum)
}

export interface ComputeCartPanelMenuSplitDueByPersonInput {
  menuSplitBaseByPerson: number[]
  round2: (n: number) => number
  menuSplitDiscountByPerson: number[]
  subtotal: number
  discount: number
  total: number
  pricingAdjustments: PosPricingAdjustments | undefined
  menuSplitUnassignedQty: number
}

export function computeCartPanelMenuSplitDueByPerson({
  menuSplitBaseByPerson,
  round2,
  menuSplitDiscountByPerson,
  subtotal,
  discount,
  total,
  pricingAdjustments,
  menuSplitUnassignedQty,
}: ComputeCartPanelMenuSplitDueByPersonInput) {
  const netByPerson = menuSplitBaseByPerson.map((base, i) =>
    round2(Math.max(0, Number(base) || 0) - Math.max(0, Number(menuSplitDiscountByPerson[i] || 0)))
  )
  const orderNet = round2(Math.max(0, Number(subtotal) || 0) - Math.max(0, Number(discount) || 0))
  const raw = computeMenuSplitDueByPerson({
    total,
    subtotal: orderNet > 0.009 ? orderNet : subtotal,
    baseByPerson: netByPerson,
    round2,
  })
  return roundMenuSplitPaymentDues(
    raw,
    resolvePaymentTotalRoundingMode(pricingAdjustments),
    total,
    menuSplitUnassignedQty
  )
}

export interface ComputeCartPanelMenuSplitPendingAmountInput {
  cartItems: OrderItem[]
  menuSplitPendingQty: Record<string, number>
  lineDiscountSnapshot: number[]
  round2: (n: number) => number
  subtotal: number
  discount: number
  total: number
}

export function computeCartPanelMenuSplitPendingAmount({
  cartItems,
  menuSplitPendingQty,
  lineDiscountSnapshot,
  round2,
  subtotal,
  discount,
  total,
}: ComputeCartPanelMenuSplitPendingAmountInput) {
  let baseSum = 0
  let discountSum = 0
  cartItems.forEach((item, cartIdx) => {
    const qty = Math.max(0, Number(menuSplitPendingQty[item.id] || 0))
    baseSum += qty * (Number(item.price) || 0)
    const fullQty = resolveCartLineQuantityForSave(item as { quantity?: unknown; qty?: unknown })
    const fullDisc = Math.max(0, Number(lineDiscountSnapshot[cartIdx] ?? 0) || 0)
    if (qty > 0.0001 && fullQty > 0.0001 && fullDisc > 0.0001) {
      discountSum += fullQty - qty <= 0.0001 ? fullDisc : (fullDisc * qty) / fullQty
    }
  })
  const pendingNet = round2(Math.max(0, baseSum - discountSum))
  const orderNet = round2(Math.max(0, Number(subtotal) || 0) - Math.max(0, Number(discount) || 0))
  return computeMenuSplitDueFromBaseSum({
    total,
    subtotal: orderNet > 0.009 ? orderNet : subtotal,
    baseSum: pendingNet,
    round2,
  })
}

export interface ComputeCartPanelMenuSplitItemStatusesInput {
  cartItems: OrderItem[]
  menuSplitAssigned: Record<string, number[]>
  menuSplitPendingQty: Record<string, number>
  menuSplitDueByPerson: number[]
  menuSplitRemainingByPerson: number[]
}

export function computeCartPanelMenuSplitItemStatuses({
  cartItems,
  menuSplitAssigned,
  menuSplitPendingQty,
  menuSplitDueByPerson,
  menuSplitRemainingByPerson,
}: ComputeCartPanelMenuSplitItemStatusesInput) {
  return cartItems.map((item) => {
    const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
    const qtyTotal = Math.max(0, Number(item.quantity) || 0)
    const pendingQty = Math.max(0, Number(menuSplitPendingQty[item.id] || 0))
    const assigned = row.reduce((s, v) => s + Math.max(0, Number(v || 0)), 0)
    const unassigned = Math.max(0, qtyTotal - assigned - pendingQty)
    const holders = row
      .map((q, idx) => ({ idx, qty: Math.max(0, Number(q || 0)) }))
      .filter((h) => h.qty > 0.009)
    const allHoldersPaid =
      holders.length > 0 &&
      holders.every(
        (h) =>
          Math.max(0, Number(menuSplitDueByPerson[h.idx] || 0)) > 0.009 &&
          Math.max(0, Number(menuSplitRemainingByPerson[h.idx] || 0)) <= 0.009
      )
    const fullyAssigned = unassigned <= 0.009 && pendingQty <= 0.009 && assigned > 0.009
    const settled = qtyTotal > 0.009 && fullyAssigned && allHoldersPaid
    const awaitingPay = fullyAssigned && !allHoldersPaid && assigned > 0.009
    const selecting = pendingQty > 0.009
    return {
      item,
      row,
      qtyTotal,
      pendingQty,
      assigned,
      unassigned,
      holders,
      settled,
      awaitingPay,
      selecting,
    }
  })
}

export interface ComputeCartPanelAmountSplitPersonStatusesInput {
  splitCount: number
  amountSplitDueByPerson: number[]
  amountSplitRemainingByPerson: number[]
  amountSplitPaidByPerson: number[]
  amountSplitTargetPersonIndex: number
}

export function computeCartPanelAmountSplitPersonStatuses({
  splitCount,
  amountSplitDueByPerson,
  amountSplitRemainingByPerson,
  amountSplitPaidByPerson,
  amountSplitTargetPersonIndex,
}: ComputeCartPanelAmountSplitPersonStatusesInput) {
  const count = Math.max(1, Number(splitCount) || 1)
  return Array.from({ length: count }, (_, idx) => {
    const due = Math.max(0, Number(amountSplitDueByPerson[idx] || 0))
    const remaining = Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
    const paid = Math.max(0, Number(amountSplitPaidByPerson[idx] || 0))
    const isPaid = due > 0.009 && remaining <= 0.009
    const isPayTarget = idx === amountSplitTargetPersonIndex
    return { idx, due, remaining, paid, isPaid, isPayTarget }
  })
}

export interface ComputeCartPanelSplitSettledPersonCountInput {
  showSplit: boolean
  splitCount: number
  splitMode: "amount" | "menu"
  menuSplitDueByPerson: number[]
  menuSplitRemainingByPerson: number[]
  amountSplitPaidPersonCount: number
}

export function computeCartPanelSplitSettledPersonCount({
  showSplit,
  splitCount,
  splitMode,
  menuSplitDueByPerson,
  menuSplitRemainingByPerson,
  amountSplitPaidPersonCount,
}: ComputeCartPanelSplitSettledPersonCountInput) {
  if (!showSplit) return 0
  const count = Math.max(1, Number(splitCount) || 1)
  if (splitMode === 'menu') {
    let settled = 0
    for (let i = 0; i < count; i += 1) {
      const due = Math.max(0, Number(menuSplitDueByPerson[i] || 0))
      const remaining = Math.max(0, Number(menuSplitRemainingByPerson[i] || 0))
      if (due > 0.009 && remaining <= 0.009) settled += 1
    }
    return settled
  }
  return amountSplitPaidPersonCount
}

export interface ComputeCartPanelDisplayedSplitTargetRemainingInput {
  showSplit: boolean
  round2: (n: number) => number
  total: number
  paymentSum: number
  splitMode: "amount" | "menu"
  menuSplitPendingQtyTotal: number
  menuSplitPendingAmount: number
  menuSplitTargetPersonIndex: number
  amountSplitTargetPersonIndex: number
  menuSplitRemainingByPerson: number[]
  amountSplitRemainingByPerson: number[]
}

export function computeCartPanelDisplayedSplitTargetRemaining({
  showSplit,
  round2,
  total,
  paymentSum,
  splitMode,
  menuSplitPendingQtyTotal,
  menuSplitPendingAmount,
  menuSplitTargetPersonIndex,
  amountSplitTargetPersonIndex,
  menuSplitRemainingByPerson,
  amountSplitRemainingByPerson,
}: ComputeCartPanelDisplayedSplitTargetRemainingInput) {
  if (!showSplit) return Math.max(0, round2(total - paymentSum))
  if (splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return menuSplitPendingAmount
  const idx = splitMode === 'menu' ? menuSplitTargetPersonIndex : amountSplitTargetPersonIndex
  return splitMode === 'menu'
    ? Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
    : Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
}

export interface ComputeCartPanelSplitCurrentPersonPaymentReadyInput {
  showSplit: boolean
  total: number
  splitMode: "amount" | "menu"
  menuSplitPendingQtyTotal: number
  menuSplitTargetPersonIndex: number
  amountSplitTargetPersonIndex: number
  menuSplitDueByPerson: number[]
  amountSplitDueByPerson: number[]
  menuSplitRemainingByPerson: number[]
  amountSplitRemainingByPerson: number[]
  SPLIT_AMOUNT_EPS: number
  paymentSum: number
}

export function computeCartPanelSplitCurrentPersonPaymentReady({
  showSplit,
  total,
  splitMode,
  menuSplitPendingQtyTotal,
  menuSplitTargetPersonIndex,
  amountSplitTargetPersonIndex,
  menuSplitDueByPerson,
  amountSplitDueByPerson,
  menuSplitRemainingByPerson,
  amountSplitRemainingByPerson,
  SPLIT_AMOUNT_EPS,
  paymentSum,
}: ComputeCartPanelSplitCurrentPersonPaymentReadyInput) {
  if (!showSplit || total <= 0) return false
  if (splitMode === 'menu' && menuSplitPendingQtyTotal > 0.009) return false
  const idx =
    splitMode === 'menu' ? menuSplitTargetPersonIndex : amountSplitTargetPersonIndex
  const due =
    splitMode === 'menu'
      ? Number(menuSplitDueByPerson[idx] || 0)
      : Number(amountSplitDueByPerson[idx] || 0)
  const personRemaining =
    splitMode === 'menu'
      ? Math.max(0, Number(menuSplitRemainingByPerson[idx] || 0))
      : Math.max(0, Number(amountSplitRemainingByPerson[idx] || 0))
  if (personRemaining <= SPLIT_AMOUNT_EPS) return false
  if (paymentSum <= SPLIT_AMOUNT_EPS) return false
  if (due <= SPLIT_AMOUNT_EPS) return false
  return paymentSum >= personRemaining - SPLIT_AMOUNT_EPS
}

export interface ComputeCartPanelSplitOpenRemaindersInput {
  showSplit: boolean
  splitCount: number
  splitMode: "amount" | "menu"
  menuSplitRemainingByPerson: number[]
  amountSplitRemainingByPerson: number[]
  SPLIT_AMOUNT_EPS: number
}

export function computeCartPanelSplitOpenRemainders({
  showSplit,
  splitCount,
  splitMode,
  menuSplitRemainingByPerson,
  amountSplitRemainingByPerson,
  SPLIT_AMOUNT_EPS,
}: ComputeCartPanelSplitOpenRemaindersInput) {
  if (!showSplit) return [] as number[]
  const count = Math.max(1, Number(splitCount) || 1)
  const open: number[] = []
  for (let i = 0; i < count; i += 1) {
    const remaining =
      splitMode === 'menu'
        ? Math.max(0, Number(menuSplitRemainingByPerson[i] || 0))
        : Math.max(0, Number(amountSplitRemainingByPerson[i] || 0))
    if (remaining > SPLIT_AMOUNT_EPS) open.push(remaining)
  }
  return open
}

export interface ComputeCartPanelSplitReadyForCompleteInput {
  showSplit: boolean
  paymentSumMatch: boolean
  cryptoPaymentConfirmed: boolean
  splitMode: "amount" | "menu"
  menuSplitUnassignedQty: number
  splitAllGuestsSettled: boolean
  paymentTotalsReconcile: (entered: number, due: number) => boolean
  splitCapturedPaymentSum: number
  collectableDue: number
  splitOpenRemainders: number[]
  paymentSum: number
  SPLIT_AMOUNT_EPS: number
}

export function computeCartPanelSplitReadyForComplete({
  showSplit,
  paymentSumMatch,
  cryptoPaymentConfirmed,
  splitMode,
  menuSplitUnassignedQty,
  splitAllGuestsSettled,
  paymentTotalsReconcile,
  splitCapturedPaymentSum,
  collectableDue,
  splitOpenRemainders,
  paymentSum,
  SPLIT_AMOUNT_EPS,
}: ComputeCartPanelSplitReadyForCompleteInput) {
  if (!showSplit) return paymentSumMatch && cryptoPaymentConfirmed
  if (splitMode === 'menu' && menuSplitUnassignedQty > 0.009) return false
  const reconciled =
    paymentSumMatch ||
    (splitAllGuestsSettled && paymentTotalsReconcile(splitCapturedPaymentSum, collectableDue))
  if (!reconciled) return false
  if (!cryptoPaymentConfirmed) return false
  if (splitOpenRemainders.length === 0) return true
  if (splitOpenRemainders.length === 1 && paymentSum >= splitOpenRemainders[0] - SPLIT_AMOUNT_EPS) {
    return true
  }
  return false
}

export interface BuildCartPanelSplitReceiptPayloadsInput {
  showSplit: boolean
  splitCount: number
  splitCollabJoinByPerson: boolean[]
  splitMemberIdByPerson: string[]
  memberMap: CartPanelMemberMap
  appliedCollab: CartPanelAppliedCollab | null
  splitMode: "amount" | "menu"
  cartItems: OrderItem[]
  menuSplitAssigned: Record<string, number[]>
  otherLineDiscountSnapshot: number[]
  lineDiscountSnapshot: number[]
  mapCartItemToOrderPayload: (
    i: OrderItem,
    quantityOverride?: number,
    lineIdx?: number,
    lineDiscountAmtOverride?: number
  ) => ReturnType<typeof buildCartPanelOrderItemPayload>
  menuSplitDueByPerson: number[]
  menuSplitDiscountByPerson: number[]
  tr: (key: string, fallback: string) => string
  splitPaymentsByPersonRef: RefObject<(CartPanelPaymentPayload | undefined)[]>
  amountSplitDueByPerson: number[]
}

export function buildCartPanelSplitReceiptPayloads({
  showSplit,
  splitCount,
  splitCollabJoinByPerson,
  splitMemberIdByPerson,
  memberMap,
  appliedCollab,
  splitMode,
  cartItems,
  menuSplitAssigned,
  otherLineDiscountSnapshot,
  lineDiscountSnapshot,
  mapCartItemToOrderPayload,
  menuSplitDueByPerson,
  menuSplitDiscountByPerson,
  tr,
  splitPaymentsByPersonRef,
  amountSplitDueByPerson,
}: BuildCartPanelSplitReceiptPayloadsInput): CartPanelSplitReceiptPayload[] | undefined {
  if (!showSplit) return undefined
  const count = Math.max(1, Number(splitCount) || 1)
  if (count <= 1) return undefined
  const round2Local = (n: number) => Math.round(n * 100) / 100
  const joinFlags = padSplitPersonFlags(splitCollabJoinByPerson, count, true)
  const memberIds = padSplitPersonIds(splitMemberIdByPerson, count)
  const memberForPerson = (idx: number) => {
    const mid = memberIds[idx]
    const detail = memberMap[mid]
    const memberIdNum = Math.max(0, Number(mid) || 0)
    const joined = Boolean(appliedCollab) && joinFlags[idx] !== false
    if (memberIdNum <= 0 && !joined && !detail) return undefined
    return {
      ...(memberIdNum > 0 ? { memberId: memberIdNum } : {}),
      ...(detail?.memberNo ? { memberNo: detail.memberNo } : {}),
      ...(detail?.phone ? { memberPhone: detail.phone } : {}),
      ...(detail?.tierCode ? { memberTierCode: detail.tierCode } : {}),
      collabJoined: joined,
    }
  }
  if (splitMode === 'menu') {
    const lineDiscountByItemId: Record<string, number[]> = {}
    cartItems.forEach((item, cartIdx) => {
      const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
      const assignedQtyByPerson = Array.from({ length: count }, (_, i) => Math.max(0, Number(row[i] || 0)))
      const otherAmt = Math.max(0, Number(otherLineDiscountSnapshot[cartIdx] ?? 0) || 0)
      const collabAmt = Math.max(
        0,
        round2Local(Math.max(0, Number(lineDiscountSnapshot[cartIdx] ?? 0) || 0) - otherAmt)
      )
      const otherAlloc = allocateLineDiscountOrZero({
        lineDiscountAmt: otherAmt,
        lineQty: resolveCartLineQuantityForSave(item as { quantity?: unknown; qty?: unknown }),
        assignedQtyByPerson,
        round2: round2Local,
      })
      const joinAssigned = assignedQtyByPerson.map((qty, i) => (joinFlags[i] === false ? 0 : qty))
      const collabAlloc = allocateLineDiscountOrZero({
        lineDiscountAmt: collabAmt,
        lineQty: joinAssigned.reduce((s, q) => s + q, 0),
        assignedQtyByPerson: joinAssigned,
        round2: round2Local,
      })
      lineDiscountByItemId[item.id] = Array.from({ length: count }, (_, i) =>
        round2Local(Math.max(0, Number(otherAlloc[i] || 0)) + Math.max(0, Number(collabAlloc[i] || 0)))
      )
    })
    const entries: CartPanelSplitReceiptPayload[] = []
    for (let personIdx = 0; personIdx < count; personIdx += 1) {
      const lines: CartPanelOrderLinePayload[] = []
      let subtotalByPerson = 0
      for (const item of cartItems) {
        const row = Array.isArray(menuSplitAssigned[item.id]) ? menuSplitAssigned[item.id] : []
        const qty = Math.max(0, Number(row[personIdx] || 0))
        if (qty <= 0) continue
        const cartIdx = cartItems.findIndex((c) => c.id === item.id)
        const personLineDisc = Math.max(0, Number(lineDiscountByItemId[item.id]?.[personIdx] ?? 0) || 0)
        lines.push(
          mapCartItemToOrderPayload(item, qty, cartIdx >= 0 ? cartIdx : undefined, personLineDisc)
        )
        subtotalByPerson += (Number(item.price) || 0) * qty
      }
      const subtotalRounded = round2Local(subtotalByPerson)
      const due = round2Local(Math.max(0, Number(menuSplitDueByPerson[personIdx] || 0)))
      const totalByPerson = due > 0 ? due : subtotalRounded
      const discountByPerson = round2Local(
        Math.max(0, Number(menuSplitDiscountByPerson[personIdx] || 0))
      )
      if (lines.length === 0 && totalByPerson <= 0) continue
      const member = memberForPerson(personIdx)
      entries.push({
        key: `menu-${personIdx + 1}`,
        label: `${tr('posCurrentPerson', '현재 인원')} ${personIdx + 1}/${count}`,
        items: lines,
        subtotal: subtotalRounded,
        discountAmt: discountByPerson,
        total: totalByPerson,
        payment: splitPaymentsByPersonRef.current[personIdx],
        ...(member ? { member } : {}),
      })
    }
    return entries.length > 0 ? entries : undefined
  }
  const dueByPerson = amountSplitDueByPerson
  const fullMenuLines = cartItems.map((item, idx) => mapCartItemToOrderPayload(item, undefined, idx, 0))
  const entries: CartPanelSplitReceiptPayload[] = dueByPerson
    .map((due, idx) => {
      const member = memberForPerson(idx)
      return {
        key: `amount-${idx + 1}`,
        label: `${tr('posCurrentPerson', '현재 인원')} ${idx + 1}/${count}`,
        items: [
          ...fullMenuLines,
          {
            id: `dutch-amount-${idx + 1}`,
            name: `${tr('posDutchPayHeader', '더치페이')} ${idx + 1}/${count}`,
            price: due,
            quantity: 1,
          },
        ],
        subtotal: due,
        discountAmt: 0,
        total: due,
        payment: splitPaymentsByPersonRef.current[idx],
        ...(member ? { member } : {}),
      }
    })
    .filter((entry) => entry.total > 0)
  return entries.length > 0 ? entries : undefined
}
