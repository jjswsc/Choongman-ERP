"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiFetch } from "@/lib/api/fetch"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

type TenantOpt = { id: string; companyName: string }

type StoreRow = {
  id: number
  tenantId: string | null
  companyName: string
  label: string
  storeName: string
  storeCode: string
  isActive: boolean
  createdAt: string
  kind: "saas" | "legacy"
}

export default function SaasStoresPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [tenantFilter, setTenantFilter] = useState<string>("")
  const [createTenantId, setCreateTenantId] = useState<string>("")
  const [createStoreName, setCreateStoreName] = useState("")
  const [createStoreCode, setCreateStoreCode] = useState("")
  const [qInput, setQInput] = useState("")
  const [qApplied, setQApplied] = useState("")
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<StoreRow[]>([])
  const [tenantOptions, setTenantOptions] = useState<TenantOpt[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState("")
  const [managerDialogOpen, setManagerDialogOpen] = useState(false)
  const [managerTenantId, setManagerTenantId] = useState("")
  const [managerCompanyName, setManagerCompanyName] = useState("")
  const [managerStoreName, setManagerStoreName] = useState("")
  const [managerName, setManagerName] = useState("manager")
  const [managerPassword, setManagerPassword] = useState("")
  const [managerPassword2, setManagerPassword2] = useState("")
  const [openLoginAfterCreate, setOpenLoginAfterCreate] = useState(true)

  const load = useCallback(
    async (opts: { nextOffset: number; append: boolean }) => {
      setLoading(true)
      setNotice("")
      try {
        const params = new URLSearchParams()
        if (tenantFilter) params.set("tenantId", tenantFilter)
        if (qApplied.trim()) params.set("q", qApplied.trim())
        params.set("offset", String(opts.nextOffset))
        params.set("limit", "200")
        const res = await apiFetch(`/api/saasAdminStores?${params.toString()}`)
        const json = (await res.json()) as {
          success?: boolean
          message?: string
          tenantOptions?: TenantOpt[]
          rows?: StoreRow[]
          pagination?: { hasMore?: boolean }
        }
        if (!res.ok || json.success !== true) {
          setNotice(json.message || t("saasAdmin_errLoadList"))
          if (!opts.append) setRows([])
          return
        }
        if (Array.isArray(json.tenantOptions)) setTenantOptions(json.tenantOptions)
        const next = json.rows || []
        setRows((prev) => (opts.append ? [...prev, ...next] : next))
        setOffset(opts.nextOffset + next.length)
        setHasMore(Boolean(json.pagination?.hasMore))
      } catch (e) {
        setNotice(String(e))
        if (!opts.append) setRows([])
      } finally {
        setLoading(false)
      }
    },
    [tenantFilter, qApplied, t]
  )

  useEffect(() => {
    setOffset(0)
    void load({ nextOffset: 0, append: false })
  }, [tenantFilter, qApplied, load])

  useEffect(() => {
    if (tenantFilter) {
      setCreateTenantId(tenantFilter)
      return
    }
    setCreateTenantId((prev) => prev || tenantOptions[0]?.id || "")
  }, [tenantFilter, tenantOptions])

  const applySearch = () => {
    setQApplied(qInput.trim())
  }

  const loadMore = () => {
    if (!hasMore || loading) return
    void load({ nextOffset: offset, append: true })
  }

  const createStore = async () => {
    const tenantId = createTenantId.trim()
    const storeName = createStoreName.trim()
    const storeCode = createStoreCode.trim()
    if (!tenantId || !storeName) {
      await appAlert(t("saasAdminStore_errTenantStoreRequired"))
      return
    }
    try {
      const res = await apiFetch("/api/saasAdminStores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName,
          ...(storeCode ? { storeCode } : {}),
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; companyName?: string; storeName?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminStore_createFailed"))
        return
      }
      await appAlert(
        tr(t, "saasAdminStore_created", {
          company: json.companyName || tenantId,
          store: json.storeName || storeName,
        })
      )
      setManagerTenantId(tenantId)
      setManagerCompanyName(json.companyName || "")
      setManagerStoreName(json.storeName || storeName)
      setManagerName("manager")
      setManagerPassword("")
      setManagerPassword2("")
      setOpenLoginAfterCreate(true)
      setManagerDialogOpen(true)
      setCreateStoreName("")
      setCreateStoreCode("")
      setTenantFilter(tenantId)
      setOffset(0)
      void load({ nextOffset: 0, append: false })
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const toggleStoreActive = async (row: StoreRow) => {
    if (row.kind !== "saas") {
      await appAlert(t("saasAdminStore_legacyNoToggle"))
      return
    }
    const next = !row.isActive
    const statusLabel = next ? t("saasAdmin_statusActive") : t("saasAdmin_statusInactive")
    const ok = await appConfirm(
      tr(t, "saasAdminStore_toggleConfirm", {
        label: row.label,
        status: statusLabel,
        company: row.companyName || "-",
      })
    )
    if (!ok) return
    try {
      const res = await apiFetch("/api/saasAdminStores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          tenantId: row.tenantId,
          storeName: row.storeName,
          storeCode: row.storeCode,
          isActive: next,
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminStore_toggleFailed"))
        return
      }
      setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, isActive: next } : x)))
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const createStoreManager = async () => {
    const tenantId = managerTenantId.trim()
    const storeName = managerStoreName.trim()
    const name = managerName.trim()
    const pw = managerPassword.trim()
    const pw2 = managerPassword2.trim()
    if (!tenantId || !storeName || !name || !pw) {
      await appAlert(t("saasAdminStore_errManagerRequired"))
      return
    }
    if (pw.length < 4) {
      await appAlert(t("saasAdminCust_errPwMin"))
      return
    }
    if (pw !== pw2) {
      await appAlert(t("saasAdminCust_errPwMismatch"))
      return
    }
    try {
      const res = await apiFetch("/api/saasAdminEmployees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName,
          name,
          password: pw,
          role: "Manager",
          job: "manager",
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; companyName?: string; storeName?: string; name?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminStore_managerCreateFailed"))
        return
      }
      await appAlert(
        tr(t, "saasAdminStore_managerCreated", {
          company: json.companyName || managerCompanyName || tenantId,
          store: json.storeName || storeName,
          name: json.name || name,
        })
      )
      if (openLoginAfterCreate) {
        const p = new URLSearchParams()
        p.set("redirect", "/admin")
        p.set("company", json.companyName || managerCompanyName || tenantId)
        p.set("store", json.storeName || storeName)
        p.set("user", json.name || name)
        const href = `/admin/login?${p.toString()}`
        if (typeof window !== "undefined") {
          window.open(href, "_blank", "noopener,noreferrer")
        }
      }
      setManagerDialogOpen(false)
    } catch (e) {
      await appAlert(String(e))
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("saasAdminStore_pageTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("saasAdminStore_pageIntro")}</p>
        <p className="mt-2 text-sm">
          <Link href="/saas-admin/customers" className="text-primary underline underline-offset-4">
            {t("saasAdmin_linkCustomers")}
          </Link>
          {t("saasAdminStore_pageLinkHint")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdminStore_createTitle")}</CardTitle>
          <CardDescription>{t("saasAdminStore_createDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-2">
            <Label>{t("saasAdmin_labelTenant")}</Label>
            <Select value={createTenantId || "__none__"} onValueChange={(v) => setCreateTenantId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("saasAdmin_selectTenant")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("saasAdmin_selectNone")}</SelectItem>
                {tenantOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.companyName || opt.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("saasAdmin_labelStoreName")}</Label>
            <Input
              value={createStoreName}
              onChange={(e) => setCreateStoreName(e.target.value)}
              placeholder={t("saasAdminStore_storeNamePh")}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createStore()
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("saasAdmin_storeCodeOptional")}</Label>
            <Input
              value={createStoreCode}
              onChange={(e) => setCreateStoreCode(e.target.value)}
              placeholder={t("saasAdmin_autoGenerate")}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createStore()
              }}
            />
          </div>
          <div className="flex items-end">
            <Button type="button" onClick={() => void createStore()} disabled={loading}>
              {t("saasAdminStore_createBtn")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saasAdminStore_managerDialogTitle")}</DialogTitle>
            <DialogDescription>{t("saasAdminStore_managerDialogDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>{t("saasAdmin_labelTenant")}</Label>
              <Input value={managerCompanyName || managerTenantId} disabled />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdmin_labelStoreName")}</Label>
              <Input value={managerStoreName} disabled />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdminStore_managerName")}</Label>
              <Input value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder={t("saasAdminStore_managerNamePh")} />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdmin_password")}</Label>
              <Input type="password" value={managerPassword} onChange={(e) => setManagerPassword(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t("saasAdmin_passwordConfirm")}</Label>
              <Input type="password" value={managerPassword2} onChange={(e) => setManagerPassword2(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={openLoginAfterCreate}
                onChange={(e) => setOpenLoginAfterCreate(e.target.checked)}
              />
              {t("saasAdminStore_openLoginAfter")}
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setManagerDialogOpen(false)}>
              {t("saasAdmin_later")}
            </Button>
            <Button type="button" onClick={() => void createStoreManager()}>
              {t("saasAdminStore_createManagerBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdmin_filter")}</CardTitle>
          <CardDescription>{t("saasAdmin_filterTenantHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
          <div className="space-y-2 md:min-w-[220px]">
            <Label>{t("saasAdmin_labelTenant")}</Label>
            <Select value={tenantFilter || "__all__"} onValueChange={(v) => setTenantFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("all")}</SelectItem>
                {tenantOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.companyName || opt.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-end">
            <div className="space-y-2 md:flex-1">
              <Label>{t("saasAdminStore_searchLabel")}</Label>
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch()
                }}
                placeholder={t("saasAdmin_searchPlaceholder")}
              />
            </div>
            <Button type="button" variant="secondary" onClick={applySearch} disabled={loading}>
              {t("search")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice ? <p className="text-sm text-destructive">{notice}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("saasAdminStore_listTitle")}</CardTitle>
          <CardDescription>
            {loading ? t("saasAdmin_loading") : tr(t, "saasAdmin_rowsShown", { n: rows.length })}
            {qApplied ? t("saasAdmin_searchModeStores") : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("saasAdmin_labelTenant")}</TableHead>
                <TableHead>{t("saasAdmin_tenantId")}</TableHead>
                <TableHead>{t("saasAdmin_storeDisplay")}</TableHead>
                <TableHead>{t("saasAdmin_code")}</TableHead>
                <TableHead>{t("saasAdmin_type")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("saasAdmin_manage")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {t("saasAdmin_noData")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.tenantId ? (
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => {
                            setTenantFilter(r.tenantId || "")
                            setCreateTenantId(r.tenantId || "")
                          }}
                        >
                          {r.companyName || "—"}
                        </Button>
                      ) : (
                        r.companyName || "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.tenantId || "—"}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell>{r.storeCode || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.kind === "saas" ? "default" : "secondary"}>
                        {r.kind === "saas" ? t("saasAdmin_kindSaas") : t("saasAdmin_kindLegacy")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.isActive ? "outline" : "destructive"}>
                        {r.isActive ? t("saasAdmin_statusActive") : t("saasAdmin_statusInactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={r.isActive ? "destructive" : "default"}
                        onClick={() => void toggleStoreActive(r)}
                        disabled={loading || r.kind !== "saas"}
                      >
                        {r.isActive ? t("saasAdmin_suspend") : t("saasAdmin_resume")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {hasMore ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="outline" onClick={loadMore} disabled={loading}>
                {t("saasAdmin_loadMore")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  )
}
