"use client"

import { useCallback, useEffect, useState } from "react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

type IntegrationProvider = "kbank" | "grab"

type TenantIntegrationDto = {
  provider: IntegrationProvider
  isEnabled: boolean
  config: Record<string, unknown>
  notes?: string
}

type StoreIntegrationDto = {
  storeCode: string
  provider: IntegrationProvider
  isEnabled: boolean
  config: Record<string, unknown>
  notes?: string
}

const EMPTY_KBANK_TENANT = {
  consumerId: "",
  consumerSecret: "",
  partnerId: "",
  partnerSecret: "",
  merchantId: "",
  openapiBaseUrl: "",
  oauthBaseUrl: "",
  proxySecret: "",
}

const EMPTY_GRAB_TENANT = {
  clientId: "",
  clientSecret: "",
  apiEnv: "production",
  partnerApiBaseUrl: "",
  authBaseUrl: "",
}

const EMPTY_KBANK_STORE = {
  merchantId: "",
  partnerShopId: "",
  terminalId: "",
  qrEnabled: true,
}

const EMPTY_GRAB_STORE = {
  grabMerchantId: "",
  partnerMerchantId: "",
  menuMerchantId: "",
  erpStoreCode: "",
}

function readStr(obj: Record<string, unknown>, key: string): string {
  return String(obj[key] ?? "").trim()
}

export function SaasAdminTenantIntegrationsPanel(props: {
  tenantId: string
  companyName: string
  onIntegrationEnabledChange?: (provider: IntegrationProvider, enabled: boolean) => void
}) {
  const { tenantId, companyName, onIntegrationEnabledChange } = props
  const t = useT(useLang().lang)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [kbankTenant, setKbankTenant] = useState({ ...EMPTY_KBANK_TENANT, isEnabled: true })
  const [grabTenant, setGrabTenant] = useState({ ...EMPTY_GRAB_TENANT, isEnabled: true })
  const [storeCode, setStoreCode] = useState("")
  const [kbankStore, setKbankStore] = useState({ ...EMPTY_KBANK_STORE, isEnabled: true })
  const [grabStore, setGrabStore] = useState({ ...EMPTY_GRAB_STORE, isEnabled: true })

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/saasAdminIntegrations?tenantId=${encodeURIComponent(tenantId)}`)
      const json = (await res.json()) as {
        success?: boolean
        tenantIntegrations?: TenantIntegrationDto[]
        storeIntegrations?: StoreIntegrationDto[]
        message?: string
      }
      if (!res.ok || json.success !== true) {
        throw new Error(json.message || t("saasAdminInt_errLoad"))
      }
      const kbankT = json.tenantIntegrations?.find((x) => x.provider === "kbank")
      const grabT = json.tenantIntegrations?.find((x) => x.provider === "grab")
      if (kbankT) {
        const c = kbankT.config || {}
        setKbankTenant({
          isEnabled: kbankT.isEnabled !== false,
          consumerId: readStr(c, "consumerId"),
          consumerSecret: readStr(c, "consumerSecret"),
          partnerId: readStr(c, "partnerId"),
          partnerSecret: readStr(c, "partnerSecret"),
          merchantId: readStr(c, "merchantId"),
          openapiBaseUrl: readStr(c, "openapiBaseUrl"),
          oauthBaseUrl: readStr(c, "oauthBaseUrl"),
          proxySecret: readStr(c, "proxySecret"),
        })
      } else {
        setKbankTenant({ ...EMPTY_KBANK_TENANT, isEnabled: true })
      }
      if (grabT) {
        const c = grabT.config || {}
        setGrabTenant({
          isEnabled: grabT.isEnabled !== false,
          clientId: readStr(c, "clientId"),
          clientSecret: readStr(c, "clientSecret"),
          apiEnv: readStr(c, "apiEnv") || "production",
          partnerApiBaseUrl: readStr(c, "partnerApiBaseUrl"),
          authBaseUrl: readStr(c, "authBaseUrl"),
        })
      } else {
        setGrabTenant({ ...EMPTY_GRAB_TENANT, isEnabled: true })
      }
      if (storeCode.trim()) {
        const kbankS = json.storeIntegrations?.find(
          (x) => x.provider === "kbank" && x.storeCode === storeCode.trim()
        )
        const grabS = json.storeIntegrations?.find(
          (x) => x.provider === "grab" && x.storeCode === storeCode.trim()
        )
        if (kbankS) {
          const c = kbankS.config || {}
          setKbankStore({
            isEnabled: kbankS.isEnabled !== false,
            merchantId: readStr(c, "merchantId"),
            partnerShopId: readStr(c, "partnerShopId"),
            terminalId: readStr(c, "terminalId"),
            qrEnabled: c.qrEnabled !== false,
          })
        } else {
          setKbankStore({ ...EMPTY_KBANK_STORE, isEnabled: true })
        }
        if (grabS) {
          const c = grabS.config || {}
          setGrabStore({
            isEnabled: grabS.isEnabled !== false,
            grabMerchantId: readStr(c, "grabMerchantId"),
            partnerMerchantId: readStr(c, "partnerMerchantId"),
            menuMerchantId: readStr(c, "menuMerchantId"),
            erpStoreCode: readStr(c, "erpStoreCode"),
          })
        } else {
          setGrabStore({ ...EMPTY_GRAB_STORE, isEnabled: true })
        }
      } else {
        setKbankStore({ ...EMPTY_KBANK_STORE, isEnabled: true })
        setGrabStore({ ...EMPTY_GRAB_STORE, isEnabled: true })
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [tenantId, storeCode, t])

  useEffect(() => {
    void load()
  }, [load])

  const saveTenant = async (provider: IntegrationProvider) => {
    setSaving(true)
    try {
      const body =
        provider === "kbank"
          ? {
              level: "tenant",
              tenantId,
              provider,
              isEnabled: kbankTenant.isEnabled,
              config: {
                consumerId: kbankTenant.consumerId,
                consumerSecret: kbankTenant.consumerSecret,
                partnerId: kbankTenant.partnerId,
                partnerSecret: kbankTenant.partnerSecret,
                merchantId: kbankTenant.merchantId,
                openapiBaseUrl: kbankTenant.openapiBaseUrl,
                oauthBaseUrl: kbankTenant.oauthBaseUrl,
                proxySecret: kbankTenant.proxySecret,
              },
            }
          : {
              level: "tenant",
              tenantId,
              provider,
              isEnabled: grabTenant.isEnabled,
              config: {
                clientId: grabTenant.clientId,
                clientSecret: grabTenant.clientSecret,
                apiEnv: grabTenant.apiEnv,
                partnerApiBaseUrl: grabTenant.partnerApiBaseUrl,
                authBaseUrl: grabTenant.authBaseUrl,
              },
            }
      const res = await apiFetch("/api/saasAdminIntegrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) throw new Error(json.message || t("saasAdminInt_errSave"))
      await appAlert(tr(t, "saasAdminInt_savedTenant", { provider: provider.toUpperCase() }))
      if (provider === "kbank" ? kbankTenant.isEnabled : grabTenant.isEnabled) {
        onIntegrationEnabledChange?.(provider, true)
      }
      await load()
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveStore = async (provider: IntegrationProvider) => {
    const code = storeCode.trim()
    if (!code) {
      await appAlert(t("saasAdminInt_errStoreCode"))
      return
    }
    setSaving(true)
    try {
      const body =
        provider === "kbank"
          ? {
              level: "store",
              tenantId,
              storeCode: code,
              provider,
              isEnabled: kbankStore.isEnabled,
              config: {
                merchantId: kbankStore.merchantId,
                partnerShopId: kbankStore.partnerShopId,
                terminalId: kbankStore.terminalId,
                qrEnabled: kbankStore.qrEnabled,
              },
            }
          : {
              level: "store",
              tenantId,
              storeCode: code,
              provider,
              isEnabled: grabStore.isEnabled,
              config: {
                grabMerchantId: grabStore.grabMerchantId,
                partnerMerchantId: grabStore.partnerMerchantId,
                menuMerchantId: grabStore.menuMerchantId,
                erpStoreCode: grabStore.erpStoreCode || code,
              },
            }
      const res = await apiFetch("/api/saasAdminIntegrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success?: boolean; message?: string }
      if (!res.ok || json.success !== true) throw new Error(json.message || t("saasAdminInt_errSave"))
      await appAlert(tr(t, "saasAdminInt_savedStore", { provider: provider.toUpperCase() }))
      await load()
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <strong>{companyName}</strong> ({tenantId}) — {t("saasAdminInt_intro")}
      </p>

      <Tabs defaultValue="kbank-tenant">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="kbank-tenant">{t("saasAdminInt_tabKbankTenant")}</TabsTrigger>
          <TabsTrigger value="grab-tenant">{t("saasAdminInt_tabGrabTenant")}</TabsTrigger>
          <TabsTrigger value="store">{t("saasAdminInt_tabStore")}</TabsTrigger>
        </TabsList>

        <TabsContent value="kbank-tenant" className="space-y-4 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("saasAdminInt_kbankTenantTitle")}</CardTitle>
              <CardDescription>{t("saasAdminInt_kbankTenantDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center gap-2">
                <Checkbox
                  checked={kbankTenant.isEnabled}
                  onCheckedChange={(v) => setKbankTenant((s) => ({ ...s, isEnabled: v === true }))}
                />
                <Label>{t("saasAdminInt_enabled")}</Label>
              </div>
              {(
                [
                  ["consumerId", "Consumer ID"],
                  ["consumerSecret", "Consumer Secret"],
                  ["partnerId", "Partner ID"],
                  ["partnerSecret", "Partner Secret"],
                  ["merchantId", "Merchant ID"],
                  ["openapiBaseUrl", "OpenAPI Base URL"],
                  ["oauthBaseUrl", t("saasAdminInt_oauthOptional")],
                  ["proxySecret", t("saasAdminInt_proxyOptional")],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    value={kbankTenant[key]}
                    onChange={(e) => setKbankTenant((s) => ({ ...s, [key]: e.target.value }))}
                    type={key.toLowerCase().includes("secret") ? "password" : "text"}
                    autoComplete="off"
                  />
                </div>
              ))}
              <div className="md:col-span-2">
                <Button type="button" disabled={loading || saving} onClick={() => void saveTenant("kbank")}>
                  {t("saasAdminInt_saveKbankTenant")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grab-tenant" className="space-y-4 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("saasAdminInt_grabTenantTitle")}</CardTitle>
              <CardDescription>Partner OAuth Client ID / Secret</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 flex items-center gap-2">
                <Checkbox
                  checked={grabTenant.isEnabled}
                  onCheckedChange={(v) => setGrabTenant((s) => ({ ...s, isEnabled: v === true }))}
                />
                <Label>{t("saasAdminInt_enabled")}</Label>
              </div>
              <div className="space-y-1">
                <Label>Client ID</Label>
                <Input
                  value={grabTenant.clientId}
                  onChange={(e) => setGrabTenant((s) => ({ ...s, clientId: e.target.value }))}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label>Client Secret</Label>
                <Input
                  type="password"
                  value={grabTenant.clientSecret}
                  onChange={(e) => setGrabTenant((s) => ({ ...s, clientSecret: e.target.value }))}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("saasAdminInt_apiEnv")}</Label>
                <Select
                  value={grabTenant.apiEnv}
                  onValueChange={(v) => setGrabTenant((s) => ({ ...s, apiEnv: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">production</SelectItem>
                    <SelectItem value="staging">staging</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("saasAdminInt_partnerApiOptional")}</Label>
                <Input
                  value={grabTenant.partnerApiBaseUrl}
                  onChange={(e) => setGrabTenant((s) => ({ ...s, partnerApiBaseUrl: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <Button type="button" disabled={loading || saving} onClick={() => void saveTenant("grab")}>
                  {t("saasAdminInt_saveGrabTenant")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="store" className="space-y-4 pt-2">
          <div className="space-y-2 max-w-md">
            <Label>{t("saasAdminInt_storeCodeLabel")}</Label>
            <Input
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              placeholder={t("saasAdminInt_storeCodePh")}
              autoComplete="off"
            />
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
              {t("saasAdminInt_loadStore")}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("saasAdminInt_kbankStoreTitle")}</CardTitle>
                <CardDescription>{t("saasAdminInt_kbankStoreDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={kbankStore.isEnabled}
                    onCheckedChange={(v) => setKbankStore((s) => ({ ...s, isEnabled: v === true }))}
                  />
                  <Label>{t("saasAdminInt_enabled")}</Label>
                </div>
                <div className="space-y-1">
                  <Label>Merchant ID</Label>
                  <Input
                    value={kbankStore.merchantId}
                    onChange={(e) => setKbankStore((s) => ({ ...s, merchantId: e.target.value }))}
                    placeholder="KB00000…"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Partner Shop ID</Label>
                  <Input
                    value={kbankStore.partnerShopId}
                    onChange={(e) => setKbankStore((s) => ({ ...s, partnerShopId: e.target.value }))}
                    placeholder="SJGLB…"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Terminal ID</Label>
                  <Input
                    value={kbankStore.terminalId}
                    onChange={(e) => setKbankStore((s) => ({ ...s, terminalId: e.target.value }))}
                  />
                </div>
                <Button type="button" disabled={saving} onClick={() => void saveStore("kbank")}>
                  {t("saasAdminInt_saveKbankStore")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("saasAdminInt_grabStoreTitle")}</CardTitle>
                <CardDescription>{t("saasAdminInt_grabStoreDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={grabStore.isEnabled}
                    onCheckedChange={(v) => setGrabStore((s) => ({ ...s, isEnabled: v === true }))}
                  />
                  <Label>{t("saasAdminInt_enabled")}</Label>
                </div>
                {(
                  [
                    ["grabMerchantId", "Grab Merchant ID (3-C…)"],
                    ["partnerMerchantId", "Partner Store ID (1048 etc.)"],
                    ["menuMerchantId", "Menu API Merchant (GFSBPOS-…)"],
                    ["erpStoreCode", t("saasAdminInt_erpStoreCodeHint")],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label>{label}</Label>
                    <Input
                      value={grabStore[key]}
                      onChange={(e) => setGrabStore((s) => ({ ...s, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <Button type="button" disabled={saving} onClick={() => void saveStore("grab")}>
                  {t("saasAdminInt_saveGrabStore")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
