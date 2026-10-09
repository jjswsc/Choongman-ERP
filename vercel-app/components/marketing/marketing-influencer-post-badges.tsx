"use client"

import { cn } from "@/lib/utils"

type TFn = (key: string) => string

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: "bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200",
  billed: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200",
}

/** 업로드 기록 지급 상태 배지 — 미입력이면 아무것도 표시하지 않음 */
export function InfluencerPaymentBadge({ t, status }: { t: TFn; status: string }) {
  if (!PAYMENT_BADGE[status]) return null
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium", PAYMENT_BADGE[status])}>
      {t(`mktInfPay_${status}`)}
    </span>
  )
}

const LINK_LABEL: Record<string, string> = {
  tiktok: "TT",
  instagram: "IG",
  facebook: "FB",
  youtube: "YT",
  lemon8: "L8",
}

/** 결과물 링크(platform_links) 짧은 칩 */
export function InfluencerPostLinkIcons({ links }: { links?: Record<string, string> | null }) {
  const entries = Object.entries(links || {}).filter(([, v]) => /^https?:\/\//i.test(v))
  if (!entries.length) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <a
          key={k}
          href={v}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded border border-border/70 px-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
          title={v}
        >
          {LINK_LABEL[k] || k}
        </a>
      ))}
    </span>
  )
}
