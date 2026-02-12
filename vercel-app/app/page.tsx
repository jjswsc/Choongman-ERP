"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/app-header"
import { AppNavigation } from "@/components/app-navigation"
import { useAuth } from "@/lib/auth-context"
import { HomeTab } from "@/components/tabs/home-tab"
import { OrderTab } from "@/components/tabs/order-tab"
import { UsageTab } from "@/components/tabs/usage-tab"
import { TimesheetTab } from "@/components/tabs/timesheet-tab"
import { AdminTab } from "@/components/tabs/admin-tab"
import { PlaceholderTab } from "@/components/tabs/placeholder-tab"

export default function DashboardPage() {
  const router = useRouter()
  const { auth, initialized } = useAuth()
  const [activeTab, setActiveTab] = useState("home")

  useEffect(() => {
    if (!initialized) return
    if (!auth) {
      router.replace("/login")
      return
    }
  }, [auth, initialized, router])

  if (!initialized || !auth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background">
      <AppHeader />
      <AppNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="pb-8">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "orders" && <OrderTab />}
        {activeTab === "usage" && <UsageTab />}
        {activeTab === "hr" && <PlaceholderTab title="인사" />}
        {activeTab === "timesheet" && <TimesheetTab />}
        {activeTab === "visit" && <PlaceholderTab title="방문" />}
        {activeTab === "admin" && <AdminTab />}
      </main>
    </div>
  )
}
