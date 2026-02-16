"use client"

import * as React from "react"
import { Users } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { isManagerRole } from "@/lib/permissions"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  getAdminEmployeeList,
  getEmployeeLatestGrades,
  saveAdminEmployee,
  deleteAdminEmployee,
  type AdminEmployeeItem,
} from "@/lib/api-client"
import {
  EmployeeFilterBar,
  EmployeeTable,
  EmployeeForm,
  EmployeeEvalTab,
  EmployeeEvalListTab,
  EmployeeEvalSettingTab,
  emptyForm,
  type EmployeeTableRow,
  type EmployeeFormData,
} from "@/components/employees"

const JOB_OPTIONS = ["Service", "Kitchen", "Officer", "Director"] as const

const JOB_STYLE: Record<string, { bg: string; label: string }> = {
  Service: { bg: "bg-amber-50/90 dark:bg-amber-950/20", label: "empJobService" },
  Kitchen: { bg: "bg-emerald-50/90 dark:bg-emerald-950/20", label: "empJobKitchen" },
  Officer: { bg: "bg-sky-50/90 dark:bg-sky-950/20", label: "empJobOfficer" },
  Director: { bg: "bg-violet-50/90 dark:bg-violet-950/20", label: "empJobDirector" },
  기타: { bg: "bg-slate-50/90 dark:bg-slate-800/15", label: "workLogOther" },
}

function JobCountSummary({
  rows,
  t,
}: {
  rows: { job?: string }[]
  t: (k: string) => string
}) {
  const counts = { Service: 0, Kitchen: 0, Officer: 0, Director: 0, 기타: 0 }
  for (const r of rows) {
    const j = String(r.job || "").trim()
    if (JOB_OPTIONS.includes(j as (typeof JOB_OPTIONS)[number])) {
      counts[j as keyof typeof counts]++
    } else {
      counts.기타++
    }
  }
  const unit = t("empJobCountUnit")
  const items = [...JOB_OPTIONS, "기타"].filter((j) => counts[j as keyof typeof counts] > 0)
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

function toFormData(e: AdminEmployeeItem): EmployeeFormData {
  return {
    row: e.row,
    store: e.store || "",
    name: e.name || "",
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
    role: e.role || "Staff",
    annualLeaveDays: e.annualLeaveDays ?? 15,
    bankName: e.bankName || "",
    accountNumber: e.accountNumber || "",
    positionAllowance: e.positionAllowance ?? 0,
    riskAllowance: e.riskAllowance ?? 0,
    grade: e.grade || "",
    photo: e.photo || "",
  }
}

export default function EmployeesPage() {
  const t = useT(useLang().lang)
  const { auth } = useAuth()
  const userStore = (auth?.store || "").trim()
  const userRole = (auth?.role || "").trim()

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [employeeCache, setEmployeeCache] = React.useState<EmployeeTableRow[]>([])
  const [stores, setStores] = React.useState<string[]>([])
  const [storeFilter, setStoreFilter] = React.useState("")
  const [gradeFilter, setGradeFilter] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("")
  const [searchText, setSearchText] = React.useState("")
  const [hasSearched, setHasSearched] = React.useState(false)
  const [form, setForm] = React.useState<EmployeeFormData>({ ...emptyForm })
  const fullListRef = React.useRef<EmployeeTableRow[]>([])

  const loadEmployeeList = React.useCallback(
    async (opts?: { updateDisplay?: boolean }, callback?: () => void) => {
      setLoading(true)
      try {
        const [listRes, gradesRes] = await Promise.all([
          getAdminEmployeeList({ userStore, userRole }),
          getEmployeeLatestGrades(),
        ])
        const list = listRes.list || []
        const storeList = listRes.stores || []
        setStores(storeList)

        const normName = (n: string) =>
          String(n || "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, "")
            .trim() || String(n || "").trim()

        const merged: EmployeeTableRow[] = list.map((e) => {
          const fromSheet = e.grade != null && String(e.grade).trim() !== "" ? String(e.grade).trim() : null
          if (fromSheet) {
            return { ...e, finalGrade: fromSheet }
          }
          const store = String(e.store || "").trim().replace(/\s+/g, " ")
          const name = String(e.name || "").trim().replace(/\s+/g, " ")
          const nick = String(e.nick || "").trim().replace(/\s+/g, " ")
          const key = store + "|" + name
          const keyNorm = store + "|" + (normName(name) || name)
          const keyNick = nick && nick !== name ? store + "|" + nick : ""
          const g =
            (gradesRes && gradesRes[key]?.grade) ||
            (gradesRes && gradesRes[keyNorm]?.grade) ||
            (gradesRes && keyNick && gradesRes[keyNick]?.grade) ||
            null
          return { ...e, finalGrade: g && String(g).trim() ? g : "-" }
        })
        fullListRef.current = merged
        if (opts?.updateDisplay !== false) {
          setEmployeeCache(merged)
        } else {
          setEmployeeCache([])
        }
        callback?.()
      } catch {
        fullListRef.current = []
        setEmployeeCache([])
        setStores([])
      } finally {
        setLoading(false)
      }
    },
    [userStore, userRole]
  )

  React.useEffect(() => {
    loadEmployeeList({ updateDisplay: false })
  }, [loadEmployeeList])

  const filteredRows = React.useMemo(() => {
    const s = storeFilter || "All"
    const g = gradeFilter || "All"
    const st = statusFilter || "all"
    const k = searchText.toLowerCase().trim()
    return employeeCache.filter((e) => {
      const eStore = String(e.store || "")
      const eName = String(e.name || "").toLowerCase()
      const eNick = String(e.nick || "").toLowerCase()
      const eGrade = String(e.finalGrade || "").trim()
      const hasResign = Boolean(String(e.resign || "").trim())
      const matchStore = s === "" || s === "All" || eStore === s
      const matchGrade = g === "" || g === "All" || eGrade === g
      const matchStatus =
        st === "" ||
        st === "all" ||
        (st === "active" && !hasResign) ||
        (st === "resigned" && hasResign)
      const matchKey = k === "" || eName.includes(k) || eNick.includes(k)
      return matchStore && matchGrade && matchStatus && matchKey
    })
  }, [employeeCache, storeFilter, gradeFilter, statusFilter, searchText])

  const handleSearch = () => {
    if (fullListRef.current.length > 0 && employeeCache.length === 0) {
      setEmployeeCache(fullListRef.current)
    }
    setHasSearched(true)
  }

  const handleEdit = (idx: number) => {
    const e = filteredRows[idx]
    if (e) setForm(toFormData(e))
  }

  const handleDelete = async (rowId: number) => {
    if (!confirm(t("emp_confirm_delete"))) return
    setLoading(true)
    try {
      const res = await deleteAdminEmployee({ r: rowId, userStore, userRole })
      alert(translateApiMessage(res.message ?? (res as { message?: string }).message, t) || t("msg_delete_ok"))
      await loadEmployeeList({ updateDisplay: true })
    } catch (e) {
      console.error(e)
      alert(t("emp_result_empty") || t("msg_empty_result"))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    try {
      const res = await saveAdminEmployee({
        d: form,
        userStore,
        userRole,
      })
      if (res.success) {
        alert(translateApiMessage(res.message, t) || t("msg_saved"))
        setForm({ ...emptyForm })
        await loadEmployeeList({ updateDisplay: true })
      } else {
        alert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      console.error(e)
      alert(t("msg_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const isManager = isManagerRole(userRole)

  const handleNew = () => {
    const base = { ...emptyForm, annualLeaveDays: 15 }
    if (isManager && userStore) base.store = userStore
    setForm(base)
  }
  const storesForForm = isManager && userStore ? [userStore] : stores

  if (loading && employeeCache.length === 0) {
    return (
      <div className="flex-1 overflow-auto flex items-center justify-center min-h-[200px]">
        <span className="text-muted-foreground">{t("loading")}</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminEmployees")}</h1>
            <p className="text-xs text-muted-foreground">{t("tab_hr_list")}</p>
          </div>
        </div>

        <Tabs defaultValue="list" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="list">{t("tab_hr_list")}</TabsTrigger>
            <TabsTrigger value="eval">{t("tab_hr_eval")}</TabsTrigger>
            <TabsTrigger value="eval-list">{t("tab_eval_list")}</TabsTrigger>
            <TabsTrigger value="kitchen-setting">{t("tab_eval_kitchen_setting")}</TabsTrigger>
            <TabsTrigger value="service-setting">{t("tab_eval_service_setting")}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4">
                <EmployeeForm
                  form={form}
                  onChange={setForm}
                  stores={storesForForm}
                  onSave={handleSave}
                  onNew={handleNew}
                  saving={saving}
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
                    stores={storesForForm}
                    storeFilter={storeFilter}
                    onStoreFilterChange={setStoreFilter}
                    gradeFilter={gradeFilter}
                    onGradeFilterChange={setGradeFilter}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    searchText={searchText}
                    onSearchTextChange={setSearchText}
                    onSearch={handleSearch}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t("emp_search_hint")}</p>
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

          <TabsContent value="eval">
            <EmployeeEvalTab
              stores={storesForForm}
              employees={employeeCache}
              onSaved={loadEmployeeList}
            />
          </TabsContent>
          <TabsContent value="eval-list">
            <EmployeeEvalListTab stores={stores} />
          </TabsContent>
          <TabsContent value="kitchen-setting">
            <EmployeeEvalSettingTab type="kitchen" readOnly={isManager} />
          </TabsContent>
          <TabsContent value="service-setting">
            <EmployeeEvalSettingTab type="service" readOnly={isManager} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
