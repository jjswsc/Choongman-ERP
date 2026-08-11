"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth-context"
import { isLangCode, useLang, type LangCode } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosPrinterSettings } from "@/lib/api-client"
import { PosQrGuidelineCard } from "@/components/pos/pos-qr-guideline-card"
import {
  readPosCustomerDisplayState,
  subscribePosCustomerDisplayState,
  type PosCustomerDisplayPayload,
} from "@/lib/pos-customer-display-state"
import { resolveReceiptSubtotalPrintAmount, resolveReceiptVatPrintAmount } from "@/lib/pos-pricing"
import { formatBahtNum } from "@/lib/utils"

type DisplayTheme = "dark" | "light" | "brand"

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

  const renderTotalWithBreakdown = () => {
    if (!showOrderTotal || state?.showOrderTotal === false) return null
    const bd = state?.breakdown
    const showBreakdownRows =
      bd &&
      (Number(bd.discountAmt || 0) > 0 ||
        resolveReceiptVatPrintAmount({
          vatFeeAmt: bd.vatFeeAmt,
          receiptVatDisplayAmt: bd.receiptVatDisplayAmt,
        }) > 0 ||
        Number(bd.serviceFeeAmt || 0) > 0 ||
        Number(bd.cardFeeAmt || 0) > 0 ||
        Number(bd.otherFeeAmt || 0) > 0)
    return (
      <div className="shrink-0">
        {showBreakdownRows && bd ? (
          <div className="mt-3 rounded-xl border border-white/20 p-3 text-lg md:mt-4 md:p-4">
            <div className="flex items-center justify-between">
              <span>{t("posSubtotal") || "소계"}</span>
              <span>
                {Number(
                  resolveReceiptSubtotalPrintAmount({
                    subtotal: bd.subtotal,
                    vatFeeMode: bd.vatMode,
                    receiptExclusiveSubtotalDisplay: bd.receiptExclusiveSubtotalDisplay,
                    receiptTaxableGrossForDisplay: bd.receiptTaxableGrossForDisplay,
                  }) || 0
                ).toLocaleString()}
              </span>
            </div>
            {Number(bd.discountAmt || 0) > 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <span>{t("posDiscount") || "할인"}</span>
                <span>-{Number(bd.discountAmt || 0).toLocaleString()}</span>
              </div>
            ) : null}
            {resolveReceiptVatPrintAmount({
              vatFeeAmt: bd.vatFeeAmt,
              receiptVatDisplayAmt: bd.receiptVatDisplayAmt,
            }) > 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <span>{formatFeeLabel(t("vatFee") || "부가세", bd.vatRate, bd.vatMode)}</span>
                <span>
                  {Number(
                    resolveReceiptVatPrintAmount({
                      vatFeeAmt: bd.vatFeeAmt,
                      receiptVatDisplayAmt: bd.receiptVatDisplayAmt,
                    }) || 0
                  ).toLocaleString()}
                </span>
              </div>
            ) : null}
            {Number(bd.serviceFeeAmt || 0) > 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <span>{formatFeeLabel(t("serviceFee") || "서비스비", bd.serviceRate, bd.serviceMode)}</span>
                <span>+{Number(bd.serviceFeeAmt || 0).toLocaleString()}</span>
              </div>
            ) : null}
            {Number(bd.cardFeeAmt || 0) > 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <span>{formatFeeLabel(t("cardFee") || "카드 수수료", bd.cardRate, bd.cardMode)}</span>
                <span>+{Number(bd.cardFeeAmt || 0).toLocaleString()}</span>
              </div>
            ) : null}
            {Number(bd.otherFeeAmt || 0) > 0 ? (
              <div className="mt-1 flex items-center justify-between">
                <span>{formatFeeLabel(t("otherFee") || "기타 수수료", bd.otherRate, bd.otherMode)}</span>
                <span>+{Number(bd.otherFeeAmt || 0).toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 text-right text-3xl font-bold md:mt-4">
          {(t("posTotal") || "합계")}: {Number(state?.totalAmount || 0).toLocaleString()}
        </div>
      </div>
    )
  }

  const rootClass =
    theme === "light"
      ? "bg-zinc-100 text-zinc-900"
      : theme === "brand"
        ? "bg-gradient-to-br from-emerald-950 via-emerald-800 to-teal-700 text-white"
        : "bg-zinc-950 text-zinc-50"

  const surfaceClass =
    theme === "light"
      ? "border-zinc-200/90 bg-white shadow-[0_12px_40px_-16px_rgba(24,24,27,0.35)]"
      : theme === "brand"
        ? "border-white/15 bg-white/10 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.45)] backdrop-blur-md"
        : "border-zinc-700/80 bg-zinc-900/90 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.65)]"

  const mutedClass = theme === "light" ? "text-zinc-500" : "text-zinc-400"
  const hairlineClass = theme === "light" ? "border-zinc-100" : "border-white/10"
  const totalAccentClass =
    theme === "light"
      ? "bg-zinc-900 text-white"
      : theme === "brand"
        ? "bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-300/30"
        : "bg-amber-400/15 text-amber-50 ring-1 ring-amber-300/25"

  const hasQrOrderItems =
    showOrderSummary &&
    state?.showOrderSummary !== false &&
    Array.isArray(state?.items) &&
    state.items.length > 0
  const hasQrPaymentLines = Array.isArray(state?.paymentLines) && (state?.paymentLines?.length ?? 0) > 0
  const qrTotalBaht = Number(state?.totalAmount || 0)

  return (
    <div className={`flex h-full min-h-0 w-full flex-col overflow-hidden ${rootClass}`}>
      <div
        className={`mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden p-5 md:p-8 ${
          current === "qr" ? "max-w-7xl" : "max-w-6xl"
        }`}
      >
        {current !== "qr" ? (
          <div
            className={`mb-4 flex shrink-0 items-center justify-between border-b pb-3 ${
              theme === "light" ? "border-zinc-200" : "border-white/20"
            }`}
          >
            <h1 className="text-2xl font-bold">{t("posCustomerDisplayTitle") || "Customer Display"}</h1>
            <span className={`text-sm ${mutedClass}`}>{storeCode || "-"}</span>
          </div>
        ) : null}

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
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {resolvedBrandLogo ? (
               
              <img
                src={resolvedBrandLogo}
                alt=""
                className="mx-auto mb-3 h-14 max-w-[min(100%,280px)] shrink-0 object-contain md:mb-4 md:h-16"
              />
            ) : null}
            <h2 className="mb-3 shrink-0 text-3xl font-semibold">
              {state?.title || (t("posCustomerOrdering") || "주문 확인")}
            </h2>
            {showOrderSummary && state?.showOrderSummary !== false ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/20 p-4">
                {(state?.items || []).map((it, idx) => (
                  <div key={`${it.name}-${idx}`} className="flex items-center justify-between text-xl">
                    <span>{it.qty} x {it.name}</span>
                    <span>{Number(it.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-0 flex-1 rounded-xl border border-white/20 p-4 text-xl">
                {t("posCustomerOrderingInProgress") || "주문 진행 중"}
              </div>
            )}
            {renderTotalWithBreakdown()}
          </div>
        ) : null}

        {current === "payment" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {resolvedBrandLogo ? (
               
              <img
                src={resolvedBrandLogo}
                alt=""
                className="mx-auto mb-3 h-14 max-w-[min(100%,280px)] shrink-0 object-contain md:h-16"
              />
            ) : null}
            <h2 className="mb-3 shrink-0 text-center text-3xl font-semibold">
              {state?.message || paymentMessage || (t("posCustomerPayment") || "결제 진행 중")}
            </h2>
            {Array.isArray(state?.paymentLines) && (state?.paymentLines?.length ?? 0) > 0 ? (
              <div className="mb-3 shrink-0 space-y-1 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-lg">
                {(state?.paymentLines ?? []).map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <span className="text-white/90">{row.label}</span>
                    <span className="tabular-nums font-semibold">{Number(row.amount || 0).toLocaleString()} ฿</span>
                  </div>
                ))}
              </div>
            ) : null}
            {showOrderSummary && state?.showOrderSummary !== false && Array.isArray(state?.items) && state.items.length > 0 ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-white/20 p-4">
                {state.items.map((it, idx) => (
                  <div key={`${it.name}-${idx}`} className="flex items-center justify-between text-xl">
                    <span>{it.qty} x {it.name}</span>
                    <span>{Number(it.amount || 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-0 flex-1 rounded-xl border border-white/20 p-4 text-xl text-center">
                {t("posCustomerPayment") || "결제 진행 중"}
              </div>
            )}
            {renderTotalWithBreakdown()}
          </div>
        ) : null}

        {current === "change" ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-4 text-center">
            {resolvedBrandLogo ? (
              <img
                src={resolvedBrandLogo}
                alt=""
                className="mb-6 h-16 max-w-[min(100%,280px)] object-contain"
              />
            ) : null}
            <h2 className="text-3xl font-semibold md:text-4xl">
              {state?.title || (t("posCashChangePostPaymentTitle") || "거스름돈")}
            </h2>
            <p className="mt-4 max-w-xl text-lg opacity-90 md:text-xl">
              {state?.message ||
                (t("posCashChangePostPaymentBody") || "결제가 완료되었습니다. 아래 금액을 거슬러 주세요.")}
            </p>
            <div
              className={
                theme === "light"
                  ? "mt-8 w-full max-w-lg rounded-2xl border border-emerald-300/70 bg-emerald-50 px-6 py-8"
                  : "mt-8 w-full max-w-lg rounded-2xl border border-emerald-400/40 bg-emerald-500/15 px-6 py-8"
              }
            >
              <p
                className={
                  theme === "light"
                    ? "text-base font-semibold text-emerald-800"
                    : "text-base font-semibold text-emerald-200"
                }
              >
                {t("posCashChangeAmount") || "거슬러줄 금액"}
              </p>
              <p
                className={
                  theme === "light"
                    ? "mt-3 text-5xl font-extrabold tabular-nums tracking-tight text-emerald-700 md:text-6xl"
                    : "mt-3 text-5xl font-extrabold tabular-nums tracking-tight text-emerald-300 md:text-6xl"
                }
              >
                {formatBahtNum(state?.changeAmountBaht)} ฿
              </p>
            </div>
          </div>
        ) : null}

        {current === "qr" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-4 flex shrink-0 items-center justify-between gap-3 md:mb-5">
              <div className="min-w-0">
                {resolvedBrandLogo ? (
                  <img
                    src={resolvedBrandLogo}
                    alt=""
                    className="mb-2 h-10 max-w-[180px] object-contain object-left md:h-12 md:max-w-[220px]"
                  />
                ) : null}
                <p className={`text-xs font-medium uppercase tracking-[0.14em] ${mutedClass}`}>
                  {storeCode || "POS"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
                  {state?.title || (t("posCustomerQrTitle") || "QR 코드")}
                </h2>
                <p className={`mt-1 max-w-xl text-sm md:text-base ${mutedClass}`}>
                  {state?.message || (t("posScanToPayHint") || "스캔 후 결제해 주세요.")}
                </p>
              </div>
              {showOrderTotal && state?.showOrderTotal !== false && qrTotalBaht > 0 ? (
                <div
                  className={`hidden shrink-0 rounded-2xl px-5 py-3 text-right sm:block ${totalAccentClass}`}
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">
                    {t("posTotal") || "합계"}
                  </p>
                  <p className="mt-0.5 text-3xl font-bold tabular-nums tracking-tight md:text-4xl">
                    {formatBahtNum(qrTotalBaht)}
                    <span className="ml-1 text-lg font-semibold opacity-80">฿</span>
                  </p>
                </div>
              ) : null}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-6">
              <section className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border ${surfaceClass}`}>
                <div className={`shrink-0 border-b px-5 py-3 md:px-6 ${hairlineClass}`}>
                  <p className="text-sm font-semibold tracking-tight md:text-base">
                    {t("posCustomerOrdering") || "주문 확인"}
                  </p>
                </div>

                {hasQrPaymentLines ? (
                  <div className={`shrink-0 space-y-2 border-b px-5 py-3 md:px-6 ${hairlineClass}`}>
                    {(state?.paymentLines ?? []).map((row, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm md:text-base">
                        <span className={mutedClass}>{row.label}</span>
                        <span className="tabular-nums font-semibold">
                          {formatBahtNum(row.amount)} ฿
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {hasQrOrderItems ? (
                  <div className="min-h-0 flex-1 space-y-0 overflow-y-auto px-2 py-2 md:px-3">
                    {state!.items!.map((it, idx) => (
                      <div
                        key={`${it.name}-${idx}`}
                        className={`flex items-start justify-between gap-3 px-3 py-3 md:px-4 md:py-3.5 ${
                          idx > 0 ? `border-t ${hairlineClass}` : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-base font-medium leading-snug md:text-lg">{it.name}</p>
                          <p className={`mt-0.5 text-sm tabular-nums ${mutedClass}`}>× {it.qty}</p>
                        </div>
                        <p className="shrink-0 text-base font-semibold tabular-nums md:text-lg">
                          {formatBahtNum(it.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`flex min-h-0 flex-1 items-center justify-center px-6 text-center text-base ${mutedClass}`}>
                    {t("posScanToPayHint") || "스캔 후 결제해 주세요."}
                  </div>
                )}

                {showOrderTotal && state?.showOrderTotal !== false ? (
                  <div className={`shrink-0 border-t px-5 py-4 md:px-6 md:py-5 ${hairlineClass}`}>
                    {state?.breakdown &&
                    (Number(state.breakdown.discountAmt || 0) > 0 ||
                      resolveReceiptVatPrintAmount({
                        vatFeeAmt: state.breakdown.vatFeeAmt,
                        receiptVatDisplayAmt: state.breakdown.receiptVatDisplayAmt,
                      }) > 0) ? (
                      <div className={`mb-3 space-y-1 text-sm ${mutedClass}`}>
                        {Number(state.breakdown.discountAmt || 0) > 0 ? (
                          <div className="flex justify-between gap-3">
                            <span>{t("posDiscount") || "할인"}</span>
                            <span className="tabular-nums">
                              -{formatBahtNum(state.breakdown.discountAmt)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex items-end justify-between gap-3">
                      <span className={`text-sm font-medium md:text-base ${mutedClass}`}>
                        {t("posTotal") || "합계"}
                      </span>
                      <span className="text-3xl font-bold tabular-nums tracking-tight md:text-4xl">
                        {formatBahtNum(qrTotalBaht)}
                        <span className={`ml-1 text-lg font-semibold ${mutedClass}`}>฿</span>
                      </span>
                    </div>
                  </div>
                ) : null}
              </section>

              <section
                className={`flex min-h-0 min-w-0 flex-col items-center justify-center overflow-auto rounded-3xl border px-4 py-5 md:px-6 md:py-6 ${surfaceClass}`}
              >
                <p className={`mb-4 text-center text-sm font-medium md:text-base ${mutedClass}`}>
                  {t("posScanToPayHint") || "스캔 후 결제해 주세요."}
                </p>
                {qrPayloadText ? (
                  <div className="w-full max-w-[320px] rounded-2xl bg-white p-3 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.35)] ring-1 ring-black/5 md:max-w-[340px] md:p-4">
                    <div className="overflow-hidden rounded-xl">
                      {qrPayloadText.startsWith("000201") ? (
                        <PosQrGuidelineCard
                          payload={qrPayloadText}
                          kind={resolvedQrType}
                          qrClassName="h-[260px] w-[260px] md:h-[280px] md:w-[280px]"
                        />
                      ) : (
                        <div className="p-8 text-center text-base text-zinc-500">
                          {t("posCustomerQrEmpty") || "QR 데이터가 없습니다."}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className={`text-lg ${mutedClass}`}>
                    {t("posCustomerQrEmpty") || "QR 데이터가 없습니다."}
                  </p>
                )}
                {showOrderTotal && state?.showOrderTotal !== false && qrTotalBaht > 0 ? (
                  <div className="mt-5 text-center sm:hidden">
                    <p className={`text-xs uppercase tracking-wider ${mutedClass}`}>
                      {t("posTotal") || "합계"}
                    </p>
                    <p className="mt-1 text-3xl font-bold tabular-nums">
                      {formatBahtNum(qrTotalBaht)}
                      <span className={`ml-1 text-base ${mutedClass}`}>฿</span>
                    </p>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
