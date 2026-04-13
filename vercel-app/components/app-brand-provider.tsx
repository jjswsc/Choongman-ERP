"use client"

import * as React from "react"
import type { AppBrandConfig } from "@/lib/app-brand"
import { getAppBrandConfigFromEnv } from "@/lib/app-brand"

const AppBrandContext = React.createContext<AppBrandConfig | null>(null)

export function AppBrandProvider({
  value,
  children,
}: {
  value: AppBrandConfig
  children: React.ReactNode
}) {
  return <AppBrandContext.Provider value={value}>{children}</AppBrandContext.Provider>
}

export function useAppBrandConfig(): AppBrandConfig {
  const ctx = React.useContext(AppBrandContext)
  if (ctx) return ctx
  return getAppBrandConfigFromEnv()
}
