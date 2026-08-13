"use client"

import * as React from "react"
import {
  DEFAULT_POS_COST_VAT_VIEW,
  readPosCostVatView,
  writePosCostVatView,
  type PosCostVatView,
} from "@/lib/pos-cost-vat"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function usePosCostVatView(): [PosCostVatView, (view: PosCostVatView) => void] {
  const [view, setView] = React.useState<PosCostVatView>(DEFAULT_POS_COST_VAT_VIEW)
  React.useEffect(() => {
    const sync = () => setView(readPosCostVatView())
    sync()
    window.addEventListener("cm-pos-cost-vat-view-changed", sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener("cm-pos-cost-vat-view-changed", sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  const set = React.useCallback((next: PosCostVatView) => {
    setView(next)
    writePosCostVatView(next)
  }, [])
  return [view, set]
}

type Props = {
  value: PosCostVatView
  onChange: (view: PosCostVatView) => void
  className?: string
}

export function PosCostVatViewSelect({ value, onChange, className }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <Select value={value} onValueChange={(v) => onChange(v === "excluded" ? "excluded" : "included")}>
      <SelectTrigger className={className ?? "h-9 w-[168px] text-xs"} title={t("pL_vatDisplayMode")}>
        <SelectValue placeholder={t("pL_vatDisplayMode")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="included">{t("pL_vatDisplayIncluded")}</SelectItem>
        <SelectItem value="excluded">{t("pL_vatDisplayExcluded")}</SelectItem>
      </SelectContent>
    </Select>
  )
}
