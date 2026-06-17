"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import {
  resolveSaasPartnerLoginCompany,
  resolveSaasPartnerLoginStore,
} from "@/lib/saas-partner-login-defaults"

type PartnerRow = {
  id: string
  name: string
  defaultMarginPct: number
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  isActive: boolean
  tenantCount?: number
  userCount?: number
}

type CreatedLoginAccount = {
  company: string
  store: string
  name: string
  employeeId: number
}

export default function SaasPartnersPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const scope = useSaasScope()
  const loginCompany = useMemo(() => resolveSaasPartnerLoginCompany(), [])
  const loginStore = useMemo(() => resolveSaasPartnerLoginStore(), [])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [partnerId, setPartnerId] = useState("")
  const [partnerName, setPartnerName] = useState("")
  const [margin, setMargin] = useState("15")
  const [loginName, setLoginName] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/saasAdminPartners")
      const json = (await res.json()) as { success?: boolean; partners?: PartnerRow[]; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errLoad"))
        return
      }
      setPartners(json.partners || [])
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const savePartner = async () => {
    const id = partnerId.trim().toLowerCase()
    const name = partnerName.trim()
    const adminName = loginName.trim()
    const adminPassword = loginPassword.trim()
    if (!id || !name) {
      await appAlert(t("saasAdminPartners_errRequired"))
      return
    }
    if (!adminName || !adminPassword) {
      await appAlert(t("saasAdminPartners_errLoginRequired"))
      return
    }
    if (adminPassword.length < 4) {
      await appAlert(t("saasAdminPartners_errPasswordMin"))
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminPartners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner: {
            id,
            name,
            defaultMarginPct: Math.max(0, Number(margin || 0)),
            isActive: true,
            loginAccount: {
              name: adminName,
              password: adminPassword,
            },
          },
        }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        loginAccount?: CreatedLoginAccount | null
      }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      setPartnerId("")
      setPartnerName("")
      setLoginName("")
      setLoginPassword("")
      await load()
      const creds = json.loginAccount
      if (creds) {
        await appAlert(
          tr(t, "saasAdminPartners_savedWithLogin", {
            company: creds.company,
            store: creds.store,
            name: creds.name,
          })
        )
      } else {
        await appAlert(t("saasAdminPartners_saved"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!scope.isPlatform) {
    return (
      <main className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold">{t("saasAdminNavPartners")}</h1>
        <p className="text-sm text-muted-foreground">
          {tr(t, "saasAdminPartners_partnerView", { name: scope.partnerName || scope.partnerId || "-" })}
        </p>
      </main>
    )
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("saasAdminPartners_pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("saasAdminPartners_pageIntro")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdminPartners_listTitle")}</CardTitle>
          <CardDescription>{t("saasAdminPartners_listDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("saasAdminPartners_colName")}</TableHead>
                <TableHead>{t("saasAdminPartners_colMargin")}</TableHead>
                <TableHead>{t("saasAdminPartners_colTenants")}</TableHead>
                <TableHead>{t("saasAdminPartners_colUsers")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/saas-admin/partners/${encodeURIComponent(p.id)}`} className="hover:underline">
                      <div className="font-medium">{p.name}</div>
                      <p className="text-xs text-muted-foreground">{p.id}</p>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {p.defaultMarginPct}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal tabular-nums">
                      {p.tenantCount ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell>{p.userCount ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={p.isActive ? "default" : "outline"}>
                      {p.isActive ? t("saasAdminPartners_active") : t("saasAdminPartners_inactive")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {partners.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t("saasAdmin_noData")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="max-w-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("saasAdminPartners_createTitle")}</CardTitle>
          <CardDescription>{t("saasAdminPartners_createDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_idLabel")}</Label>
              <Input
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                placeholder="partner-bkk-001"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("saasAdminPartners_idHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_nameLabel")}</Label>
              <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_marginLabel")}</Label>
              <Input type="number" min={0} value={margin} onChange={(e) => setMargin(e.target.value)} />
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div>
              <p className="text-sm font-medium">{t("saasAdminPartners_loginSectionTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tr(t, "saasAdminPartners_loginSectionDesc", { company: loginCompany, store: loginStore })}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_loginNameLabel")}</Label>
              <Input value={loginName} onChange={(e) => setLoginName(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_loginPasswordLabel")}</Label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <Button type="button" disabled={saving} onClick={() => void savePartner()}>
            {t("saasAdminPartners_createBtn")}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
