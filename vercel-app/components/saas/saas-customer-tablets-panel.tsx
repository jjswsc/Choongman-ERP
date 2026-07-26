"use client"

import { useCallback, useEffect, useState } from "react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type DeviceRow = {
  id?: number
  device_uuid?: string
  store_name?: string | null
  display_name?: string | null
  is_active?: boolean
  last_seen_at?: string | null
  created_at?: string | null
}

export function SaasCustomerTabletsPanel({ tenantId }: { tenantId: string }) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [deviceUuid, setDeviceUuid] = useState("")
  const [storeName, setStoreName] = useState("")
  const [displayName, setDisplayName] = useState("")

  const load = useCallback(async () => {
    const id = String(tenantId || "").trim()
    if (!id) return
    setLoading(true)
    try {
      const res = await apiFetch(
        `/api/saasAdminDevices?tenantId=${encodeURIComponent(id)}&kind=tablet`
      )
      const json = (await res.json()) as { success?: boolean; devices?: DeviceRow[]; message?: string }
      if (!res.ok || !json.success) {
        await appAlert(json.message || t("saasAdminCust_tabletsLoadFailed"))
        setDevices([])
        return
      }
      setDevices(Array.isArray(json.devices) ? json.devices : [])
    } catch (e) {
      await appAlert(String(e))
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [t, tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const register = async () => {
    const uuid = deviceUuid.trim()
    if (!uuid) {
      await appAlert(t("saasAdminCust_tabletUuidRequired"))
      return
    }
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminDevices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          deviceUuid: uuid,
          storeName: storeName.trim() || undefined,
          displayName: displayName.trim() || undefined,
          deviceKind: "tablet",
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || !json.success) {
        await appAlert(json.message || t("saasAdminCust_tabletRegisterFailed"))
        return
      }
      setDeviceUuid("")
      setStoreName("")
      setDisplayName("")
      await load()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (uuid: string) => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminDevices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, deviceUuid: uuid, deviceKind: "tablet" }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || !json.success) {
        await appAlert(json.message || t("saasAdminCust_tabletDeactivateFailed"))
        return
      }
      await load()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-sky-200/70 bg-sky-50/60 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
        <p className="text-sm font-medium">{t("saasAdminCust_tabTablets")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("saasAdminCust_tabletsIntro")}</p>
      </div>

      <div className="grid gap-3 rounded-md border p-3 md:grid-cols-4 md:items-end">
        <div className="space-y-2 md:col-span-2">
          <Label>{t("saasAdminCust_tabletUuid")}</Label>
          <Input
            value={deviceUuid}
            onChange={(e) => setDeviceUuid(e.target.value)}
            placeholder={t("saasAdminCust_tabletUuidPh")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("saasAdminCust_tabletStore")}</Label>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("saasAdminCust_tabletDisplayName")}</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="md:col-span-4">
          <Button type="button" onClick={() => void register()} disabled={loading || saving}>
            {t("saasAdminCust_tabletRegister")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("saasAdminCust_tabletUuid")}</TableHead>
              <TableHead>{t("saasAdminCust_tabletStore")}</TableHead>
              <TableHead>{t("saasAdminCust_tabletDisplayName")}</TableHead>
              <TableHead>{t("saasAdminCust_tabletActive")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.map((d) => {
              const uuid = String(d.device_uuid || "")
              return (
                <TableRow key={`${uuid}-${d.id ?? ""}`}>
                  <TableCell className="max-w-[14rem] truncate font-mono text-xs">{uuid || "—"}</TableCell>
                  <TableCell>{d.store_name || "—"}</TableCell>
                  <TableCell>{d.display_name || "—"}</TableCell>
                  <TableCell>{d.is_active === false ? t("saasAdminCust_tabletInactive") : t("saasAdminCust_tabletActiveYes")}</TableCell>
                  <TableCell className="text-right">
                    {d.is_active !== false ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving || !uuid}
                        onClick={() => void deactivate(uuid)}
                      >
                        {t("saasAdminCust_tabletDeactivate")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
            {!loading && devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("saasAdminCust_tabletsEmpty")}
                </TableCell>
              </TableRow>
            ) : null}
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
