"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useAppBrandConfig } from "@/components/app-brand-provider"

export function SaasHeader() {
  const router = useRouter()
  const { auth, logout } = useAuth()
  const brand = useAppBrandConfig()

  const handleLogout = () => {
    logout()
    router.replace("/saas-admin/login")
  }

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
        <span className="text-sm font-semibold">{brand.headerTitle} Admin</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {auth?.company || "Global"} / {auth?.store || "-"}
        </span>
        <Button type="button" size="sm" variant="outline" onClick={handleLogout}>
          로그아웃
        </Button>
      </div>
    </header>
  )
}
