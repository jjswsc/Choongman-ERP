"use client"

import Link from "next/link"
import { Megaphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

/** 사이드바에서 뺀 예전 메뉴 북마크용 — 캠페인 카드로 들어가라고 안내 */
export function MarketingEnterViaCampaignBanner() {
  const { lang } = useLang()
  const t = useT(lang)
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-sm">
      <p className="flex items-center gap-2 text-muted-foreground">
        <Megaphone className="h-4 w-4 shrink-0 text-primary" />
        {t("marketingEnterViaCampaign")}
      </p>
      <Button size="sm" variant="outline" className="h-8" asChild>
        <Link href="/admin/marketing/campaigns">{t("marketingEnterViaCampaignCta")}</Link>
      </Button>
    </div>
  )
}
