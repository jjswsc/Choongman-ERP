"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { postTaxBookEntry, type TaxBookPostAction } from "@/lib/api-client/tax-book"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { taxEntityKeyFromScope } from "@/lib/tax-book"

/** PP.30 / 매입 탭에서 세무 장부 전기로 넘기는 브리지 */
export function TaxBooksFilingBridge(props: {
  yearMonth: string
  scopeFilter: string
  /** vat | sales | purchase | all */
  mode?: "vat" | "sales" | "purchase" | "all"
  onOpenVouchers?: () => void
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [posting, setPosting] = React.useState(false)
  const [message, setMessage] = React.useState<string | null>(null)
  const mode = props.mode || "all"
  const entityOk = Boolean(taxEntityKeyFromScope(props.scopeFilter))

  const run = async (action: TaxBookPostAction) => {
    setPosting(true)
    setMessage(null)
    try {
      const res = await postTaxBookEntry({
        action,
        yearMonth: props.yearMonth,
        scopeFilter: props.scopeFilter,
      })
      if (!res.success) {
        setMessage(res.error || t("accCompUnknownError"))
        return
      }
      setMessage(t("taxBooksBridgePosted"))
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30 space-y-2">
      <p className="text-sm font-medium">{t("taxBooksBridgeTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("taxBooksBridgeHint")}</p>
      {!entityOk ? <p className="text-xs text-amber-700">{t("taxBooksNeedEntity")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {mode === "vat" || mode === "all" ? (
          <Button type="button" size="sm" disabled={posting || !entityOk} onClick={() => void run("vat")}>
            {t("taxBooksPostVat")}
          </Button>
        ) : null}
        {mode === "sales" || mode === "all" ? (
          <Button type="button" size="sm" variant="secondary" disabled={posting || !entityOk} onClick={() => void run("sales")}>
            {t("taxBooksPostSales")}
          </Button>
        ) : null}
        {mode === "purchase" || mode === "all" ? (
          <Button type="button" size="sm" variant="secondary" disabled={posting || !entityOk} onClick={() => void run("purchase")}>
            {t("taxBooksPostPurchase")}
          </Button>
        ) : null}
        {props.onOpenVouchers ? (
          <Button type="button" size="sm" variant="outline" onClick={props.onOpenVouchers}>
            {t("taxBooksOpenVouchers")}
          </Button>
        ) : null}
      </div>
      {message ? (
        <p className="text-xs">
          {t(`taxBooksErr_${message}`) !== `taxBooksErr_${message}` ? t(`taxBooksErr_${message}`) : message}
        </p>
      ) : null}
    </div>
  )
}
