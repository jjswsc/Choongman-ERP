import { describe, expect, it } from "vitest"

type PayableEvent =
  | { kind: "po_approved"; ref: string; vendorCode: string; amount: number }
  | { kind: "bank_payment"; ref: string; vendorCode: string; amountAbs: number }

function applyPayableFlow(events: PayableEvent[]): { balance: number; appliedRefs: Set<string> } {
  let balance = 0
  const appliedRefs = new Set<string>()

  for (const e of events) {
    if (appliedRefs.has(e.ref)) continue // idempotency: 동일 ref 재전송 무시
    appliedRefs.add(e.ref)

    if (!String(e.vendorCode || "").trim()) {
      throw new Error("vendor_code required")
    }

    if (e.kind === "po_approved") {
      if (e.amount <= 0) throw new Error("invalid PO amount")
      balance += e.amount
    } else {
      if (e.amountAbs <= 0) throw new Error("invalid payment amount")
      // 실제 코드(upsertPayableFromBankPurchasePayment)와 동일: payment는 음수 반영
      balance -= Math.abs(e.amountAbs)
    }

    if (balance < 0) {
      throw new Error(`negative payable balance: ${balance}`)
    }
  }

  return { balance, appliedRefs }
}

describe("Payable flow harness - 거래처 미지급 처리", () => {
  it("발주 승인 -> 지급 흐름에서 잔액이 정확하다", () => {
    const { balance } = applyPayableFlow([
      { kind: "po_approved", ref: "PO-1001", vendorCode: "V001", amount: 12000 },
      { kind: "bank_payment", ref: "PAY-1001-A", vendorCode: "V001", amountAbs: 5000 },
      { kind: "bank_payment", ref: "PAY-1001-B", vendorCode: "V001", amountAbs: 7000 },
    ])
    expect(balance).toBe(0)
  })

  it("동일 지급 ref 재전송은 1회만 반영된다(idempotency)", () => {
    const { balance, appliedRefs } = applyPayableFlow([
      { kind: "po_approved", ref: "PO-2001", vendorCode: "V002", amount: 10000 },
      { kind: "bank_payment", ref: "PAY-2001-A", vendorCode: "V002", amountAbs: 2500 },
      { kind: "bank_payment", ref: "PAY-2001-A", vendorCode: "V002", amountAbs: 2500 }, // duplicate
    ])
    expect(appliedRefs.size).toBe(2)
    expect(balance).toBe(7500)
  })

  it("과지급으로 잔액이 음수가 되면 실패한다", () => {
    expect(() =>
      applyPayableFlow([
        { kind: "po_approved", ref: "PO-3001", vendorCode: "V003", amount: 3000 },
        { kind: "bank_payment", ref: "PAY-3001-A", vendorCode: "V003", amountAbs: 4000 },
      ])
    ).toThrow("negative payable balance")
  })

  it("거래처 코드 누락 및 0/음수 금액은 실패한다", () => {
    expect(() =>
      applyPayableFlow([{ kind: "po_approved", ref: "PO-4001", vendorCode: "", amount: 1000 }])
    ).toThrow("vendor_code required")

    expect(() =>
      applyPayableFlow([{ kind: "po_approved", ref: "PO-4002", vendorCode: "V004", amount: 0 }])
    ).toThrow("invalid PO amount")

    expect(() =>
      applyPayableFlow([{ kind: "bank_payment", ref: "PAY-4002", vendorCode: "V004", amountAbs: 0 }])
    ).toThrow("invalid payment amount")
  })
})
