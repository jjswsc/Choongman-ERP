"use client"

import Link from "next/link"
import { useCallback } from "react"
import { appAlert } from "@/lib/app-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useSaasCustomerLoginAccounts } from "@/hooks/use-saas-customer-login-accounts"
import { buildCustomerAdminLoginHref } from "@/lib/saas-customer-login-info"
import { isSaasPlatformInternalTenant } from "@/lib/saas-platform-internal-tenant"
import { tr, useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

type Props = {
  tenantId: string
  companyName: string
  isPlatformInternal?: boolean
}

export function SaasCustomerLoginInfoPanel({ tenantId, companyName, isPlatformInternal }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const { accounts, loading, loadError, primary, loginHref, reload } = useSaasCustomerLoginAccounts(
    tenantId,
    companyName
  )

  const copyLine = useCallback(
    async (company: string, store: string, name: string) => {
      const line = tr(t, "saasAdminCust_loginCopyLine", { company, store, name })
      try {
        await navigator.clipboard.writeText(line)
        await appAlert(t("saasAdminCust_loginCopyDone"))
      } catch {
        await appAlert(line)
      }
    },
    [t]
  )

  const internal = isPlatformInternal ?? isSaasPlatformInternalTenant({ id: tenantId, isPlatformInternal })

  return (
    <Card className="border-sky-200/60 shadow-sm dark:border-sky-900/40">
      <CardHeader className="rounded-t-xl border-b bg-gradient-to-r from-sky-50/80 to-transparent pb-3 dark:from-sky-950/30">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("saasAdminCust_loginInfoTitle")}</CardTitle>
            <CardDescription className="mt-1">{t("saasAdminCust_loginInfoDesc")}</CardDescription>
          </div>
          {internal ? (
            <Badge variant="secondary">{t("saasAdminCust_platformInternalBadge")}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {internal ? (
          <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100/95">
            {t("saasAdminCust_platformInternalHint")}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">{t("saasAdmin_loading")}</p> : null}
        {!loading && loadError ? (
          <p className="text-sm text-destructive">
            {tr(t, "saasAdminCust_loginInfoLoadFailed", { msg: loadError })}
          </p>
        ) : null}

        {!loading && !loadError && accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("saasAdminCust_loginInfoEmpty")}</p>
        ) : null}

        {!loading && accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((row) => {
              const href = buildCustomerAdminLoginHref({
                company: row.company || companyName,
                store: row.store,
                name: row.name,
              })
              return (
                <div
                  key={row.id || `${row.store}-${row.name}`}
                  className="space-y-2 rounded-lg border border-slate-200/80 bg-gradient-to-br from-muted/40 to-background p-3 text-sm shadow-sm dark:border-slate-800"
                >
                  <div className="grid gap-1 sm:grid-cols-2">
                    <p>
                      {t("saasAdminCust_loginFieldCompany")}: <strong>{row.company || companyName}</strong>
                    </p>
                    <p>
                      {t("saasAdminCust_loginFieldStore")}: <strong>{row.store}</strong>
                    </p>
                    <p>
                      {t("saasAdminCust_loginFieldName")}: <strong>{row.name}</strong>
                    </p>
                    <p>
                      {t("saasAdminCust_loginFieldRole")}: <strong>{row.role || "-"}</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="bg-sky-600 text-white hover:bg-sky-700" asChild>
                      <Link href={href}>{t("saasAdminCust_loginLink")}</Link>
                    </Button>
                    <Button type="button" size="sm" variant="outline" asChild>
                      <Link href={href} target="_blank" rel="noopener noreferrer">
                        {t("saasAdminCust_loginNewTab")}
                      </Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void copyLine(row.company || companyName, row.store, row.name)}
                    >
                      {t("saasAdminCust_loginCopyLineBtn")}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
            {t("saasAdminCust_loginInfoRefresh")}
          </Button>
          {primary ? (
            <Button type="button" size="sm" className="shadow-sm shadow-primary/20" asChild>
              <Link href={loginHref} target="_blank" rel="noopener noreferrer">
                {t("saasAdminCust_loginOpenPrimary")}
              </Link>
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">{t("saasAdminCust_loginInfoPwHint")}</p>
      </CardContent>
    </Card>
  )
}
