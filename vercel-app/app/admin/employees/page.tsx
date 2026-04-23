"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  BarChart2,
  ClipboardList,
  ClipboardPenLine,
  FileWarning,
  LayoutList,
  LineChart,
  ListChecks,
  Tags,
  Users,
  UsersRound,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import {
  isManagerRole,
  isFranchiseeRole,
  isOfficeRole,
  isOfficeStore,
  isAccountingRole,
  isDirectorRole,
  canonicalEmployeeFormRole,
} from "@/lib/permissions"
import {
  adminTabsBarCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
  adminTabsContentCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  getAdminEmployeeList,
  getEmployeeLatestGrades,
  getFranchiseeMultiStoreSettings,
  saveAdminEmployee,
  deleteAdminEmployee,
  useStoreList,
  type AdminEmployeeItem,
  type FranchiseeMultiStoreSettings,
} from "@/lib/api-client"
import {
  EmployeeFilterBar,
  EmployeeTable,
  EmployeeForm,
  EmployeeEvalTab,
  EmployeeEvalListTab,
  EmployeeEvalAnalyticsTab,
  EmployeeEvalItemsSettingsTab,
  EmployeeMovementTab,
  EmployeeHeadcountTab,
  EmployeeJobCatalogTab,
  EmployeeWarningLettersTab,
  emptyForm,
  type EmployeeTableRow,
  type EmployeeFormData,
  type EmployeeEvalJumpTarget,
} from "@/components/employees"
import { normalizeEmployeeNameForGradeMatch } from "@/lib/employee-display-name"
import { expandStoreVariantsForGrade } from "@/lib/grade-store-key-variants"

const JOB_OPTIONS = ["Service", "Kitchen", "Officer", "Director"] as const

const JOB_STYLE: Record<string, { bg: string; label: string }> = {
  Service: { bg: "bg-amber-50/90 dark:bg-amber-950/20", label: "empJobService" },
  Kitchen: { bg: "bg-emerald-50/90 dark:bg-emerald-950/20", label: "empJobKitchen" },
  Officer: { bg: "bg-sky-50/90 dark:bg-sky-950/20", label: "empJobOfficer" },
  Director: { bg: "bg-violet-50/90 dark:bg-violet-950/20", label: "empJobDirector" },
  Logistic: { bg: "bg-teal-50/90 dark:bg-teal-950/20", label: "empJobLogistic" },
  기타: { bg: "bg-slate-50/90 dark:bg-slate-800/15", label: "workLogOther" },
}

function JobCountSummary({
  rows,
  t,
}: {
  rows: { job?: string }[]
  t: (k: string) => string
}) {
  const counts: Record<string, number> = { Service: 0, Kitchen: 0, Officer: 0, Director: 0, Logistic: 0, 기타: 0 }
  for (const r of rows) {
    const j = String(r.job || "").trim()
    if (j && counts[j] !== undefined) counts[j]++
    else counts.기타++
  }
  const unit = t("empJobCountUnit")
  const items = ["Service", "Kitchen", "Officer", "Director", "Logistic", "기타"].filter((j) => counts[j] > 0)
  const total = items.reduce((s, j) => s + counts[j as keyof typeof counts], 0)
  if (items.length === 0) return null
  return (
    <div className="flex rounded-lg overflow-hidden border border-border shadow-sm">
      {items.map((j) => {
        const n = counts[j as keyof typeof counts]
        const style = JOB_STYLE[j]
        const label = t(style.label)
        return (
          <div
            key={j}
            className={`flex-1 min-w-[80px] px-2 py-1 border-r border-border/60 text-center ${style.bg}`}
          >
            <span className="text-xs font-medium text-muted-foreground">{label} </span>
            <span className="text-xs font-semibold text-foreground tabular-nums">{n}{unit}</span>
          </div>
        )
      })}
      <div className="flex-1 min-w-[80px] px-2 py-1 bg-primary/10 dark:bg-primary/15 border-l-2 border-primary/30 text-center">
        <span className="text-xs font-medium text-muted-foreground">{t("noticeCountPrefix")} </span>
        <span className="text-xs font-bold text-foreground tabular-nums">{total}{unit}</span>
      </div>
    </div>
  )
}

function resolveEmploymentStatus(e: AdminEmployeeItem): "active" | "leave" | "resigned" | "suspended" {
  const raw = String((e as { employmentStatus?: unknown }).employmentStatus || "")
    .trim()
    .toLowerCase()
  if (raw === "active" || raw === "leave" || raw === "resigned" || raw === "suspended") return raw
  return String(e.resign || "").trim() ? "resigned" : "active"
}

function toFormData(e: AdminEmployeeItem): EmployeeFormData {
  return {
    row: e.row,
    store: e.store || "",
    name: e.name || "",
    nameTitle: e.nameTitle || "",
    employeeCode: e.employeeCode || "",
    nick: e.nick || "",
    phone: e.phone || "",
    job: e.job || "Service",
    email: e.email || "",
    birth: e.birth || "",
    nation: e.nation || "",
    join: e.join || "",
    resign: e.resign || "",
    salType: e.salType || "Monthly",
    salAmt: e.salAmt ?? 0,
    pw: e.pw || "",
    role: canonicalEmployeeFormRole(e.role || "Staff"),
    idNumber: e.idNumber || "",
    idCardPhoto: e.idCardPhoto || "",
    taxId: e.taxId || "",
    ssoNumber: e.ssoNumber || "",
    ssoExempt: !!(e as AdminEmployeeItem).ssoExempt,
    address: e.address || "",
    bankName: e.bankName || "",
    accountNumber: e.accountNumber || "",
    positionAllowance: e.positionAllowance ?? 0,
    riskAllowance: e.riskAllowance ?? 0,
    attendanceAllowance: e.attendanceAllowance ?? 500,
    grade: e.grade || "",
    managerGradeDisplay: "",
    photo: e.photo || "",
    extraStores: Array.isArray((e as AdminEmployeeItem).extraStores)
      ? [...((e as AdminEmployeeItem).extraStores as string[])]
      : [],
  }
}

export default function EmployeesPage() {
  const t = useT(useLang().lang)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { auth } = useAuth()
  const { stores: storeListFromApi, storeLabels: erpStoreLabels, resolveStoreKey } = useStoreList()
  const userStore = (auth?.store || "").trim()
  const userRole = (auth?.role || "").trim()

  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [employeeCache, setEmployeeCache] = React.useState<EmployeeTableRow[]>([])
  const [allEmployees, setAllEmployees] = React.useState<EmployeeTableRow[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const [jobFilter, setJobFilter] = React.useState("")
  const [gradeFilter, setGradeFilter] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("active")
  const [searchText, setSearchText] = React.useState("")
  const [hasSearched, setHasSearched] = React.useState(false)
  const [form, setForm] = React.useState<EmployeeFormData>({ ...emptyForm })
  const fullListRef = React.useRef<EmployeeTableRow[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [apiJobOptions, setApiJobOptions] = React.useState<string[]>([])
  const [franchiseeMulti, setFranchiseeMulti] = React.useState<FranchiseeMultiStoreSettings | null>(null)
  const [hrMainTab, setHrMainTab] = React.useState("list")
  const [evalJumpPayload, setEvalJumpPayload] = React.useState<EmployeeEvalJumpTarget | null>(null)
  const clearEvalJump = React.useCallback(() => setEvalJumpPayload(null), [])

  const adminRowToForm = React.useCallback(
    (e: AdminEmployeeItem): EmployeeFormData => {
      const f = toFormData(e)
      const mgr = String((e as EmployeeTableRow).managerGrade ?? "").trim()
      return {
        ...f,
        store: resolveStoreKey(f.store),
        managerGradeDisplay: mgr && mgr !== "-" ? mgr : "-",
      }
    },
    [resolveStoreKey]
  )

  React.useEffect(() => {
    if (!isOfficeRole(userRole) && !isAccountingRole(userRole)) {
      setFranchiseeMulti(null)
      return
    }
    let cancelled = false
    void getFranchiseeMultiStoreSettings().then((r) => {
      if (!cancelled && r?.settings) setFranchiseeMulti(r.settings)
    })
    return () => {
      cancelled = true
    }
  }, [userRole])

  const loadEmployeeList = React.useCallback(
    async (opts?: { updateDisplay?: boolean }, callback?: () => void) => {
      setLoading(true)
      setLoadError(null)
      try {
        const [listRes, gradesRes] = await Promise.all([
          getAdminEmployeeList({ userStore, userRole }),
          getEmployeeLatestGrades(),
        ])
        const list = (listRes as { list?: EmployeeTableRow[]; stores?: string[]; jobOptions?: string[]; _debug?: Record<string, unknown> }).list || []
        const storeList = (listRes as { stores?: string[] }).stores || []
        const jobOpts = (listRes as { jobOptions?: string[] }).jobOptions || []
        const debug = (listRes as { _debug?: Record<string, unknown> })._debug
        setStores(storeList)
        setApiJobOptions(jobOpts)

        if (list.length === 0 && debug) {
          setLoadError(
            `[진단] userStore="${debug.userStore ?? ""}" userRole="${debug.userRole ?? ""}" role="${debug.role ?? ""}" ` +
              `DB행수=${debug.totalRowsFromDb ?? 0}` +
              (debug.sampleStores ? ` 샘플매장=${JSON.stringify(debug.sampleStores)}` : "") +
              (debug.hint ? ` ${debug.hint}` : "")
          )
        }

        const merged: EmployeeTableRow[] = list.map((e) => {
          const fromSheet = e.grade != null && String(e.grade).trim() !== "" ? String(e.grade).trim() : null
          const store = String(e.store || "").trim().replace(/\s+/g, " ")
          const name = String(e.name || "").trim().replace(/\s+/g, " ")
          const nick = String(e.nick || "").trim().replace(/\s+/g, " ")
          const normName = normalizeEmployeeNameForGradeMatch(name) || name
          const gradeKeys: string[] = []
          for (const st of expandStoreVariantsForGrade(store)) {
            gradeKeys.push(
              `${st}|${name}`,
              `${st}|${normName}`,
              `${st.toLowerCase()}|${name.toLowerCase()}`,
              `${st.toLowerCase()}|${normName.toLowerCase()}`
            )
            if (nick && nick !== name) {
              gradeKeys.push(`${st}|${nick}`, `${st.toLowerCase()}|${nick.toLowerCase()}`)
            }
          }
          let latestAny = ""
          let manager = ""
          for (const k of gradeKeys) {
            const hit = gradesRes?.[k]
            if (!hit) continue
            if (!latestAny && hit.grade && String(hit.grade).trim()) latestAny = String(hit.grade).trim()
            if (!manager && hit.managerGrade && String(hit.managerGrade).trim()) manager = String(hit.managerGrade).trim()
            if (latestAny && manager) break
          }
          return {
            ...e,
            finalGrade: fromSheet || latestAny || "-",
            managerGrade: manager || "-",
          }
        })
        fullListRef.current = merged
        setAllEmployees(merged)
        if (opts?.updateDisplay !== false) {
          setEmployeeCache(merged)
        } else {
          setEmployeeCache([])
        }
        callback?.()
      } catch (e) {
        fullListRef.current = []
        setAllEmployees([])
        setEmployeeCache([])
        setStores([])
        const msg = e instanceof Error ? e.message : String(e)
        setLoadError(`조회 실패: ${msg}`)
      } finally {
        setLoading(false)
      }
    },
    [userStore, userRole]
  )

  /** 급여 관리 등에서 ?employeeId= 또는 ?employeeCode=&store=&name= 로 진입 시 목록 조회 후 수정 폼 오픈 */
  React.useEffect(() => {
    const employeeId = searchParams.get("employeeId")?.trim()
    const employeeCode = searchParams.get("employeeCode")?.trim()
    const storeQ = searchParams.get("store")?.trim() || ""
    const nameQ = searchParams.get("name")?.trim() || ""
    if (!employeeId && !employeeCode) return

    void loadEmployeeList({ updateDisplay: true }, () => {
      const merged = fullListRef.current
      let e: EmployeeTableRow | undefined
      if (employeeId) {
        const n = Number(employeeId)
        if (Number.isFinite(n) && n > 0) {
          e = merged.find((x) => x.row === n)
        }
      }
      if (!e && employeeCode) {
        const c = employeeCode.toUpperCase().replace(/[^A-Z0-9]/g, "")
        let cand = merged.filter((x) =>
          String(x.employeeCode || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "") === c
        )
        if (storeQ) {
          cand = cand.filter((x) => String(x.store || "").trim() === storeQ)
        }
        if (cand.length > 1 && nameQ) {
          e = cand.find((x) => {
            const nm = String(x.name || "").trim()
            const nick = String(x.nick || "").trim()
            return nm === nameQ || nick === nameQ
          })
        }
        e = e || cand[0]
      }
      if (e) {
        setForm(adminRowToForm(e))
        setHasSearched(true)
        setStoreFilter(String(e.store || "").trim() ? String(e.store) : "All")
        router.replace("/admin/employees", { scroll: false })
      }
    })
  }, [searchParams, loadEmployeeList, router, adminRowToForm])

  const jobOptions = React.useMemo(() => {
    if (apiJobOptions.length > 0) return apiJobOptions
    const set = new Set<string>()
    for (const e of allEmployees) {
      const j = String(e.job || "").trim()
      if (j) set.add(j)
    }
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b))
    return arr.length > 0 ? arr : [...JOB_OPTIONS, "기타", "Logistic"]
  }, [allEmployees, apiJobOptions])

  const filteredRows = React.useMemo(() => {
    const s = storeFilter || "All"
    const j = jobFilter || "All"
    const g = gradeFilter || "All"
    const st = statusFilter || "all"
    const k = searchText.toLowerCase().trim()
    const filtered = employeeCache.filter((e) => {
      const eStore = String(e.store || "")
      const eJob = String(e.job || "").trim()
      const eName = String(e.name || "").toLowerCase()
      const eNick = String(e.nick || "").toLowerCase()
      const eEmployeeCode = String(e.employeeCode || "").toLowerCase()
      const ePhone = String(e.phone || "").toLowerCase()
      const eGrade = String(e.finalGrade || "").trim()
      const eStatus = resolveEmploymentStatus(e)
      const matchStore = s === "" || s === "All" || eStore === s
      const matchJob = j === "" || j === "All" || eJob === j
      const matchGrade = g === "" || g === "All" || eGrade === g
      const matchStatus =
        st === "" ||
        st === "all" ||
        (st === "active" && eStatus === "active") ||
        (st === "leave" && eStatus === "leave") ||
        (st === "suspended" && eStatus === "suspended") ||
        (st === "resigned" && eStatus === "resigned")
      const matchKey =
        k === "" ||
        eName.includes(k) ||
        eNick.includes(k) ||
        eEmployeeCode.includes(k) ||
        ePhone.includes(k)
      return matchStore && matchJob && matchGrade && matchStatus && matchKey
    })
    // 매장 → 직무 → 이름 순으로 정렬
    return [...filtered].sort((a, b) => {
      const storeA = String(a.store || "").trim()
      const storeB = String(b.store || "").trim()
      if (storeA !== storeB) return storeA.localeCompare(storeB, undefined, { sensitivity: "base" })
      const jobA = String(a.job || "").trim()
      const jobB = String(b.job || "").trim()
      if (jobA !== jobB) return jobA.localeCompare(jobB, undefined, { sensitivity: "base" })
      const nameA = (a.nick || a.name || "").trim()
      const nameB = (b.nick || b.name || "").trim()
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" })
    })
  }, [employeeCache, storeFilter, jobFilter, gradeFilter, statusFilter, searchText])

  const handleSearch = () => {
    setHasSearched(true)
    loadEmployeeList({ updateDisplay: true })
  }

  const handleEdit = (idx: number) => {
    const e = filteredRows[idx]
    if (e) setForm(adminRowToForm(e))
  }

  const handleDelete = async (rowId: number) => {
    if (!await appConfirm("퇴사/비활성 처리하시겠습니까?")) return
    setLoading(true)
    try {
      const res = await deleteAdminEmployee({ r: rowId, userStore, userRole })
      await appAlert(translateApiMessage(res.message ?? (res as { message?: string }).message, t) || t("msg_delete_ok"))
      await loadEmployeeList({ updateDisplay: true })
    } catch (e) {
      console.error(e)
      await appAlert(t("emp_result_empty") || t("msg_empty_result"))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const { managerGradeDisplay, ...employeePayload } = form
      void managerGradeDisplay
      const res = await saveAdminEmployee({
        d: employeePayload,
        userStore,
        userRole,
        userName: auth?.user || userStore,
        // 본사/회계: 항상 전달. 서버가 system_settings·역할로 실제 반영 여부 결정.
        // franchiseeMulti 로드 전 저장 시 undefined면 서버가 []로 저장해 추가 매장이 사라지는 문제 방지.
        ...(isOfficeRole(userRole) || isAccountingRole(userRole)
          ? { extraStores: form.extraStores }
          : {}),
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_saved"))
        setForm({ ...emptyForm })
        await loadEmployeeList({ updateDisplay: true })
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      console.error(e)
      await appAlert(t("msg_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const isManager = isManagerRole(userRole)
  const isManagerOrFranchisee = isManager || isFranchiseeRole(userRole)
  const isOffice = isOfficeRole(userRole) || isAccountingRole(userRole)
  const showEvalAnalyticsTab = isOffice || isManagerOrFranchisee
  /** 매장 매니저·가맹점도 분석 탭에서 미평가 행 클릭 시 직원 평가 탭으로 이동 가능 */
  const showEmployeeEvalTab = isOffice || isManagerOrFranchisee
  const evalAnalyticsCanPickAllStores = isOffice

  const handleNew = () => {
    const base = { ...emptyForm }
    if ((isManager || isFranchiseeRole(userRole)) && userStore) base.store = resolveStoreKey(userStore)
    setForm(base)
  }
  const storesForFilter = React.useMemo(() => {
    const seen = new Set<string>()
    const merged: string[] = []
    for (const s of [...(stores || []), ...(storeListFromApi || [])]) {
      const t = String(s || "").trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      merged.push(t)
    }
    let list: string[] = merged
    if (isManager && userStore && list.length === 0) list = [userStore]
    const frList = auth?.allowedStores
    if (isFranchiseeRole(userRole) && frList && frList.length > 0 && list.length === 0) {
      list = [...frList]
    }
    return [...list].sort((a, b) => {
      if (isOfficeStore(a) && !isOfficeStore(b)) return -1
      if (!isOfficeStore(a) && isOfficeStore(b)) return 1
      return a.localeCompare(b)
    })
  }, [stores, isManager, userStore, storeListFromApi, userRole, auth?.allowedStores])
  const storesForForm = React.useMemo(() => {
    const fr = auth?.allowedStores
    if (isFranchiseeRole(userRole) && fr && fr.length > 0) {
      return [...fr].sort((a, b) => {
        if (isOfficeStore(a) && !isOfficeStore(b)) return -1
        if (!isOfficeStore(a) && isOfficeStore(b)) return 1
        return a.localeCompare(b)
      })
    }
    if (isManager && userStore) return [userStore]
    return storesForFilter
  }, [auth?.allowedStores, userRole, isManager, userStore, storesForFilter])

  // 직원 평가 탭은 allEmployees를 쓰는데, 목록 탭 '조회' 없이 오면 비어 있음 → 본사·회계·매장관리자는 백그라운드 로드
  React.useEffect(() => {
    if (!showEmployeeEvalTab) return
    void loadEmployeeList({ updateDisplay: false })
  }, [showEmployeeEvalTab, loadEmployeeList])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("adminEmployees")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("adminEmployeesSub")}</p>
          </div>
        </div>

        <Tabs value={hrMainTab} onValueChange={setHrMainTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  <ClipboardList className={adminTabsIconCn} aria-hidden />
                  {t("tab_hr_list")}
                </TabsTrigger>
                <TabsTrigger value="movement" className={adminTabsTriggerCn}>
                  <BarChart2 className={adminTabsIconCn} aria-hidden />
                  {t("tab_hr_movement")}
                </TabsTrigger>
                <TabsTrigger value="headcount" className={adminTabsTriggerCn}>
                  <UsersRound className={adminTabsIconCn} aria-hidden />
                  {t("tab_hr_headcount")}
                </TabsTrigger>
                {isOffice && (
                  <TabsTrigger value="job-catalog" className={adminTabsTriggerCn}>
                    <Tags className={adminTabsIconCn} aria-hidden />
                    {t("tab_hr_job_catalog")}
                  </TabsTrigger>
                )}
                {showEmployeeEvalTab && (
                  <TabsTrigger value="eval" className={adminTabsTriggerCn}>
                    <ClipboardPenLine className={adminTabsIconCn} aria-hidden />
                    {t("tab_hr_eval")}
                  </TabsTrigger>
                )}
                {showEmployeeEvalTab && (
                  <TabsTrigger value="warning-letters" className={adminTabsTriggerCn}>
                    <FileWarning className={adminTabsIconCn} aria-hidden />
                    {t("tab_hr_warning_letters")}
                  </TabsTrigger>
                )}
                {showEvalAnalyticsTab && (
                  <TabsTrigger value="eval-analytics" className={adminTabsTriggerCn}>
                    <LineChart className={adminTabsIconCn} aria-hidden />
                    {t("tab_hr_eval_analytics")}
                  </TabsTrigger>
                )}
                <TabsTrigger value="eval-list" className={adminTabsTriggerCn}>
                  <ListChecks className={adminTabsIconCn} aria-hidden />
                  {t("tab_eval_list")}
                </TabsTrigger>
                {isOffice && (
                  <TabsTrigger value="eval-items-setting" className={adminTabsTriggerCn}>
                    <LayoutList className={adminTabsIconCn} aria-hidden />
                    {t("tab_eval_items_setting")}
                  </TabsTrigger>
                )}
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="list" className={adminTabsContentCn}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 lg:sticky lg:top-0 lg:self-start">
                <EmployeeForm
                  form={form}
                  onChange={setForm}
                  stores={storesForForm}
                  storeLabels={erpStoreLabels}
                  jobOptions={jobOptions}
                  onSave={handleSave}
                  onNew={handleNew}
                  saving={saving}
                  roleDisabled={isManager || isFranchiseeRole(userRole)}
                  canAssignOfficerDirectorRoles={isDirectorRole(userRole)}
                  franchiseeMultiEnabled={!!franchiseeMulti?.enabled}
                  canEditFranchiseeExtraStores={isOffice}
                  allStoresForFranchiseePick={storesForFilter}
                  franchiseeMultiMaxStores={franchiseeMulti?.maxStores ?? 5}
                />
              </div>
              <div className="lg:col-span-8 space-y-3">
                {/* 직무별 인원 요약 - 조회 버튼 클릭 후에만 표시 */}
                {hasSearched && employeeCache.length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <JobCountSummary rows={filteredRows} t={t} />
                  </div>
                )}
                <div className="rounded-lg border border-border bg-card p-3">
                  <EmployeeFilterBar
                    stores={storesForFilter}
                    storeFilter={storeFilter}
                    onStoreFilterChange={setStoreFilter}
                    jobOptions={jobOptions}
                    jobFilter={jobFilter}
                    onJobFilterChange={setJobFilter}
                    gradeFilter={gradeFilter}
                    onGradeFilterChange={setGradeFilter}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    onSearch={handleSearch}
                  />
                </div>
                {loadError && (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    {loadError}
                  </div>
                )}
                <div className="overflow-x-auto max-h-[600px]">
                  {!hasSearched ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                      {t("emp_search_hint")}
                    </div>
                  ) : (
                  <EmployeeTable
                    rows={filteredRows}
                    loading={loading}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    t={t}
                    statusFilter={statusFilter}
                  />
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="movement" className={adminTabsContentCn}>
            <EmployeeMovementTab userStore={userStore} userRole={userRole} />
          </TabsContent>

          <TabsContent value="headcount" className={adminTabsContentCn}>
            <EmployeeHeadcountTab userStore={userStore} userRole={userRole} isManager={isManagerOrFranchisee} />
          </TabsContent>

          {isOffice && (
            <TabsContent value="job-catalog" className={adminTabsContentCn}>
              <EmployeeJobCatalogTab
                t={t}
                onSaved={() => {
                  void loadEmployeeList({ updateDisplay: true })
                }}
              />
            </TabsContent>
          )}

          {showEmployeeEvalTab && (
            <TabsContent value="eval" className={adminTabsContentCn}>
              <EmployeeEvalTab
                stores={storesForForm}
                employees={allEmployees}
                onSaved={loadEmployeeList}
                jumpToEmployee={evalJumpPayload}
                onJumpToEmployeeConsumed={clearEvalJump}
              />
            </TabsContent>
          )}
          {showEmployeeEvalTab && (
            <TabsContent value="warning-letters" className={adminTabsContentCn}>
              <EmployeeWarningLettersTab
                stores={storesForFilter}
                employees={allEmployees}
                onOpenEval={(target) => {
                  if (target.evalType === "standalone") return
                  setEvalJumpPayload({
                    key: Date.now(),
                    store: target.store,
                    name: target.name,
                    nick: target.nick,
                    job: target.job,
                    evalType: target.evalType,
                  })
                  setHrMainTab("eval")
                }}
              />
            </TabsContent>
          )}
          {showEvalAnalyticsTab && (
            <TabsContent value="eval-analytics" className={adminTabsContentCn}>
              <EmployeeEvalAnalyticsTab
                stores={storesForFilter}
                canPickAllStores={evalAnalyticsCanPickAllStores}
                canUseAiSummary={isOffice}
                onOpenEvalForUnevaluated={
                  showEmployeeEvalTab
                    ? (row) => {
                        setEvalJumpPayload({
                          key: Date.now(),
                          store: row.store,
                          name: row.name,
                          nick: row.nick,
                          job: row.job,
                        })
                        setHrMainTab("eval")
                      }
                    : undefined
                }
              />
            </TabsContent>
          )}
          <TabsContent value="eval-list" className="mt-0 p-4 sm:p-6">
            <EmployeeEvalListTab stores={storesForFilter} />
          </TabsContent>
          {isOffice && (
            <TabsContent value="eval-items-setting" className={adminTabsContentCn}>
              <EmployeeEvalItemsSettingsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}
