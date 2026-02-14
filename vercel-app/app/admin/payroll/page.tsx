"use client"

import { useAuth } from "@/lib/auth-context"
import { AdminPlaceholder } from "@/components/admin/admin-placeholder"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

export default function Page() {
  const { auth } = useAuth()
  const t = useT(useLang().lang)
  const isDirector = (auth?.role || "").toLowerCase().includes("director")

  if (!isDirector) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-6 text-center max-w-md">
          <p className="font-semibold text-amber-800 dark:text-amber-200">{t("adminPayroll")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("adminPayrollDirectorOnly")}</p>
        </div>
      </div>
    )
  }

  return <AdminPlaceholder title={t("adminPayroll")} />
}
