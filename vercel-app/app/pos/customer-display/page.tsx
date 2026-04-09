"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosPrinterSettings } from "@/lib/api-client"
import {
  readPosCustomerDisplayState,
  subscribePosCustomerDisplayState,
  type PosCustomerDisplayPayload,
} from "@/lib/pos-customer-display-state"

type DisplayTheme = "dark" | "light" | "brand"

export default function PosCustomerDisplayPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const storeCode = String(auth?.store || "").trim()

  const [theme, setTheme] = React.useState<DisplayTheme>("dark")
  const [state, setState] = React.useState<PosCustomerDisplayPayload | null>(null)
  const [idleMessage, setIdleMessage] = React.useState("")
  const [paymentMessage, setPaymentMessage] = React.useState("")
  const [showOrderSummary, setShowOrderSummary] = React.useState(true)
  const [showOrderTotal, setShowOrderTotal] = React.useState(true)

  React.useEffect(() => {
    if (!storeCode) return
    let alive = true
    void getPosPrinterSettings({ storeCode }).then((s) => {
      if (!alive) return
      setTheme(s.customerDisplayTheme === "light" ? "light" : s.customerDisplayTheme === "brand" ? "brand" : "dark")
      setIdleMessage(String(s.customerDisplayIdleMessage ?? "").trim())
      setPaymentMessage(String(s.customerDisplayPaymentMessage ?? "").trim())
      setShowOrderSummary(s.customerDisplayShowOrderSummary !== false)
      setShowOrderTotal(s.customerDisplayShowOrderTotal !== false)
    })
    return () => {
      alive = false
    }
  }, [storeCode])

  React.useEffect(() => {
    if (!storeCode) return
    const latest = readPosCustomerDisplayState(storeCode)
    if (latest) setState(latest)
    return subscribePosCustomerDisplayState(storeCode, setState)
  }, [storeCode])

  React.useEffect(() => {
    const shell = window.cmPosShell
    if (typeof shell?.onCustomerDisplayState !== "function") return
    return shell.onCustomerDisplayState((payload) => {
      if (!payload || payload.storeCode !== storeCode) return
      setState(payload)
    })
  }, [storeCode])

  const current = state?.kind || "idle"
  const formatFeeLabel = React.useCallback(
    (base: string, rate?: number, mode?: "included" | "separate") => {
      const r = Math.max(0, Number(rate || 0))
      const rateDisplay =
        Number.isInteger(r)
          ? String(r)
          : String(Math.round(r * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")
      const rateText = r > 0 ? ` ${rateDisplay}%` : ""
      const modeText = mode === "included" ? ` ${t("included") || "포함"}` : mode === "separate" ? ` ${t("separate") || "별도"}` : ""
      return `${base}${rateText}${modeText}`.trim()
    },
    [t]
  )
  const rootClass =
    theme === "light"
      ? "bg-white text-slate-900"
      : theme === "brand"
        ? "bg-gradient-to-br from-emerald-800 to-emerald-500 text-white"
        : "bg-slate-950 text-white"

  return (
    <div className={`h-full min-h-[100dvh] w-full ${rootClass}`}>
      <div className="mx-auto flex h-full max-w-5xl flex-col p-8">
        <div className="mb-6 flex items-center justify-between border-b border-white/20 pb-4">
          <h1 className="text-2xl font-bold">{t("posCustomerDisplayTitle") || "Customer Display"}</h1>
          <span className="text-sm opacity-80">{storeCode || "-"}</span>
        </div>

        {current === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-4xl font-semibold">
              {state?.message || idleMessage || (t("posCustomerIdleDefault") || "환영합니다")}
            </p>
            <p className="mt-3 text-lg opacity-80">{t("posCustomerIdleSub") || "주문을 시작해 주세요."}</p>
          </div>
        ) : null}

        {current === "ordering" ? (
          <div className="flex flex-1 flex-col">
            <h2 className="mb-3 text-3xl font-semibold">{state?.title || (t("posCustomerOrdering") || "주문 확인")}</h2>
            {showOrderSummary && state?.showOrderSummary !== false ? (
              <div className="flex-1 space-y-2 overflow-auto rounded-xl border border-white/20 p-4">
                {(state?.items || []).map((it, idx) => (
                  <div key={`${it.name}-${idx}`} className="flex items-center justify-between text-xl">
                    <span>{it.qty} x {it.name}</span>
                    <span>{Number(it.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 rounded-xl border border-white/20 p-4 text-xl">
                {t("posCustomerOrderingInProgress") || "주문 진행 중"}
              </div>
            )}
            {showOrderTotal && state?.showOrderTotal !== false ? (
              <div className="mt-4 text-right text-3xl font-bold">
                {(t("posTotal") || "합계")}: {Number(state?.totalAmount || 0).toLocaleString()}
              </div>
            ) : null}
          </div>
        ) : null}

        {current === "payment" ? (
          <div className="flex flex-1 flex-col">
            <h2 className="mb-3 text-3xl font-semibold text-center">
              {state?.message || paymentMessage || (t("posCustomerPayment") || "결제 진행 중")}
            </h2>
            {showOrderSummary && state?.showOrderSummary !== false && Array.isArray(state?.items) && state.items.length > 0 ? (
              <div className="flex-1 space-y-2 overflow-auto rounded-xl border border-white/20 p-4">
                {state.items.map((it, idx) => (
                  <div key={`${it.name}-${idx}`} className="flex items-center justify-between text-xl">
                    <span>{it.qty} x {it.name}</span>
                    <span>{Number(it.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 rounded-xl border border-white/20 p-4 text-xl text-center">
                {t("posCustomerPayment") || "결제 진행 중"}
              </div>
            )}
            {showOrderTotal && state?.showOrderTotal !== false ? (
              <>
                {state?.breakdown ? (
                  (
                    Number(state.breakdown.discountAmt || 0) > 0 ||
                    Number(state.breakdown.vatFeeAmt || 0) > 0 ||
                    Number(state.breakdown.serviceFeeAmt || 0) > 0 ||
                    Number(state.breakdown.cardFeeAmt || 0) > 0 ||
                    Number(state.breakdown.otherFeeAmt || 0) > 0
                  ) ? (
                    <div className="mt-4 rounded-xl border border-white/20 p-4 text-lg">
                      <div className="flex items-center justify-between">
                        <span>{t("posSubtotal") || "소계"}</span>
                        <span>{Number(state.breakdown.subtotal || 0).toLocaleString()}</span>
                      </div>
                      {Number(state.breakdown.discountAmt || 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{t("posDiscount") || "할인"}</span>
                          <span>-{Number(state.breakdown.discountAmt || 0).toLocaleString()}</span>
                        </div>
                      ) : null}
                      {Number(state.breakdown.vatFeeAmt || 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{formatFeeLabel(t("vatFee") || "부가세", state.breakdown.vatRate, state.breakdown.vatMode)}</span>
                          <span>+{Number(state.breakdown.vatFeeAmt || 0).toLocaleString()}</span>
                        </div>
                      ) : null}
                      {Number(state.breakdown.serviceFeeAmt || 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{formatFeeLabel(t("serviceFee") || "서비스비", state.breakdown.serviceRate, state.breakdown.serviceMode)}</span>
                          <span>+{Number(state.breakdown.serviceFeeAmt || 0).toLocaleString()}</span>
                        </div>
                      ) : null}
                      {Number(state.breakdown.cardFeeAmt || 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{formatFeeLabel(t("cardFee") || "카드 수수료", state.breakdown.cardRate, state.breakdown.cardMode)}</span>
                          <span>+{Number(state.breakdown.cardFeeAmt || 0).toLocaleString()}</span>
                        </div>
                      ) : null}
                      {Number(state.breakdown.otherFeeAmt || 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{formatFeeLabel(t("otherFee") || "기타 수수료", state.breakdown.otherRate, state.breakdown.otherMode)}</span>
                          <span>+{Number(state.breakdown.otherFeeAmt || 0).toLocaleString()}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null
                ) : null}
                <div className="mt-4 text-right text-3xl font-bold">
                  {(t("posTotal") || "합계")}: {Number(state?.totalAmount || 0).toLocaleString()}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {current === "qr" ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h2 className="mb-4 text-3xl font-semibold">{state?.title || (t("posCustomerQrTitle") || "QR 코드")}</h2>
            {String(state?.qrPayload || "").trim() ? (
              <img
                src={`https://quickchart.io/qr?text=${encodeURIComponent(String(state?.qrPayload || ""))}&size=360&margin=1`}
                alt="Customer QR"
                className="h-72 w-72 rounded-lg bg-white p-2"
              />
            ) : (
              <p className="text-xl opacity-80">{t("posCustomerQrEmpty") || "QR 데이터가 없습니다."}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
