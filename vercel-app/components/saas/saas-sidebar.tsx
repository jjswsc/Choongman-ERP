"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import Image from "next/image"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { useSaasScope } from "@/components/saas/saas-scope-context"

const ONBOARDING_NAV = [{ href: "/saas-admin/onboarding", titleKey: "saasAdminNavOnboarding" as const }]

const OPS_NAV = [
  { href: "/saas-admin", titleKey: "saasAdminNavDashboard" as const, exact: true, platformOnly: false },
  { href: "/saas-admin/customers", titleKey: "saasAdminNavCustomers" as const, exact: false, platformOnly: false },
  { href: "/saas-admin/partners", titleKey: "saasAdminNavPartners" as const, exact: true, platformOnly: true },
  { href: "/saas-admin/pricing", titleKey: "saasAdminNavPricing" as const, exact: true, platformOnly: true },
  { href: "/saas-admin/stores", titleKey: "saasAdminNavStores" as const, exact: false, platformOnly: false },
  { href: "/saas-admin/users", titleKey: "saasAdminNavUsers" as const, exact: false, platformOnly: false },
]

export function SaasSidebar() {
  const pathname = usePathname()
  const brand = useAppBrandConfig()
  const { lang } = useLang()
  const t = useT(lang)
  const scope = useSaasScope()

  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))
  const opsNav = OPS_NAV.filter((item) => !item.platformOnly || scope.isPlatform)

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center gap-2">
            <Image
              src={brand.logoSymbolSrc}
              alt={brand.logoAlt}
              width={14}
              height={14}
              className="h-3.5 w-3.5 object-contain"
              unoptimized
            />
            {brand.headerTitle}
          </SidebarGroupLabel>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("saasAdminNavGroupOnboarding")}</SidebarGroupLabel>
          <SidebarMenu>
            {ONBOARDING_NAV.map((item) => {
              const active = isActive(item.href, true)
              const label = t(item.titleKey)
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={label}>
                    <Link href={item.href}>{label}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("saasAdminNavGroupOps")}</SidebarGroupLabel>
          <SidebarMenu>
            {opsNav.map((item) => {
              const active = isActive(item.href, item.exact)
              const label = t(item.titleKey)
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={label}>
                    <Link href={item.href}>{label}</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
