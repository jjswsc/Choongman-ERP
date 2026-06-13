"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
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

export default function SaasPartnersPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const scope = useSaasScope()
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newId, setNewId] = useState("")
  const [newName, setNewName] = useState("")
  const [newMargin, setNewMargin] = useState("15")
  const [linkPartnerId, setLinkPartnerId] = useState("")
  const [linkEmployeeId, setLinkEmployeeId] = useState("")

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
    const id = newId.trim().toLowerCase()
    const name = newName.trim()
    if (!id || !name) {
      await appAlert(t("saasAdminPartners_errRequired"))
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
            defaultMarginPct: Math.max(0, Number(newMargin || 0)),
            isActive: true,
          },
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      setNewId("")
      setNewName("")
      await load()
      await appAlert(t("saasAdminPartners_saved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const linkUser = async () => {
    const partnerId = linkPartnerId.trim()
    const employeeId = Math.floor(Number(linkEmployeeId || 0))
    if (!partnerId || employeeId <= 0) {
      await appAlert(t("saasAdminPartners_errLink"))
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminPartners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkUser: { partnerId, employeeId } }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPartners_errSave"))
        return
      }
      setLinkEmployeeId("")
      await load()
      await appAlert(t("saasAdminPartners_linked"))
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("saasAdminPartners_createTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_idLabel")}</Label>
              <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="partner-bkk-001" />
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_nameLabel")}</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_marginLabel")}</Label>
              <Input type="number" min={0} value={newMargin} onChange={(e) => setNewMargin(e.target.value)} />
            </div>
            <Button type="button" disabled={saving} onClick={() => void savePartner()}>
              {t("saasAdminPartners_createBtn")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("saasAdminPartners_linkTitle")}</CardTitle>
            <CardDescription>{t("saasAdminPartners_linkDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_linkPartner")}</Label>
              <Input value={linkPartnerId} onChange={(e) => setLinkPartnerId(e.target.value)} placeholder="partner-bkk-001" />
            </div>
            <div className="space-y-2">
              <Label>{t("saasAdminPartners_linkEmployeeId")}</Label>
              <Input type="number" min={1} value={linkEmployeeId} onChange={(e) => setLinkEmployeeId(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void linkUser()}>
              {t("saasAdminPartners_linkBtn")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
