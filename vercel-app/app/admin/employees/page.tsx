"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  BarChart2,
  ClipboardList,
  ClipboardPenLine,
  History,
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
  isOfficeStore,
  isAccountingRole,
  hasOfficeStaffScope,
  canAssignEmployeeOfficerRole,
  canAssignEmployeeDirectorRole,
  canonicalEmployeeFormRole,
} from "@/lib/permissions"
import {
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
  adminTabsContentCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatEmployeeDisplayName, normalizeEmployeeNameForGradeMatch } from "@/lib/employee-display-name"
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
  EmployeeEvalHubTab,
  EmployeeMovementTab,
  EmployeeHeadcountTab,
  EmployeeJobCatalogTab,
  EmployeeInputHistoryTab,
  emptyForm,
  type EmployeeTableRow,
  type EmployeeFormData,
  type EmployeeEvalJumpTarget,
} from "@/components/employees"
import { expandStoreVariantsForGrade } from "@/lib/grade-store-key-variants"
import { getEmployeeJobOptionLabel } from "@/lib/employee-job-catalog"
import { HrPageShell } from "@/components/hr/hr-page-shell"
import { EmployeeCsvImportDialog } from "@/components/employees/employee-csv-import-dialog"
import { useErpBackHandler } from "@/lib/erp-navigation"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"

const JOB_OPTIONS = ["Service", "Kitchen", "Officer", "Director"] as const

const JOB_STYLE: Record<string, { bg: string }> = {
  Service: { bg: "bg-amber-50/90 dark:bg-amber-950/20" },
  Kitchen: { bg: "bg-emerald-50/90 dark:bg-emerald-950/20" },
  Franchise: { bg: "bg-orange-50/90 dark:bg-orange-950/20" },
  Officer: { bg: "bg-sky-50/90 dark:bg-sky-950/20" },
  Director: { bg: "bg-violet-50/90 dark:bg-violet-950/20" },
  Logistic: { bg: "bg-teal-50/90 dark:bg-teal-950/20" },
  Other: { bg: "bg-slate-50/90 dark:bg-slate-800/15" },
}

function JobCountSummary({
  rows,
  t,
}: {
  rows: { job?: string }[]
  t: (k: string) => string
}) {
  const counts: Record<string, number> = {
    Service: 0,
    Kitchen: 0,
    Franchise: 0,
    Officer: 0,
    Director: 0,
    Logistic: 0,
    Other: 0,
  }
  for (const r of rows) {
    const j = String(r.job || "").trim()
    const key = j && counts[j] !== undefined ? j : "Other"
    counts[key]++
  }
  const unit = t("empJobCountUnit")
  const items = ["Service", "Kitchen", "Franchise", "Officer", "Director", "Logistic", "Other"].filter(
    (j) => counts[j] > 0
  )
  const total = items.reduce((s, j) => s + counts[j as keyof typeof counts], 0)
  if (items.length === 0) return null
  return (
    <div className="flex rounded-lg overflow-hidden border border-border shadow-sm">
      {items.map((j) => {
        const n = counts[j as keyof typeof counts]
        const style = JOB_STYLE[j] ?? JOB_STYLE.Other
        const label = getEmployeeJobOptionLabel(j)
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
  const resignDate = String(e.resign || "").trim().slice(0, 10)
  const todayBangkok = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
  const raw = String((e as { employmentStatus?: unknown }).employmentStatus || "")
    .trim()
    .toLowerCase()
  if (raw === "active" || raw === "leave" || raw === "resigned" || raw === "suspended") {
    if (raw === "resigned" && resignDate && resignDate > todayBangkok) return "active"
    return raw
  }
  if (!resignDate) return "active"
  return resignDate <= todayBangkok ? "resigned" : "active"
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
    canManageOfficePayroll: !!(e as AdminEmployeeItem).canManageOfficePayroll,
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
  const { posStores: storeListFromApi, storeLabels: erpStoreLabels, resolveStoreKey } = useStoreList()
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
  const [displayListLoaded, setDisplayListLoaded] = React.useState(false)
  const displayLoadSeqRef = React.useRef(0)
  const [form, setForm] = React.useState<EmployeeFormData>({ ...emptyForm })
  const [formSheetOpen, setFormSheetOpen] = React.useState(false)
  const fullListRef = React.useRef<EmployeeTableRow[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [apiJobOptions, setApiJobOptions] = React.useState<string[]>([])
  const [franchiseeMulti, setFranchiseeMulti] = React.useState<FranchiseeMultiStoreSettings | null>(null)
  const [hrMainTab, setHrMainTab] = useAdminUrlTab(
    "tab",
    ["list", "input-history", "movement", "headcount", "job-catalog", "eval"] as const,
    "list"
  )
  const [evalSubTab, setEvalSubTab] = useAdminUrlTab(
    "evalSub",
    ["register", "analytics", "list", "warning-letters", "items-setting"] as const,
    "register"
  )
  const [evalJumpPayload, setEvalJumpPayload] = React.useState<EmployeeEvalJumpTarget | null>(null)
  const [evalResultSaveSerial, setEvalResultSaveSerial] = React.useState(0)
  const clearEvalJump = React.useCallback(() => setEvalJumpPayload(null), [])

  useErpBackHandler(hrMainTab !== "list", () => {
    setHrMainTab("list")
    setEvalSubTab("register")
    return true
  })
  useErpBackHandler(hrMainTab === "eval" && evalSubTab !== "register", () => {
    setEvalSubTab("register")
    return true
  })

  const openEvalRegister = React.useCallback((target?: EmployeeEvalJumpTarget) => {
    if (target) setEvalJumpPayload(target)
    setHrMainTab("eval")
    setEvalSubTab("register")
  }, [setHrMainTab, setEvalSubTab])

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
    if (!hasOfficeStaffScope(userRole, userStore)) {
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
      const updateDisplay = opts?.updateDisplay !== false
      const seq = updateDisplay ? ++displayLoadSeqRef.current : 0
      if (updateDisplay) {
        setLoading(true)
        setLoadError(null)
      }
      try {
        const [listRes, gradesRes] = await Promise.all([
          getAdminEmployeeList({ userStore, userRole }),
          getEmployeeLatestGrades(),
        ])
        const list = (listRes as { list?: EmployeeTableRow[]; stores?: string[]; jobOptions?: string[]; _debug?: Record<string, unknown> }).list || []
        const storeList = (listRes as { stores?: string[] }).stores || []
        const jobOpts = (listRes as { jobOptions?: string[] }).jobOptions || []
        const debug = (listRes as { _debug?: Record<string, unknown> })._debug
        if (updateDisplay) {
          setStores(storeList)
          setApiJobOptions(jobOpts)

          if (list.length === 0 && debug) {
            const samples = debug.sampleStores
              ? t("emp_list_debug_sample_stores").replace(
                  "{stores}",
                  JSON.stringify(debug.sampleStores)
                )
              : ""
            const extra = debug.hint ? ` ${String(debug.hint)}` : ""
            setLoadError(
              `${t("emp_list_debug_prefix")} userStore="${String(debug.userStore ?? "")}" userRole="${String(debug.userRole ?? "")}" role="${String(debug.role ?? "")}" ` +
                t("emp_list_debug_db_rows").replace("{rows}", String(debug.totalRowsFromDb ?? 0)) +
                samples +
                extra
            )
          }
        } else {
          setApiJobOptions(jobOpts)
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
        }
        callback?.()
      } catch (e) {
        fullListRef.current = []
        setAllEmployees([])
        if (opts?.updateDisplay !== false) {
          setEmployeeCache([])
          setStores([])
          const msg = e instanceof Error ? e.message : String(e)
          setLoadError(t("emp_list_load_failed").replace("{msg}", msg))
        }
      } finally {
        if (updateDisplay && seq === displayLoadSeqRef.current) {
          setDisplayListLoaded(true)
          setLoading(false)
        }
      }
    },
    [userStore, userRole, t]
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
        setFormSheetOpen(true)
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
    setDisplayListLoaded(false)
    loadEmployeeList({ updateDisplay: true })
  }

  const handleEdit = (idx: number) => {
    const e = filteredRows[idx]
    if (e) {
      setForm(adminRowToForm(e))
      setFormSheetOpen(true)
    }
  }

  const handleDelete = async (rowId: number) => {
    if (!await appConfirm(t("adminEmployeeConfirmDeactivate"))) return
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
        ...(hasOfficeStaffScope(userRole, userStore) ? { extraStores: form.extraStores } : {}),
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_saved"))
        setForm({ ...emptyForm })
        setFormSheetOpen(false)
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
  const isOffice = hasOfficeStaffScope(userRole, userStore)
  const showEvalAnalyticsTab = isOffice || isManagerOrFranchisee
  const showEmployeeEvalTab = isOffice || isManagerOrFranchisee
  const showEmployeeInputHistoryTab = isOffice || isAccountingRole(userRole) || isManagerOrFranchisee
  const showEvalHubTab = true
  const evalAnalyticsCanPickAllStores = isOffice

  const handleHrMainTabChange = React.useCallback((next: string) => {
    if (next === "warning-letters") {
      setHrMainTab("eval")
      setEvalSubTab("warning-letters")
      return
    }
    if (next === "eval-analytics") {
      setHrMainTab("eval")
      setEvalSubTab("analytics")
      return
    }
    if (next === "eval-list") {
      setHrMainTab("eval")
      setEvalSubTab("list")
      return
    }
    if (next === "eval-items-setting") {
      setHrMainTab("eval")
      setEvalSubTab("items-setting")
      return
    }
    setHrMainTab(next as typeof hrMainTab)
  }, [setHrMainTab, setEvalSubTab])

  const handleNew = () => {
    const base = { ...emptyForm }
    if ((isManager || isFranchiseeRole(userRole)) && userStore) base.store = resolveStoreKey(userStore)
    setForm(base)
    setFormSheetOpen(true)
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

  // 직원 평가(입력·경고서 등)는 allEmployees 필요 → 목록 탭 조회 없이도 백그라운드 로드
  React.useEffect(() => {
    if (!showEmployeeEvalTab) return
    void loadEmployeeList({ updateDisplay: false })
  }, [showEmployeeEvalTab, loadEmployeeList])

  return (
    <HrPageShell icon={Users} title={t("adminEmployees")} subtitle={t("adminEmployeesSub")} className="space-y-4">
        <Tabs value={hrMainTab} onValueChange={handleHrMainTabChange} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  <ClipboardList className={adminTabsIconCn} aria-hidden />
                  {t("tab_hr_list")}
                </TabsTrigger>
                {showEmployeeInputHistoryTab && (
                  <TabsTrigger value="input-history" className={adminTabsTriggerCn}>
                    <History className={adminTabsIconCn} aria-hidden />
                    {t("tab_hr_input_history")}
                  </TabsTrigger>
                )}
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
                {showEvalHubTab && (
                  <TabsTrigger value="eval" className={adminTabsTriggerCn}>
                    <ClipboardPenLine className={adminTabsIconCn} aria-hidden />
                    {t("tab_hr_eval")}
                  </TabsTrigger>
                )}
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="list" className={adminTabsContentCn}>
            <div className="space-y-3">
              {hasSearched && employeeCache.length > 0 && (
                <JobCountSummary rows={filteredRows} t={t} />
              )}
              {isOffice ? (
                <div className="flex justify-end">
                  <EmployeeCsvImportDialog onImported={() => void loadEmployeeList({ updateDisplay: true })} />
                </div>
              ) : null}
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
                  onNew={handleNew}
                />
              </div>
              {loadError && (
                <div className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                  {loadError}
                </div>
              )}
              {!hasSearched ? (
                <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
                  {t("emp_search_hint")}
                </div>
              ) : (
                <EmployeeTable
                  rows={filteredRows}
                  loading={loading || (hasSearched && !displayListLoaded)}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  t={t}
                  statusFilter={statusFilter}
                  selectedRowId={form.row}
                />
              )}
            </div>

            <Sheet open={formSheetOpen} onOpenChange={setFormSheetOpen}>
              <SheetContent
                side="right"
                className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
              >
                <SheetHeader className="shrink-0 space-y-1 border-b px-4 py-3 pr-12 text-left">
                  <SheetTitle className="text-base">
                    {form.row > 0
                      ? `${t("emp_edit")} · ${formatEmployeeDisplayName(form.name, form.nameTitle) || "—"}`
                      : t("emp_new")}
                  </SheetTitle>
                  {form.row > 0 && String(form.employeeCode || "").trim() ? (
                    <p className="font-mono text-xs text-muted-foreground tabular-nums">
                      {String(form.employeeCode).trim()}
                    </p>
                  ) : null}
                </SheetHeader>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-4">
                  <EmployeeForm
                    key={form.row > 0 ? `edit-${form.row}` : "new"}
                    embedded
                    form={form}
                    onChange={setForm}
                    stores={storesForForm}
                    storeLabels={erpStoreLabels}
                    jobOptions={jobOptions}
                    onSave={handleSave}
                    onNew={handleNew}
                    saving={saving}
                    roleDisabled={isManager || isFranchiseeRole(userRole)}
                    canAssignOfficerRole={canAssignEmployeeOfficerRole(userRole)}
                    canAssignDirectorRole={canAssignEmployeeDirectorRole(userRole)}
                    canAssignOfficePayrollManager={canAssignEmployeeDirectorRole(userRole)}
                    franchiseeMultiEnabled={!!franchiseeMulti?.enabled}
                    canEditFranchiseeExtraStores={isOffice}
                    allStoresForFranchiseePick={storesForFilter}
                    franchiseeMultiMaxStores={franchiseeMulti?.maxStores ?? 5}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </TabsContent>

          {showEmployeeInputHistoryTab && (
            <TabsContent value="input-history" className={adminTabsContentCn}>
              <EmployeeInputHistoryTab />
            </TabsContent>
          )}

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

          {showEvalHubTab && (
            <TabsContent value="eval" className={adminTabsContentCn}>
              <EmployeeEvalHubTab
                subTab={evalSubTab}
                onSubTabChange={setEvalSubTab}
                storesForForm={storesForForm}
                storesForFilter={storesForFilter}
                allEmployees={allEmployees}
                showRegisterTab={showEmployeeEvalTab}
                showAnalyticsTab={showEvalAnalyticsTab}
                showListTab
                showWarningTab={showEmployeeEvalTab}
                showItemsTab={isOffice}
                evalAnalyticsCanPickAllStores={evalAnalyticsCanPickAllStores}
                canUseAiSummary={isOffice}
                jumpToEmployee={evalJumpPayload}
                onJumpToEmployeeConsumed={clearEvalJump}
                evalSaveSerial={evalResultSaveSerial}
                onEvalSaved={() => {
                  void loadEmployeeList()
                  setEvalResultSaveSerial((n) => n + 1)
                }}
                onOpenEvalRegister={openEvalRegister}
              />
            </TabsContent>
          )}
        </Tabs>
    </HrPageShell>
  )
}
