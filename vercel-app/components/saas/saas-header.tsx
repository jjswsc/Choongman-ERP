"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang, ADMIN_UI_LANG_OPTIONS } from "@/lib/lang-context"
import type { LangCode } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { useSaasScope } from "@/components/saas/saas-scope-context"

export function SaasHeader() {
  const router = useRouter()
  const { auth, logout } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const brand = useAppBrandConfig()
  const scope = useSaasScope()

  const handleLogout = () => {
    logout()
    router.replace("/saas-admin/login")
  }

  const accountLabel = scope.isPartner
    ? tr(t, "saasAdminHeader_partnerScope", { name: scope.partnerName || scope.partnerId || "—" })
    : `${auth?.company || t("saasAdminGlobalLabel")} / ${auth?.store || "—"}`

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-card px-4 print:hidden">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
        <Image
          src={brand.logoSymbolSrc}
          alt={brand.logoAlt}
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
          unoptimized
        />
        <span className="text-sm font-semibold">
          {brand.headerTitle} {t("saasAdminHeaderSuffix")}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
          <SelectTrigger className="h-8 min-w-[7.5rem] max-w-[10rem] text-xs" aria-label={t("saasAdminLanguageSelect")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ADMIN_UI_LANG_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span
          className={
            scope.isPartner
              ? "rounded-md bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-200"
              : "text-xs text-muted-foreground"
          }
          title={scope.isPartner ? `${auth?.company || ""} / ${auth?.store || ""}` : undefined}
        >
          {accountLabel}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={handleLogout}>
          {t("logout")}
        </Button>
      </div>
    </header>
  )
}
