"use client"

import { LayoutDashboard } from "lucide-react"
import { StorePageShell } from "@/components/erp/store-page-shell"
import { AdminStoreOpsHub } from "@/components/admin/admin-store-ops-hub"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export default function StoreOpsPage() {
  const t = useT(useLang().lang)
  return (
    <StorePageShell icon={LayoutDashboard} title={t("adminStoreOps")} subtitle={t("store_ops_page_sub")}>
      <AdminStoreOpsHub />
    </StorePageShell>
  )
}
