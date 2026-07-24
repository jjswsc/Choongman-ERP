"use client"

import * as React from "react"
import { Bell } from "lucide-react"
import {
  MP_MAX_WIDTH,
  MP_SHEET_BOTTOM_OFFSET,
  MP_SHEET_MAX_HEIGHT_ABOVE_NAV,
} from "@/lib/member-portal-design"
import { formatDateTime, formatPoints } from "@/components/member-portal/portal-ui"
import type { MemberPortalNotifItem } from "@/lib/member-portal-notifications"
import { memberPortalPointKindLabel, type MemberPortalKey } from "@/lib/member-portal-i18n"

type Props = {
  open: boolean
  items: MemberPortalNotifItem[]
  locale: string
  lang: Parameters<typeof memberPortalPointKindLabel>[0]
  t: (key: MemberPortalKey) => string
  formatStampItem: (item: MemberPortalNotifItem) => string
  onClose: () => void
}

export function MemberPortalNotificationsSheet({
  open,
  items,
  locale,
  lang,
  t,
  formatStampItem,
  onClose,
}: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label={t("notifClose")}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} overflow-hidden rounded-t-[1.75rem] border border-[#eee3d6] bg-[#fffdfa] shadow-[0_-12px_40px_rgba(40,24,12,0.18)]`}
        style={{ marginBottom: MP_SHEET_BOTTOM_OFFSET, maxHeight: MP_SHEET_MAX_HEIGHT_ABOVE_NAV }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mp-notif-title"
      >
        <div className="border-b border-[#f0e6da] px-5 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#e8dccf]" />
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#fff0e5] text-[#e85a12]">
              <Bell className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 id="mp-notif-title" className="text-base font-extrabold text-[#1c1c1c]">
                {t("notifTitle")}
              </h3>
              <p className="text-[11px] text-[#8a7a6a]">{t("notifSub")}</p>
            </div>
          </div>
        </div>

        <div className="max-h-[min(58dvh,420px)] overflow-y-auto px-4 py-3">
          {items.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9a8b7c]">{t("notifEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const title =
                  item.kind === "point"
                    ? t("notifPointTitle")
                    : t("notifStampTitle")
                let body = ""
                if (item.kind === "point") {
                  const kindLabel = memberPortalPointKindLabel(lang, item.pointKind || "earn")
                  const pts = formatPoints(Math.abs(Number(item.points || 0)))
                  const sign = Number(item.points || 0) >= 0 ? "+" : "−"
                  body = `${kindLabel} ${sign}${pts}`
                  if (item.note) body += ` · ${item.note}`
                } else {
                  body = formatStampItem(item)
                  if (item.stampBalanceAfter != null) {
                    body += ` · ${t("notifStampBalance").replace("{n}", String(item.stampBalanceAfter))}`
                  }
                  if (item.storeCode) body += ` · ${item.storeCode}`
                }
                return (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-[#f0e6da] bg-white px-3.5 py-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-[#222]">{title}</p>
                      <time className="shrink-0 text-[10px] text-[#a09080]">
                        {formatDateTime(item.createdAt, locale)}
                      </time>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#5c5046]">{body}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#f0e6da] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-[#ff5b18] py-3.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(255,91,24,0.28)]"
          >
            {t("notifClose")}
          </button>
        </div>
      </div>
    </div>
  )
}
