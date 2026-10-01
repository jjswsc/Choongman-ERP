"use client"

import * as React from "react"
import Link from "next/link"
import { Facebook, Music2, Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getMetaConnectionStatus, syncMetaAds } from "@/lib/api-client/marketing-meta"
import { getTikTokConnectionStatus, syncTikTokAds } from "@/lib/api-client/marketing-tiktok"
import { cn } from "@/lib/utils"

function fmt(n: number) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "—"
}

/** Meta + TikTok 최근 동기화 요약 (채널 비교). */
export function MarketingChannelDashboardPanel({ compact }: { compact?: boolean }) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [meta, setMeta] = React.useState<Awaited<ReturnType<typeof getMetaConnectionStatus>> | null>(null)
  const [tiktok, setTikTok] = React.useState<Awaited<ReturnType<typeof getTikTokConnectionStatus>> | null>(
    null
  )

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [m, tk] = await Promise.all([
        getMetaConnectionStatus().catch(() => null),
        getTikTokConnectionStatus().catch(() => null),
      ])
      setMeta(m)
      setTikTok(tk)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const metaSpend = Number(meta?.lastSync?.adsTotals?.spend || 0)
  const metaImpr = Number(meta?.lastSync?.adsTotals?.impressions || 0)
  const ttSpend = Number(tiktok?.lastSync?.adsTotals?.spend || 0)
  const ttImpr = Number(tiktok?.lastSync?.adsTotals?.impressions || 0)
  const plat = meta?.lastSync?.platformSpend

  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", compact && "p-3")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{t("marketingChannelDashTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("marketingChannelDashSub")}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || loading}
          onClick={() => {
            setBusy(true)
            void Promise.all([
              meta?.connected ? syncMetaAds() : Promise.resolve(null),
              tiktok?.connected ? syncTikTokAds() : Promise.resolve(null),
            ])
              .then(load)
              .finally(() => setBusy(false))
          }}
        >
          {busy || loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCw className="mr-1 h-3.5 w-3.5" />}
          {t("marketingChannelDashSync")}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              <Facebook className="h-4 w-4 text-[#1877F2]" />
              Meta
            </div>
            <Badge variant={meta?.connected ? "default" : "secondary"}>
              {meta?.connected ? t("marketingMetaConnected") : t("marketingMetaDisconnected")}
            </Badge>
          </div>
          {meta?.pageName ? (
            <p className="text-xs text-muted-foreground">
              {meta.pageName}
              {meta.instagram?.username || meta.lastSync?.instagram?.username
                ? ` · @${meta.instagram?.username || meta.lastSync?.instagram?.username}`
                : ""}
            </p>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t("marketingMetaStatSpend")}</div>
              <div className="font-semibold">{fmt(metaSpend)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("marketingMetaStatImpr")}</div>
              <div className="font-semibold">{fmt(metaImpr)}</div>
            </div>
            {plat ? (
              <>
                <div className="text-xs">
                  FB {fmt(Number(plat.facebook || 0))} · IG {fmt(Number(plat.instagram || 0))}
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              <Music2 className="h-4 w-4" />
              TikTok
            </div>
            <Badge variant={tiktok?.connected ? "default" : "secondary"}>
              {tiktok?.connected ? t("marketingTikTokConnected") : t("marketingTikTokDisconnected")}
            </Badge>
          </div>
          {tiktok?.advertiserName ? (
            <p className="text-xs text-muted-foreground">{tiktok.advertiserName}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Link className="underline" href="/admin/marketing/integrations">
                {t("marketingChannelDashConnectTikTok")}
              </Link>
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{t("marketingMetaStatSpend")}</div>
              <div className="font-semibold">{fmt(ttSpend)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t("marketingMetaStatImpr")}</div>
              <div className="font-semibold">{fmt(ttImpr)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
