"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { isLangCode, useLang, type LangCode } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosPrinterSettings } from "@/lib/api-client"
import { PROMPTPAY_LOGO_SVG, THAI_QR_PAYMENT_LOGO_SVG } from "@/lib/pos-qr-brand-assets"
import { encodeQR, renderCard } from "thai-qr-payment"
import {
  readPosCustomerDisplayState,
  subscribePosCustomerDisplayState,
  type PosCustomerDisplayPayload,
} from "@/lib/pos-customer-display-state"
import { resolveReceiptSubtotalPrintAmount, resolveReceiptVatPrintAmount } from "@/lib/pos-pricing"

type DisplayTheme = "dark" | "light" | "brand"

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function buildThaiQrGuidelineCardDataUrl(payload: string): string {
  const raw = String(payload || "").trim()
  if (!raw) return ""
  try {
    const matrix = encodeQR(raw, { errorCorrectionLevel: "H" })
    const svg = renderCard(matrix, { theme: "color" })
    return svgToDataUrl(svg)
  } catch {
    return ""
  }
}

export default function PosCustomerDisplayPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const storeCode = String(auth?.store || "").trim()

  const [theme, setTheme] = React.useState<DisplayTheme>("dark")
  const [state, setState] = React.useState<PosCustomerDisplayPayload | null>(() =>
    typeof window !== "undefined" && storeCode ? readPosCustomerDisplayState(storeCode) : null
  )
  const [idleMessage, setIdleMessage] = React.useState("")
  const [paymentMessage, setPaymentMessage] = React.useState("")
  const [showOrderSummary, setShowOrderSummary] = React.useState(true)
  const [showOrderTotal, setShowOrderTotal] = React.useState(true)
  const [settingsLangMode, setSettingsLangMode] = React.useState<"follow-pos" | "custom">("follow-pos")
  const [settingsLangOverride, setSettingsLangOverride] = React.useState<LangCode>(lang)
  const [settingsIdleMediaType, setSettingsIdleMediaType] = React.useState<"none" | "image" | "video">("none")
  const [settingsIdleMediaUrl, setSettingsIdleMediaUrl] = React.useState("")
  const [receiptLogoUrl, setReceiptLogoUrl] = React.useState("")

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
      const rawSettingsLangOverride = String(s.customerDisplayLangOverride ?? "").trim()
      const normalizedSettingsLangOverride = isLangCode(rawSettingsLangOverride) ? rawSettingsLangOverride : lang
      setSettingsLangMode(
        s.customerDisplayLangMode === "custom" && isLangCode(rawSettingsLangOverride) ? "custom" : "follow-pos"
      )
      setSettingsLangOverride(normalizedSettingsLangOverride)
      const mt = String(s.customerDisplayIdleMediaType || "none").toLowerCase()
      setSettingsIdleMediaType(mt === "image" ? "image" : mt === "video" ? "video" : "none")
      setSettingsIdleMediaUrl(String(s.customerDisplayIdleMediaUrl ?? "").trim())
      setReceiptLogoUrl(String(s.receiptLogoImageUrl ?? "").trim())
    })
    return () => {
      alive = false
    }
  }, [lang, storeCode])

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

  const effectiveLang: LangCode = React.useMemo(() => {
    const from = state?.uiLang
    if (from && isLangCode(from)) return from
    if (settingsLangMode === "custom" && isLangCode(settingsLangOverride)) return settingsLangOverride
    return lang
  }, [state?.uiLang, settingsLangMode, settingsLangOverride, lang])

  const t = useT(effectiveLang)

  const current = state?.kind || "idle"
  const resolvedQrType: "THAI_QR" | "CREDIT_CARD" =
    String(state?.qrType || "").trim().toUpperCase() === "CREDIT_CARD" ? "CREDIT_CARD" : "THAI_QR"
  const qrPayloadText = String(state?.qrPayload || "").trim()
  const kbankGuidelineCardDataUrl = React.useMemo(() => {
    if (!qrPayloadText.startsWith("000201")) return ""
    return buildThaiQrGuidelineCardDataUrl(qrPayloadText)
  }, [qrPayloadText])
  const resolvedIdleMedia = React.useMemo(() => {
    const mtRaw = state?.idleMediaType ?? settingsIdleMediaType
    const mt = mtRaw === "image" || mtRaw === "video" ? mtRaw : "none"
    const url = String(state?.idleMediaUrl ?? settingsIdleMediaUrl ?? "").trim()
    return { type: mt, url }
  }, [state?.idleMediaType, state?.idleMediaUrl, settingsIdleMediaType, settingsIdleMediaUrl])

  const resolvedBrandLogo = String(state?.brandLogoUrl ?? receiptLogoUrl ?? "").trim()
  const showIdleBackdrop =
    current === "idle" &&
    (resolvedIdleMedia.type === "image" || resolvedIdleMedia.type === "video") &&
    Boolean(resolvedIdleMedia.url)

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
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
            {showIdleBackdrop ? (
              <>
                {resolvedIdleMedia.type === "video" ? (
                  <video
                    src={resolvedIdleMedia.url}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
                    autoPlay
                    muted
                    loop
                    playsInline
                  />
                ) : (
                   
                  <img
                    src={resolvedIdleMedia.url}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50"
                  />
                )}
                <div className="absolute inset-0 bg-black/35" aria-hidden />
              </>
            ) : null}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 text-center">
              <p className="text-4xl font-semibold drop-shadow">
                {state?.message || idleMessage || (t("posCustomerIdleDefault") || "환영합니다")}
              </p>
              <p className="mt-3 text-lg opacity-90 drop-shadow">{t("posCustomerIdleSub") || "주문을 시작해 주세요."}</p>
            </div>
          </div>
        ) : null}

        {current === "ordering" ? (
          <div className="flex flex-1 flex-col">
            {resolvedBrandLogo ? (
               
              <img
                src={resolvedBrandLogo}
                alt=""
                className="mx-auto mb-4 h-16 max-w-[min(100%,280px)] object-contain"
              />
            ) : null}
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
            {resolvedBrandLogo ? (
               
              <img
                src={resolvedBrandLogo}
                alt=""
                className="mx-auto mb-3 h-16 max-w-[min(100%,280px)] object-contain"
              />
            ) : null}
            <h2 className="mb-3 text-3xl font-semibold text-center">
              {state?.message || paymentMessage || (t("posCustomerPayment") || "결제 진행 중")}
            </h2>
            {Array.isArray(state?.paymentLines) && (state?.paymentLines?.length ?? 0) > 0 ? (
              <div className="mb-4 space-y-1 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-lg">
                {(state?.paymentLines ?? []).map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-white/90">{row.label}</span>
                    <span className="tabular-nums font-semibold">{Number(row.amount || 0).toLocaleString()} ฿</span>
                  </div>
                ))}
              </div>
            ) : null}
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
                    resolveReceiptVatPrintAmount({
                      vatFeeAmt: state.breakdown.vatFeeAmt,
                      receiptVatDisplayAmt: state.breakdown.receiptVatDisplayAmt,
                    }) > 0 ||
                    Number(state.breakdown.serviceFeeAmt || 0) > 0 ||
                    Number(state.breakdown.cardFeeAmt || 0) > 0 ||
                    Number(state.breakdown.otherFeeAmt || 0) > 0
                  ) ? (
                    <div className="mt-4 rounded-xl border border-white/20 p-4 text-lg">
                      <div className="flex items-center justify-between">
                        <span>{t("posSubtotal") || "소계"}</span>
                        <span>
                          {Number(
                            resolveReceiptSubtotalPrintAmount({
                              subtotal: state.breakdown.subtotal,
                              vatFeeMode: state.breakdown.vatMode,
                              receiptExclusiveSubtotalDisplay: state.breakdown.receiptExclusiveSubtotalDisplay,
                              receiptTaxableGrossForDisplay: state.breakdown.receiptTaxableGrossForDisplay,
                            }) || 0
                          ).toLocaleString()}
                        </span>
                      </div>
                      {Number(state.breakdown.discountAmt || 0) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{t("posDiscount") || "할인"}</span>
                          <span>-{Number(state.breakdown.discountAmt || 0).toLocaleString()}</span>
                        </div>
                      ) : null}
                      {resolveReceiptVatPrintAmount({
                        vatFeeAmt: state.breakdown.vatFeeAmt,
                        receiptVatDisplayAmt: state.breakdown.receiptVatDisplayAmt,
                      }) > 0 ? (
                        <div className="mt-1 flex items-center justify-between">
                          <span>{formatFeeLabel(t("vatFee") || "부가세", state.breakdown.vatRate, state.breakdown.vatMode)}</span>
                          <span>
                            {Number(
                              resolveReceiptVatPrintAmount({
                                vatFeeAmt: state.breakdown.vatFeeAmt,
                                receiptVatDisplayAmt: state.breakdown.receiptVatDisplayAmt,
                              }) || 0
                            ).toLocaleString()}
                          </span>
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
            {resolvedBrandLogo ? (
               
              <img
                src={resolvedBrandLogo}
                alt=""
                className="mb-4 h-16 max-w-[min(100%,280px)] object-contain"
              />
            ) : null}
            <h2 className="mb-2 text-3xl font-semibold">{state?.title || (t("posCustomerQrTitle") || "QR 코드")}</h2>
            {state?.message ? <p className="mb-4 max-w-lg text-lg text-white/85">{state.message}</p> : null}
            {qrPayloadText ? (
              <div className="w-full max-w-[520px] rounded-xl bg-white p-3">
                <div className="overflow-hidden rounded-lg border bg-white">
                  {kbankGuidelineCardDataUrl ? (
                    <div className="flex items-center justify-center bg-white p-2">
                      <img
                        src={kbankGuidelineCardDataUrl}
                        alt={resolvedQrType === "CREDIT_CARD" ? "Credit Card QR" : "Thai QR Payment"}
                        className="h-auto w-[360px] max-w-full object-contain"
                      />
                    </div>
                  ) : resolvedQrType === "CREDIT_CARD" ? (
                    <div className="p-6 text-center text-lg text-rose-700">
                      {(t("posPaymentQr") || "QR")} render failed.
                      <div className="mt-2 text-sm text-black/60">
                        Credit Card guideline card was not generated. Please retry Generate QR.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="bg-[#00427A] px-3 py-2">
                        <div
                          className="mx-auto w-[74%] max-w-[320px] [&_svg]:h-auto [&_svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: THAI_QR_PAYMENT_LOGO_SVG }}
                        />
                      </div>
                      <div className="border-t border-[#d8e1ef] bg-white px-3 py-2">
                        <div
                          className="mx-auto w-[52%] max-w-[230px] [&_svg]:h-auto [&_svg]:w-full"
                          dangerouslySetInnerHTML={{ __html: PROMPTPAY_LOGO_SVG }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-center">
                        <img
                          src={`https://quickchart.io/qr?text=${encodeURIComponent(qrPayloadText)}&size=360&margin=1`}
                          alt="Customer QR"
                          className="h-60 w-60 rounded-lg bg-white p-2"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xl opacity-80">{t("posCustomerQrEmpty") || "QR 데이터가 없습니다."}</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
