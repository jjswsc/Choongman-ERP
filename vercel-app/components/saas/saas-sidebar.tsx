"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { useAppBrandConfig } from "@/components/app-brand-provider"

const SAAS_NAV = [
  { href: "/saas-admin", label: "대시보드" },
  { href: "/saas-admin/customers", label: "고객사" },
  { href: "/saas-admin/stores", label: "매장" },
  { href: "/saas-admin/users", label: "사용자" },
]

export function SaasSidebar() {
  const pathname = usePathname()
  const brand = useAppBrandConfig()
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
            {SAAS_NAV.map((item) => {
              const active = pathname === item.href
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <Link href={item.href}>{item.label}</Link>
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
