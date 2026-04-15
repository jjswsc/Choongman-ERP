"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAppBrandConfig } from "@/components/app-brand-provider"

const SAAS_NAV_KEYS = [
  { href: "/saas-admin", titleKey: "saasAdminNavDashboard" as const },
  { href: "/saas-admin/customers", titleKey: "saasAdminNavCustomers" as const },
  { href: "/saas-admin/stores", titleKey: "saasAdminNavStores" as const },
  { href: "/saas-admin/users", titleKey: "saasAdminNavUsers" as const },
]

export function SaasSidebar() {
  const pathname = usePathname()
  const brand = useAppBrandConfig()
  const { lang } = useLang()
  const t = useT(lang)
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
          <SidebarMenu>
            {SAAS_NAV_KEYS.map((item) => {
              const active = pathname === item.href
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
