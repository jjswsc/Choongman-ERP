"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { apiFetch } from "@/lib/api/fetch"
import {
  DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES,
  MEMBER_PORTAL_HOME_PRIVILEGE_ICONS,
  MEMBER_PORTAL_HOME_PRIVILEGE_LINK_TABS,
  memberPortalHomePrivilegeItemToForm,
  type MemberPortalHomePrivilegeItem,
} from "@/lib/member-portal-home-privileges-config"

type MemberPortalHomePrivilegesAdminPanelProps = {
  canEdit?: boolean
  onNotice?: (message: string) => void
  onError?: (message: string) => void
}

export function MemberPortalHomePrivilegesAdminPanel({
  canEdit = true,
  onNotice,
  onError,
}: MemberPortalHomePrivilegesAdminPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [items, setItems] = React.useState<MemberPortalHomePrivilegeItem[]>(
    DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES.map(memberPortalHomePrivilegeItemToForm)
  )
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/home-privileges", { cache: "no-store" })
      const data = (await res.json()) as { success: boolean; items?: MemberPortalHomePrivilegeItem[]; message?: string }
      if (!data.success) throw new Error(data.message || t("mpAdmin_errLoadContent"))
      setItems((data.items || DEFAULT_MEMBER_PORTAL_HOME_PRIVILEGES).map(memberPortalHomePrivilegeItemToForm))
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("mpAdmin_errLoadContent"))
    } finally {
      setLoading(false)
    }
  }, [onError, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const updateItem = (index: number, patch: Partial<MemberPortalHomePrivilegeItem>) => {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const updateLocalized = (
    index: number,
    field: "title" | "subtitle",
    locale: "ko" | "en" | "th",
    value: string
  ) => {
    setItems((prev) =>
      prev.map((row, i) =>
        i === index
          ? {
              ...row,
              [field]: {
                ...row[field],
                [locale]: value,
              },
            }
          : row
      )
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/member-portal/admin/settings/home-privileges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = (await res.json()) as { success: boolean; items?: MemberPortalHomePrivilegeItem[]; message?: string }
      if (!data.success) throw new Error(data.message || t("mpAdmin_errSave"))
      setItems((data.items || items).map(memberPortalHomePrivilegeItemToForm))
      onNotice?.(t("mpAdmin_homePrivilegesSaved"))
    } catch (e) {
      onError?.(e instanceof Error ? e.message : t("mpAdmin_errSaveGeneric"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">{t("mpAdmin_homePrivilegesTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("mpAdmin_homePrivilegesDesc")}</p>
      </div>
      <fieldset disabled={!canEdit || loading} className="space-y-4 disabled:opacity-60">
        {items.map((item, index) => (
          <div key={item.id || index} className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">
                {t("mpAdmin_homePrivilegesSlot")} {index + 1}
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`home-priv-enabled-${index}`}
                  checked={item.enabled}
                  onCheckedChange={(checked) => updateItem(index, { enabled: checked === true })}
                />
                <Label htmlFor={`home-priv-enabled-${index}`} className="text-xs text-muted-foreground">
                  {t("mpAdmin_homePrivilegesEnabled")}
                </Label>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_homePrivilegesIcon")}</Label>
                <Select value={item.icon} onValueChange={(value) => updateItem(index, { icon: value as typeof item.icon })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_PORTAL_HOME_PRIVILEGE_ICONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        {t(`mpAdmin_homePrivilegesIcon_${icon}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("mpAdmin_homePrivilegesLinkTab")}</Label>
                <Select
                  value={item.linkTab}
                  onValueChange={(value) => updateItem(index, { linkTab: value as typeof item.linkTab })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMBER_PORTAL_HOME_PRIVILEGE_LINK_TABS.map((tab) => (
                      <SelectItem key={tab} value={tab}>
                        {t(`mpAdmin_homePrivilegesLink_${tab}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(["ko", "en", "th"] as const).map((locale) => (
              <div key={locale} className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    {t("mpAdmin_homePrivilegesTitleLabel")} ({locale.toUpperCase()})
                  </Label>
                  <Input
                    value={item.title[locale]}
                    onChange={(e) => updateLocalized(index, "title", locale, e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("mpAdmin_homePrivilegesSubtitleLabel")} ({locale.toUpperCase()})
                  </Label>
                  <Input
                    value={item.subtitle[locale]}
                    onChange={(e) => updateLocalized(index, "subtitle", locale, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={!canEdit || saving || loading}>
          {saving ? t("mpAdmin_saving") : t("mpAdmin_homePrivilegesSave")}
        </Button>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {t("mpAdmin_reload")}
        </Button>
      </div>
    </div>
  )
}
