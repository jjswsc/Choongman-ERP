"use client"

import Image from "next/image"
import { LogOut, LayoutDashboard, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { canViewMobileStoreSales, isOfficeRole, isManagerRole, isFranchiseeRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { LangCode } from "@/lib/lang-context"
import { useAppBrandConfig } from "@/components/app-brand-provider"

const langOptions: { value: LangCode; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "th", label: "ไทย" },
  { value: "mm", label: "မြန်မာ" },
  { value: "la", label: "ລາວ" },
  { value: "kh", label: "ខ្មែរ" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "ms", label: "Bahasa Melayu" },
]

const langCompactLabel: Record<LangCode, string> = {
  ko: "KO",
  en: "EN",
  th: "TH",
  mm: "MM",
  la: "LA",
  kh: "KH",
  vi: "VI",
  ms: "MS",
}

export function AppHeader() {
  const { auth, logout } = useAuth()
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const brand = useAppBrandConfig()
  /** 본사·매니저·가맹점주만 표시. 일반 매장 직원(staff, pos_staff 등)에게는 숨김 */
  const canShowAdminButton = auth?.role && (isOfficeRole(auth.role) || isManagerRole(auth.role) || isFranchiseeRole(auth.role))
  const canShowStoreSalesButton = Boolean(auth) && canViewMobileStoreSales(auth?.role || "")

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2">
        {brand.key === "omnifoodtech" ? (
          <>
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
              <Image src={brand.logoSymbolSrc} alt={brand.logoAlt} fill className="object-contain" sizes="32px" />
            </div>
            <span className="text-lg font-bold text-sky-400">{brand.headerWordmark}</span>
          </>
        ) : (
          <>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500">
              <span className="text-xs font-bold text-white">CM</span>
            </div>
            <span className="text-lg font-bold text-orange-500">{brand.headerWordmark}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canShowStoreSalesButton && (
          <a
            href="/store-sales"
            className="flex rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t("mobileStoreSalesTitle") || "매장 실시간 매출"}
          >
            <TrendingUp className="h-4 w-4" />
          </a>
        )}
        {canShowAdminButton && (
          <a
            href="/admin"
            className="flex rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t("adminDashboard") || "관리자"}
          >
            <LayoutDashboard className="h-4 w-4" />
          </a>
        )}
        <Select value={lang} onValueChange={(v) => setLang(v as LangCode)}>
          <SelectTrigger className="h-8 w-[3.6rem] text-xs">
            <span className="font-semibold">{langCompactLabel[lang as LangCode] || String(lang).toUpperCase()}</span>
          </SelectTrigger>
          <SelectContent>
            {langOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 whitespace-nowrap text-muted-foreground"
          onClick={logout}
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("logout")}</span>
        </Button>
      </div>
    </header>
  )
}
