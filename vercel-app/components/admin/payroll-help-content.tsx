"use client"

import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

/**
 * 급여 관리 > 도움말 탭 본문 — PageHelp 시트에서도 동일하게 사용해 중복을 막는다.
 */
export function PayrollHelpContent({ className }: { className?: string }) {
  const t = useT(useLang().lang)
  return (
    <div className={cn("rounded-lg border border-border bg-card p-5 space-y-4", className)}>
      <h2 className="text-base font-semibold">{t("pay_help_title")}</h2>
      <p className="text-xs text-muted-foreground">{t("pay_help_intro")}</p>
      <section>
        <h3 className="text-sm font-medium mb-2">{t("pay_help_table_caption")}</h3>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>{t("pay_help_late")}</li>
          <li>{t("pay_help_early")}</li>
          <li>{t("pay_help_ot")}</li>
          <li>{t("pay_help_late_3")}</li>
          <li>{t("pay_help_waive")}</li>
          <li>{t("pay_help_absence")}</li>
          <li>{t("pay_help_holiday")}</li>
          <li>{t("pay_help_haz_grade")}</li>
        </ul>
      </section>
      <section>
        <h3 className="text-sm font-medium mb-1">{t("pay_help_flow_title")}</h3>
        <p className="text-xs text-muted-foreground">{t("pay_help_flow")}</p>
      </section>
    </div>
  )
}
