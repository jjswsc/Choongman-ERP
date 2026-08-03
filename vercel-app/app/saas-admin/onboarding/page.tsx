"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SaasOnboardingStepIndicator } from "@/components/saas/saas-onboarding-step-indicator"
import { SaasAdminTenantIntegrationsPanel } from "@/components/saas/saas-admin-tenant-integrations-panel"
import { SaasModulePricingPanel } from "@/components/saas/saas-module-pricing-panel"
import { useSaasScope } from "@/components/saas/saas-scope-context"
import { type TenantItem } from "@/lib/saas-admin-control-plane"
import { computeTenantPricingTotals } from "@/lib/saas-partner-settlement"
import { SaasPricingBreakdownVisual } from "@/components/saas/saas-pricing-breakdown-visual"
import { createNewTenantDraft } from "@/lib/saas-tenant-draft"
import { fetchGlobalModulePrices } from "@/lib/saas-module-catalog-client"
import { cloneDefaultModulePrices } from "@/lib/saas-module-pricing"
import {
  assertCanAddManager,
  assertCanAddStore,
  completedStepCount,
  firstIncompleteStep,
  generateOnboardingPassword,
  isOnboardingComplete,
  isOnboardingFlagsMissingApiResponse,
  mergeLocalOnboardingFlags,
  onboardingStorageKey,
  ONBOARDING_STEP_ORDER,
  readLocalOnboardingFlags,
  resolveOnboardingSteps,
  type OnboardingFlags,
  type OnboardingStatusRow,
  type OnboardingStepKey,
} from "@/lib/saas-onboarding-status"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

function normalizeTenantRows(rows: TenantItem[]): TenantItem[] {
  return rows.map((row) => ({
    ...row,
    policy: { ...row.policy, salesStage: row.policy?.salesStage || "basic" },
    billingHistory: Array.isArray(row.billingHistory) ? row.billingHistory : [],
    auditTrail: Array.isArray(row.auditTrail) ? row.auditTrail : [],
  }))
}

type StoreOpt = { storeName: string; storeCode: string }
type LoginCreds = { company: string; store: string; admin: string }

export default function SaasOnboardingPage() {
  const scope = useSaasScope()
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const [tenants, setTenants] = useState<TenantItem[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, OnboardingStatusRow>>({})
  const [loading, setLoading] = useState(false)
  const [loadNotice, setLoadNotice] = useState("")

  const [mode, setMode] = useState<"new" | "resume">("new")
  const [resumeTenantId, setResumeTenantId] = useState("")
  const [step, setStep] = useState<OnboardingStepKey>("company")
  const [activeTenantId, setActiveTenantId] = useState("")
  const [activeCompanyName, setActiveCompanyName] = useState("")
  const [selectedStoreName, setSelectedStoreName] = useState("")
  const [storeOptions, setStoreOptions] = useState<StoreOpt[]>([])
  const [pricingDraft, setPricingDraft] = useState<TenantItem | null>(null)
  const [lastLoginCreds, setLastLoginCreds] = useState<LoginCreds | null>(null)
  const [loginVerified, setLoginVerified] = useState(false)
  const [integrationConfigured, setIntegrationConfigured] = useState(false)

  const [newTenantId, setNewTenantId] = useState("")
  const [newTenantName, setNewTenantName] = useState("")
  const [newOwnerName, setNewOwnerName] = useState("")
  const [newPhone, setNewPhone] = useState("")

  const [storeName, setStoreName] = useState("")
  const [storeCode, setStoreCode] = useState("")
  const [adminName, setAdminName] = useState("")
  const [adminPw, setAdminPw] = useState("")
  const [adminPw2, setAdminPw2] = useState("")
  const [openLoginAfter, setOpenLoginAfter] = useState(true)
  const storeCreateInFlightRef = useRef(false)

  const stepLabels = useMemo(
    (): Record<OnboardingStepKey, string> => ({
      company: t("saasAdminOnboard_stepCompany"),
      store: t("saasAdminOnboard_stepStore"),
      admin: t("saasAdminOnboard_stepAdmin"),
      pricing: t("saasAdminOnboard_stepPricing"),
      integrations: t("saasAdminOnboard_stepIntegrations"),
      verify: t("saasAdminOnboard_stepVerify"),
    }),
    [t]
  )

  const activeTenant = useMemo(
    () => tenants.find((x) => x.id === activeTenantId) ?? null,
    [tenants, activeTenantId]
  )

  const activeSteps = useMemo(() => {
    if (!activeTenant) {
      const partial: Partial<Record<OnboardingStepKey, boolean>> = {
        company: step !== "company" && Boolean(activeTenantId),
      }
      return partial
    }
    const row = statusMap[activeTenant.id]
    const localFlags = readLocalOnboardingFlags(activeTenant.id)
    const flags: OnboardingFlags = { ...row?.flags, ...localFlags }
    return resolveOnboardingSteps({
      tenant: activeTenant,
      flags,
      enabledIntegrationCount: row?.counts?.enabledIntegrations ?? (integrationConfigured ? 1 : 0),
      companyOk: row?.steps?.company ?? Boolean(activeTenantId),
      storeOk: row?.steps?.store === true || activeTenant.usage.stores > 0,
      adminOk: row?.steps?.admin === true || activeTenant.usage.managerAccounts > 0,
    })
  }, [activeTenant, activeTenantId, statusMap, step, integrationConfigured])

  const incompleteTenants = useMemo(
    () =>
      tenants.filter((tenant) => {
        const row = statusMap[tenant.id]
        if (row?.steps) return !isOnboardingComplete(row.steps)
        return !isOnboardingComplete(resolveOnboardingSteps({ tenant }))
      }),
    [statusMap, tenants]
  )

  const onboardingDone = activeTenant
    ? isOnboardingComplete(activeSteps as Record<OnboardingStepKey, boolean>)
    : false

  const loadTenants = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch("/api/getSaasTenantSettings")
      const json = (await res.json()) as { success?: boolean; fallback?: boolean; message?: string; tenants?: TenantItem[] }
      if (!res.ok || json.success !== true || !Array.isArray(json.tenants)) {
        throw new Error(json.message || t("saasAdminCust_errLoadSettings"))
      }
      const rows = normalizeTenantRows(json.tenants)
      setTenants(rows.length > 0 ? rows : [])
      setLoadNotice(json.fallback ? json.message || t("saasAdminCust_sampleData") : "")

      const statusRes = await apiFetch("/api/saasAdminOnboardingStatus")
      const statusJson = (await statusRes.json()) as { success?: boolean; map?: Record<string, OnboardingStatusRow> }
      if (statusRes.ok && statusJson.success === true && statusJson.map) {
        const merged: Record<string, OnboardingStatusRow> = {}
        for (const [id, row] of Object.entries(statusJson.map)) {
          const localFlags = readLocalOnboardingFlags(id)
          if (Object.keys(localFlags).length === 0) {
            merged[id] = row
            continue
          }
          const tenant = rows.find((x) => x.id === id)
          merged[id] = {
            ...row,
            flags: { ...row.flags, ...localFlags },
            steps: resolveOnboardingSteps({
              tenant: tenant ?? { usage: { stores: 0, managerAccounts: 0 } },
              flags: { ...row.flags, ...localFlags },
              enabledIntegrationCount: row.counts?.enabledIntegrations ?? 0,
              companyOk: row.steps?.company,
              storeOk: row.steps?.store,
              adminOk: row.steps?.admin,
            }),
          }
        }
        setStatusMap(merged)
      }
    } catch (error) {
      setLoadNotice(tr(t, "saasAdminCust_loadFailed", { msg: String(error) }))
      setTenants([])
    } finally {
      setLoading(false)
    }
  }, [t])

  const refreshTenantStatus = useCallback(async (tenantId: string, tenant?: TenantItem | null) => {
    const tnt = tenant ?? tenants.find((x) => x.id === tenantId)
    const params = new URLSearchParams({ tenantId })
    if (tnt) {
      params.set("stores", String(tnt.usage.stores))
      params.set("managers", String(tnt.usage.managerAccounts))
    }
    const res = await apiFetch(`/api/saasAdminOnboardingStatus?${params.toString()}`)
    const json = (await res.json()) as { success?: boolean; row?: OnboardingStatusRow }
    if (res.ok && json.success === true && json.row) {
      setStatusMap((prev) => ({ ...prev, [tenantId]: json.row! }))
      return json.row
    }
    return null
  }, [tenants])

  const applyLocalOnboardingPatch = useCallback(
    (
      tenantId: string,
      patch: OnboardingFlags,
      tenant?: TenantItem | null,
      enabledIntegrations = integrationConfigured ? 1 : 0
    ): OnboardingStatusRow => {
      const mergedFlags = mergeLocalOnboardingFlags(tenantId, patch)
      const tnt = tenant ?? tenants.find((x) => x.id === tenantId)
      const prev = statusMap[tenantId]
      const steps = resolveOnboardingSteps({
        tenant: tnt ?? { usage: { stores: 0, managerAccounts: 0 } },
        flags: mergedFlags,
        enabledIntegrationCount: prev?.counts?.enabledIntegrations ?? enabledIntegrations,
        companyOk: prev?.steps?.company ?? true,
        storeOk: prev?.steps?.store ?? (tnt?.usage.stores ?? 0) > 0,
        adminOk: prev?.steps?.admin ?? (tnt?.usage.managerAccounts ?? 0) > 0,
      })
      const row: OnboardingStatusRow = {
        tenantId,
        found: true,
        flags: mergedFlags,
        steps,
        counts: prev?.counts,
      }
      setStatusMap((prevMap) => ({ ...prevMap, [tenantId]: row }))
      return row
    },
    [integrationConfigured, statusMap, tenants]
  )

  const patchOnboardingFlags = useCallback(
    async (
      tenantId: string,
      patch: { pricingConfirmed?: boolean; integrationsSkipped?: boolean; loginVerified?: boolean },
      tenant?: TenantItem | null
    ) => {
      const tnt = tenant ?? tenants.find((x) => x.id === tenantId)
      applyLocalOnboardingPatch(tenantId, patch, tnt)

      const res = await apiFetch("/api/saasAdminOnboardingStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          ...patch,
          usage: tnt?.usage,
          pricing: tnt?.pricing,
        }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        row?: OnboardingStatusRow
        code?: string
        flagsPersisted?: boolean
        warning?: string
      }
      if (isOnboardingFlagsMissingApiResponse(json)) {
        console.warn("[onboarding]", json.warning || json.message || "onboarding_flags column missing")
        return applyLocalOnboardingPatch(tenantId, patch, tnt)
      }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminOnboard_flagsSaveFailed"))
        return applyLocalOnboardingPatch(tenantId, patch, tnt)
      }
      if (json.row) setStatusMap((prev) => ({ ...prev, [tenantId]: json.row! }))
      return json.row ?? applyLocalOnboardingPatch(tenantId, patch, tnt)
    },
    [applyLocalOnboardingPatch, t, tenants]
  )

  const loadStoresForTenant = useCallback(async (tenantId: string) => {
    try {
      const params = new URLSearchParams({ tenantId, limit: "100" })
      const res = await apiFetch(`/api/saasAdminStores?${params.toString()}`)
      const json = (await res.json()) as { success?: boolean; rows?: { storeName?: string; storeCode?: string }[] }
      if (!res.ok || json.success !== true) return
      const opts = (json.rows || [])
        .map((r) => ({ storeName: String(r.storeName || "").trim(), storeCode: String(r.storeCode || "").trim() }))
        .filter((r) => r.storeName)
      const deduped: StoreOpt[] = []
      const seen = new Set<string>()
      for (const opt of opts) {
        const key = opt.storeName.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(opt)
      }
      setStoreOptions(deduped)
      if (deduped.length > 0 && !selectedStoreName) {
        setSelectedStoreName(deduped[0]!.storeName)
      }
    } catch {
      /* optional */
    }
  }, [selectedStoreName])

  useEffect(() => {
    void loadTenants()
  }, [loadTenants])

  useEffect(() => {
    const tenantId = searchParams.get("tenant")?.trim()
    if (!tenantId || tenants.length === 0) return
    const tenant = tenants.find((x) => x.id === tenantId)
    if (!tenant) return
    setMode("resume")
    setResumeTenantId(tenantId)
    applyResumeTenant(tenantId, tenant)
  }, [searchParams, tenants])

  useEffect(() => {
    if ((step === "admin" || step === "integrations") && activeTenantId) {
      void loadStoresForTenant(activeTenantId)
    }
  }, [step, activeTenantId, loadStoresForTenant])

  useEffect(() => {
    if (step === "pricing" && activeTenant) {
      setPricingDraft({ ...activeTenant })
    }
  }, [step, activeTenant])

  useEffect(() => {
    if (!activeTenantId) return
    try {
      const raw = sessionStorage.getItem(onboardingStorageKey(activeTenantId))
      if (!raw) return
      const saved = JSON.parse(raw) as Record<string, string>
      if (saved.storeName) setStoreName(saved.storeName)
      if (saved.storeCode) setStoreCode(saved.storeCode)
      if (saved.adminName) setAdminName(saved.adminName)
      if (saved.selectedStoreName) setSelectedStoreName(saved.selectedStoreName)
    } catch {
      /* ignore */
    }
  }, [activeTenantId])

  useEffect(() => {
    if (!activeTenantId) return
    sessionStorage.setItem(
      onboardingStorageKey(activeTenantId),
      JSON.stringify({ storeName, storeCode, adminName, selectedStoreName })
    )
  }, [activeTenantId, storeName, storeCode, adminName, selectedStoreName])

  const persistTenant = async (tenant: TenantItem) => {
    const res = await apiFetch("/api/saveSaasTenantSettings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant }),
    })
    const json = (await res.json()) as { success?: boolean; message?: string }
    if (!res.ok || json.success !== true) {
      throw new Error(json.message || t("saasAdminCust_errSave"))
    }
  }

  const goToStep = (next: OnboardingStepKey) => setStep(next)

  const applyResumeTenant = (tenantId: string, tenant?: TenantItem) => {
    const hit = tenant ?? tenants.find((x) => x.id === tenantId)
    if (!hit) return
    setActiveTenantId(hit.id)
    setActiveCompanyName(hit.companyName)
    setPricingDraft({ ...hit })
    const row = statusMap[hit.id]
    const localFlags = readLocalOnboardingFlags(hit.id)
    const flags: OnboardingFlags = { ...row?.flags, ...localFlags }
    const steps =
      row != null
        ? resolveOnboardingSteps({
            tenant: hit,
            flags,
            enabledIntegrationCount: row.counts?.enabledIntegrations ?? 0,
            companyOk: row.steps?.company ?? true,
            storeOk: row.steps?.store === true || hit.usage.stores > 0,
            adminOk: row.steps?.admin === true || hit.usage.managerAccounts > 0,
          })
        : resolveOnboardingSteps({ tenant: hit })
    if (isOnboardingComplete(steps)) {
      setStep("verify")
      return
    }
    const incomplete = firstIncompleteStep(steps)
    setStep(incomplete ?? "company")
  }

  const startResume = () => {
    if (!resumeTenantId) {
      void appAlert(t("saasAdminOnboard_selectTenantFirst"))
      return
    }
    applyResumeTenant(resumeTenantId)
  }

  const missingStepLabel = (tenantId: string): string => {
    const tenant = tenants.find((x) => x.id === tenantId)
    if (!tenant) return ""
    const steps = statusMap[tenantId]?.steps ?? resolveOnboardingSteps({ tenant })
    const miss = firstIncompleteStep(steps)
    if (!miss) return t("saasAdminOnboard_missingDone")
    const map: Record<OnboardingStepKey, string> = {
      company: t("saasAdminOnboard_stepCompany"),
      store: t("saasAdminOnboard_stepStore"),
      admin: t("saasAdminOnboard_stepAdmin"),
      pricing: t("saasAdminOnboard_stepPricing"),
      integrations: t("saasAdminOnboard_stepIntegrations"),
      verify: t("saasAdminOnboard_stepVerify"),
    }
    return map[miss]
  }

  const createCompany = async () => {
    const id = newTenantId.trim().toLowerCase()
    const name = newTenantName.trim()
    if (!id || !name) {
      await appAlert(t("saasAdminCust_errRequiredIdName"))
      return
    }
    if (!/^[a-z0-9_-]{3,40}$/.test(id)) {
      await appAlert(t("saasAdminCust_errIdFormat"))
      return
    }
    if (tenants.some((x) => x.id === id)) {
      await appAlert(t("saasAdminCust_errIdExists"))
      return
    }
    const catalog = (await fetchGlobalModulePrices()) ?? cloneDefaultModulePrices()
    const draft = createNewTenantDraft({ id, companyName: name, ownerName: newOwnerName, phone: newPhone, catalog })
    setLoading(true)
    try {
      await persistTenant(draft)
      await appAlert(tr(t, "saasAdminCust_created", { name: draft.companyName }))
      setActiveTenantId(id)
      setActiveCompanyName(name)
      setNewTenantId("")
      setNewTenantName("")
      setNewOwnerName("")
      setNewPhone("")
      await loadTenants()
      goToStep("store")
    } catch (error) {
      await appAlert(tr(t, "saasAdminCust_createFailed", { msg: String(error) }))
    } finally {
      setLoading(false)
    }
  }

  const createStore = async () => {
    if (storeCreateInFlightRef.current) return
    const tenantId = activeTenantId.trim()
    const name = storeName.trim()
    const code = storeCode.trim()
    if (!tenantId || !name) {
      await appAlert(t("saasAdminStore_errTenantStoreRequired"))
      return
    }
    if (activeTenant) {
      const gate = assertCanAddStore(activeTenant)
      if (!gate.ok) {
        await appAlert(tr(t, "saasAdminOnboard_errStoreLimit", { max: String(activeTenant.limits.maxStores) }))
        return
      }
    }
    storeCreateInFlightRef.current = true
    setLoading(true)
    try {
      const res = await apiFetch("/api/saasAdminStores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName: name,
          ...(code ? { storeCode: code } : {}),
        }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; companyName?: string; storeName?: string }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminStore_createFailed"))
        return
      }
      const finalStore = json.storeName || name
      setSelectedStoreName(finalStore)
      setActiveCompanyName(json.companyName || activeCompanyName)
      setStoreName("")
      setStoreCode("")
      await loadStoresForTenant(tenantId)
      await loadTenants()
      await refreshTenantStatus(tenantId)
      goToStep("admin")
    } catch (error) {
      await appAlert(String(error))
    } finally {
      storeCreateInFlightRef.current = false
      setLoading(false)
    }
  }

  const createAdmin = async () => {
    const tenantId = activeTenantId.trim()
    const store = selectedStoreName.trim() || storeName.trim()
    const name = adminName.trim()
    const pw = adminPw.trim()
    const pw2 = adminPw2.trim()
    if (!tenantId || !store || !name || !pw) {
      await appAlert(t("saasAdminStore_errManagerRequired"))
      return
    }
    if (activeTenant) {
      const gate = assertCanAddManager(activeTenant)
      if (!gate.ok) {
        await appAlert(tr(t, "saasAdminOnboard_errManagerLimit", { max: String(activeTenant.limits.maxManagerAccounts) }))
        return
      }
    }
    if (pw.length < 4) {
      await appAlert(t("saasAdminCust_errPwMin"))
      return
    }
    if (pw !== pw2) {
      await appAlert(t("saasAdminCust_errPwMismatch"))
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch("/api/saasAdminEmployees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          storeName: store,
          name,
          password: pw,
          role: "Manager",
          job: "manager",
        }),
      })
      const json = (await res.json()) as {
        success?: boolean
        message?: string
        companyName?: string
        storeName?: string
        name?: string
      }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminStore_managerCreateFailed"))
        return
      }
      const company = json.companyName || activeCompanyName || tenantId
      const finalStore = json.storeName || store
      const finalName = json.name || name
      setLastLoginCreds({ company, store: finalStore, admin: finalName })
      setSelectedStoreName(finalStore)
      setAdminName("")
      setAdminPw("")
      setAdminPw2("")
      await loadTenants()
      await refreshTenantStatus(tenantId)
      goToStep("pricing")
    } catch (error) {
      await appAlert(String(error))
    } finally {
      setLoading(false)
    }
  }

  const savePricingAndNext = async () => {
    if (!pricingDraft || !activeTenantId) return
    setLoading(true)
    try {
      await persistTenant(pricingDraft)
      await patchOnboardingFlags(activeTenantId, { pricingConfirmed: true }, pricingDraft)
      await loadTenants()
      goToStep("integrations")
    } catch (error) {
      await appAlert(String(error))
    } finally {
      setLoading(false)
    }
  }

  const skipIntegrations = async () => {
    if (!activeTenantId) return
    setLoading(true)
    try {
      applyLocalOnboardingPatch(activeTenantId, { integrationsSkipped: true }, activeTenant)
      void patchOnboardingFlags(activeTenantId, { integrationsSkipped: true }, activeTenant)
      goToStep("verify")
    } finally {
      setLoading(false)
    }
  }

  const continueIntegrations = async () => {
    if (!activeTenantId) return
    const localSkipped = readLocalOnboardingFlags(activeTenantId).integrationsSkipped === true
    if (!integrationConfigured && !localSkipped && !statusMap[activeTenantId]?.flags?.integrationsSkipped) {
      const ok = window.confirm(t("saasAdminOnboard_integrationsSkipConfirm"))
      if (!ok) return
      await skipIntegrations()
      return
    }
    goToStep("verify")
  }

  const openLoginPreview = () => {
    const creds = lastLoginCreds
    if (!creds) return
    const p = new URLSearchParams()
    p.set("redirect", "/admin")
    p.set("company", creds.company)
    p.set("store", creds.store)
    p.set("user", creds.admin)
    window.open(`/admin/login?${p.toString()}`, "_blank", "noopener,noreferrer")
  }

  const finishOnboarding = async () => {
    if (!activeTenantId) return
    if (!loginVerified) {
      await appAlert(t("saasAdminOnboard_verifyRequired"))
      return
    }
    setLoading(true)
    try {
      await patchOnboardingFlags(activeTenantId, { loginVerified: true }, activeTenant)
      const creds = lastLoginCreds
      if (creds) {
        await appAlert(
          tr(t, "saasAdminOnboard_complete", {
            company: creds.company,
            store: creds.store,
            admin: creds.admin,
          })
        )
      } else {
        await appAlert(t("saasAdminOnboard_allStepsDone"))
      }
      if (openLoginAfter && creds) openLoginPreview()
      await loadTenants()
    } finally {
      setLoading(false)
    }
  }

  const canClickStep = (s: OnboardingStepKey, idx: number): boolean => {
    if (s === "company") return mode === "new"
    if (!activeTenantId) return false
    const currentIdx = ONBOARDING_STEP_ORDER.indexOf(step)
    return idx <= currentIdx
  }

  return (
    <main className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("saasAdminOnboard_pageTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("saasAdminOnboard_pageIntroFull")}</p>
        {loadNotice ? <p className="mt-2 text-xs text-amber-600">{loadNotice}</p> : null}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdminOnboard_modeTitle")}</CardTitle>
          <CardDescription>{t("saasAdminOnboard_modeDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")}>
              {t("saasAdminOnboard_modeNew")}
            </Button>
            <Button
              type="button"
              variant={mode === "resume" ? "default" : "outline"}
              onClick={() => setMode("resume")}
              disabled={incompleteTenants.length === 0}
            >
              {t("saasAdminOnboard_modeResume")}
            </Button>
          </div>
          {mode === "resume" ? (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1 sm:min-w-[280px] sm:flex-1">
                <Label>{t("saasAdminOnboard_resumeTenant")}</Label>
                <Select value={resumeTenantId || "__none__"} onValueChange={(v) => setResumeTenantId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("saasAdmin_selectTenant")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("saasAdmin_selectNone")}</SelectItem>
                    {incompleteTenants.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.companyName} ({missingStepLabel(x.id)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={startResume} disabled={loading || !resumeTenantId}>
                {t("saasAdminOnboard_resumeStart")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdminOnboard_stepsTitle")}</CardTitle>
          {activeTenantId ? (
            <CardDescription>
              {tr(t, "saasAdminOnboard_activeTenant", { name: activeCompanyName || activeTenantId })}
              {" · "}
              {tr(t, "saasAdminOnboard_progressLine", {
                n: String(completedStepCount(activeSteps)),
                total: String(ONBOARDING_STEP_ORDER.length),
              })}
            </CardDescription>
          ) : (
            <CardDescription>{t("saasAdminOnboard_stepsDesc")}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <SaasOnboardingStepIndicator
            current={step}
            completed={activeSteps}
            labels={stepLabels}
            onStepClick={(s) => {
              const idx = ONBOARDING_STEP_ORDER.indexOf(s)
              if (canClickStep(s, idx)) goToStep(s)
            }}
          />

          {onboardingDone && activeTenant ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">{t("saasAdminOnboard_alreadyComplete")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/saas-admin/customers?tenant=${activeTenant.id}`}>{t("saasAdminOnboard_goCustomers")}</Link>
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={openLoginPreview} disabled={!lastLoginCreds}>
                  {t("saasAdminOnboard_openLogin")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "company" && mode === "new" ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_companyIntro")}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("saasAdminOnboard_loginCompanyLabel")}</Label>
                  <Input
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    placeholder={t("saasAdminCust_tenantNamePh")}
                  />
                  <p className="text-xs text-muted-foreground">{t("saasAdminOnboard_loginCompanyHint")}</p>
                </div>
                <div className="space-y-1">
                  <Label>{t("saasAdminCust_tenantIdLabel")}</Label>
                  <Input
                    value={newTenantId}
                    onChange={(e) => setNewTenantId(e.target.value)}
                    placeholder={t("saasAdminCust_tenantIdPh")}
                  />
                  <p className="text-xs text-muted-foreground">{t("saasAdminOnboard_tenantIdNotLoginHint")}</p>
                </div>
                <div className="space-y-1">
                  <Label>{t("saasAdminCust_ownerLabel")}</Label>
                  <Input value={newOwnerName} onChange={(e) => setNewOwnerName(e.target.value)} placeholder={t("saasAdminCust_optionalInput")} />
                </div>
                <div className="space-y-1">
                  <Label>{t("saasAdminCust_phoneLabel")}</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t("saasAdminCust_optionalInput")} />
                </div>
              </div>
              <Button type="button" onClick={() => void createCompany()} disabled={loading}>
                {t("saasAdminOnboard_companyNext")}
              </Button>
            </div>
          ) : null}

          {step === "store" && activeTenantId ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_storeIntro")}</p>
              {activeTenant ? (
                <p className="text-xs text-muted-foreground">
                  {tr(t, "saasAdminOnboard_storeLimitHint", {
                    current: String(activeTenant.usage.stores),
                    max: String(activeTenant.limits.maxStores),
                  })}
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("saasAdminOnboard_loginCompanyLabel")}</Label>
                  <Input value={activeCompanyName || activeTenantId} disabled />
                </div>
                <div className="space-y-1">
                  <Label>{t("saasAdminOnboard_loginStoreLabel")}</Label>
                  <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t("saasAdminStore_storeNamePh")} />
                  <p className="text-xs text-muted-foreground">{t("saasAdminOnboard_loginStoreHint")}</p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t("saasAdmin_storeCodeOptional")}</Label>
                  <Input value={storeCode} onChange={(e) => setStoreCode(e.target.value)} placeholder={t("saasAdmin_autoGenerate")} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {mode === "new" ? (
                  <Button type="button" variant="outline" onClick={() => goToStep("company")} disabled={loading}>
                    {t("saasAdminOnboard_back")}
                  </Button>
                ) : null}
                <Button type="button" onClick={() => void createStore()} disabled={loading}>
                  {t("saasAdminOnboard_storeNext")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "admin" && activeTenantId ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_adminIntro")}</p>
              {activeTenant ? (
                <p className="text-xs text-muted-foreground">
                  {tr(t, "saasAdminOnboard_managerLimitHint", {
                    current: String(activeTenant.usage.managerAccounts),
                    max: String(activeTenant.limits.maxManagerAccounts),
                  })}
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("saasAdminOnboard_loginCompanyLabel")}</Label>
                  <Input value={activeCompanyName || activeTenantId} disabled />
                </div>
                <div className="space-y-1">
                  <Label>{t("saasAdminOnboard_loginStoreLabel")}</Label>
                  {storeOptions.length > 1 ? (
                    <Select value={selectedStoreName || "__none__"} onValueChange={(v) => setSelectedStoreName(v === "__none__" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("saasAdminOnboard_selectStore")} />
                      </SelectTrigger>
                      <SelectContent>
                        {storeOptions.map((opt) => (
                          <SelectItem key={opt.storeName} value={opt.storeName}>
                            {opt.storeName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={selectedStoreName || storeName}
                      onChange={(e) => {
                        setSelectedStoreName(e.target.value)
                        setStoreName(e.target.value)
                      }}
                      placeholder={t("saasAdminStore_storeNamePh")}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{t("saasAdminOnboard_loginNameLabel")}</Label>
                  <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder={t("saasAdminStore_managerNamePh")} />
                  <p className="text-xs text-muted-foreground">{t("saasAdminOnboard_loginNameHint")}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label>{t("saasAdmin_password")}</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-auto px-2 py-0 text-xs"
                      onClick={() => {
                        const pw = generateOnboardingPassword()
                        setAdminPw(pw)
                        setAdminPw2(pw)
                      }}
                    >
                      {t("saasAdminOnboard_genPassword")}
                    </Button>
                  </div>
                  <Input type="password" value={adminPw} onChange={(e) => setAdminPw(e.target.value)} autoComplete="new-password" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>{t("saasAdmin_passwordConfirm")}</Label>
                  <Input type="password" value={adminPw2} onChange={(e) => setAdminPw2(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => goToStep("store")} disabled={loading}>
                  {t("saasAdminOnboard_back")}
                </Button>
                <Button type="button" onClick={() => void createAdmin()} disabled={loading}>
                  {t("saasAdminOnboard_adminNext")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "pricing" && pricingDraft ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_pricingIntro")}</p>
              <SaasModulePricingPanel
                tenant={pricingDraft}
                onChange={(updater) => setPricingDraft((prev) => (prev ? updater(prev) : prev))}
              />
              {scope.isPartner && pricingDraft ? (
                (() => {
                  const totals = computeTenantPricingTotals(pricingDraft)
                  return (
                    <SaasPricingBreakdownVisual
                      wholesale={totals.wholesale}
                      margin={totals.margin}
                      retail={totals.retail}
                      currency={pricingDraft.pricing.currency}
                      labels={{
                        wholesale: t("saasAdminCust_wholesaleThb"),
                        margin: t("saasAdminCust_marginThb"),
                        retail: t("saasAdminCust_retailThb"),
                      }}
                      className="rounded-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 to-violet-50/50 p-4 dark:border-emerald-900/40 dark:from-emerald-950/30 dark:to-violet-950/20"
                    />
                  )
                })()
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => goToStep("admin")} disabled={loading}>
                  {t("saasAdminOnboard_back")}
                </Button>
                <Button type="button" onClick={() => void savePricingAndNext()} disabled={loading}>
                  {t("saasAdminOnboard_pricingNext")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "integrations" && activeTenantId ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_integrationsIntro")}</p>
              <SaasAdminTenantIntegrationsPanel
                tenantId={activeTenantId}
                companyName={activeCompanyName || activeTenantId}
                onIntegrationEnabledChange={() => setIntegrationConfigured(true)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => goToStep("pricing")} disabled={loading}>
                  {t("saasAdminOnboard_back")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void skipIntegrations()} disabled={loading}>
                  {t("saasAdminOnboard_integrationsSkip")}
                </Button>
                <Button type="button" onClick={() => void continueIntegrations()} disabled={loading}>
                  {t("saasAdminOnboard_integrationsNext")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "verify" && activeTenantId ? (
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_verifyIntro")}</p>
              {lastLoginCreds ? (
                <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
                  <p className="font-medium">{t("saasAdminOnboard_loginCredsTitle")}</p>
                  <p>
                    {t("saasAdminOnboard_verifyLoginCompany")}: <strong>{lastLoginCreds.company}</strong>
                  </p>
                  <p>
                    {t("saasAdminOnboard_verifyLoginStore")}: <strong>{lastLoginCreds.store}</strong>
                  </p>
                  <p>
                    {t("saasAdminOnboard_verifyLoginName")}: <strong>{lastLoginCreds.admin}</strong>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-amber-600">{t("saasAdminOnboard_verifyNoCreds")}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={openLoginPreview} disabled={!lastLoginCreds}>
                  {t("saasAdminOnboard_openLogin")}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={loginVerified} onCheckedChange={(v) => setLoginVerified(Boolean(v))} />
                {t("saasAdminOnboard_verifyCheck")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={openLoginAfter} onChange={(e) => setOpenLoginAfter(e.target.checked)} />
                {t("saasAdminStore_openLoginAfter")}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => goToStep("integrations")} disabled={loading}>
                  {t("saasAdminOnboard_back")}
                </Button>
                <Button type="button" onClick={() => void finishOnboarding()} disabled={loading}>
                  {t("saasAdminOnboard_verifyFinish")}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "company" && mode === "resume" && activeTenantId ? (
            <p className="text-sm text-muted-foreground">{t("saasAdminOnboard_resumeAtStore")}</p>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("saasAdminOnboard_afterOnboardingHintBefore")}
        <Link href="/saas-admin/customers" className="text-primary underline underline-offset-4">
          {t("saasAdminNavCustomers")}
        </Link>
        {t("saasAdminOnboard_afterOnboardingHintAfter")}
      </p>
    </main>
  )
}
