"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { UserCheck, UserPlus, Trash2, Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getAdminEmployeeList,
  getLeaveApprovers,
  saveLeaveApprovers,
  useStoreList,
  type AdminEmployeeItem,
  type LeaveApproverPerson,
} from "@/lib/api-client"
import { appAlert } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { displayLabelShort } from "@/lib/utils"

function personLabel(p: LeaveApproverPerson | AdminEmployeeItem) {
  const name = "name" in p ? p.name : ""
  const nick = "nick" in p ? p.nick : ""
  const code =
    "employeeCode" in p && p.employeeCode
      ? String(p.employeeCode)
      : ""
  const base = nick ? `${name} (${nick})` : name
  return code ? `${base} · ${code}` : base
}

function empIdOf(e: AdminEmployeeItem): number {
  return e.row > 0 ? e.row : 0
}

export function AdminLeaveApprovers() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { posStores: storeList } = useStoreList()

  const [loading, setLoading] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [globalList, setGlobalList] = useState<LeaveApproverPerson[]>([])
  const [byStore, setByStore] = useState<Record<string, LeaveApproverPerson[]>>({})
  const [storeFilter, setStoreFilter] = useState("")
  const [employees, setEmployees] = useState<AdminEmployeeItem[]>([])
  const [search, setSearch] = useState("")
  const [addTarget, setAddTarget] = useState<"global" | "store">("global")
  const [busyId, setBusyId] = useState<string | null>(null)

  const stores = useMemo(
    () => storeList.filter((s) => s && s !== "All"),
    [storeList]
  )

  const load = useCallback(async () => {
    if (!auth?.store) return
    setLoading(true)
    try {
      const [approvers, empRes] = await Promise.all([
        getLeaveApprovers(),
        getAdminEmployeeList({
          userStore: auth.store,
          userRole: auth.role || "",
          status: "active",
        }),
      ])
      setCanEdit(!!approvers.canEdit)
      setGlobalList(approvers.global || [])
      setByStore(approvers.byStore || {})
      setEmployees(empRes.list || [])
    } catch {
      setGlobalList([])
      setByStore({})
    } finally {
      setLoading(false)
    }
  }, [auth?.store, auth?.role])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!storeFilter && stores[0]) setStoreFilter(stores[0])
  }, [stores, storeFilter])

  const storeApprovers = byStore[storeFilter] || []

  const searchQ = search.trim().toLowerCase()
  const filteredEmployees = useMemo(() => {
    let list = employees
    if (addTarget === "store" && storeFilter) {
      list = list.filter(
        (e) =>
          String(e.store || "").toLowerCase() === storeFilter.toLowerCase() ||
          String(e.role || "")
            .toLowerCase()
            .includes("officer") ||
          String(e.role || "")
            .toLowerCase()
            .includes("director")
      )
    }
    if (!searchQ) return list.slice(0, 40)
    return list
      .filter((e) => {
        const hay = `${e.name} ${e.nick} ${e.employeeCode || ""} ${e.store} ${e.role}`.toLowerCase()
        return hay.includes(searchQ)
      })
      .slice(0, 40)
  }, [employees, searchQ, addTarget, storeFilter])

  const alreadyGlobal = useMemo(
    () => new Set(globalList.map((p) => p.employeeId)),
    [globalList]
  )
  const alreadyStore = useMemo(
    () => new Set(storeApprovers.map((p) => p.employeeId)),
    [storeApprovers]
  )

  const runSave = async (params: {
    action: "add" | "remove"
    scope: "all" | "store"
    employeeId: number
    store?: string
  }) => {
    const key = `${params.action}-${params.scope}-${params.employeeId}-${params.store || ""}`
    setBusyId(key)
    try {
      const res = await saveLeaveApprovers(params)
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("processFail"))
        return
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const addManagersOfStore = async () => {
    if (!storeFilter || !canEdit) return
    const managers = employees.filter((e) => {
      const r = String(e.role || "").toLowerCase()
      const sameStore =
        String(e.store || "").toLowerCase() === storeFilter.toLowerCase()
      return sameStore && (r.includes("manager") || r.includes("franchisee"))
    })
    for (const m of managers) {
      const id = empIdOf(m)
      if (!(id > 0) || alreadyStore.has(id)) continue
      await runSave({
        action: "add",
        scope: "store",
        employeeId: id,
        store: storeFilter,
      })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <UserCheck className="h-4 w-4" />
            {t("leaveApproversGlobal") || "전체 승인자"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("leaveApproversGlobalHint") ||
              "모든 매장 휴가를 승인·반려할 수 있습니다. Director는 목록과 무관하게 항상 승인할 수 있습니다."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-xs text-muted-foreground">{t("loading")}</p>
          ) : globalList.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("leaveApproversEmpty") || "등록된 승인자가 없습니다."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {globalList.map((p) => (
                <li
                  key={p.employeeId}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <span>
                    {personLabel(p)}
                    {p.store ? (
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        {displayLabelShort(p.store)}
                      </Badge>
                    ) : null}
                  </span>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`${ADMIN_BTN_XS_CN} text-destructive`}
                      disabled={busyId != null}
                      onClick={() =>
                        runSave({
                          action: "remove",
                          scope: "all",
                          employeeId: p.employeeId,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <UserCheck className="h-4 w-4" />
            {t("leaveApproversStore") || "매장 승인자"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("leaveApproversStoreHint") ||
              "해당 매장만 승인합니다. 이 매장에 한 명이라도 지정되면 점장 role만으로는 승인되지 않습니다. 미지정 매장은 기존처럼 점장·가맹점주가 승인합니다."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={storeFilter || undefined} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("store") || "매장"} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {displayLabelShort(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEdit && storeFilter ? (
              <Button
                variant="outline"
                size="sm"
                className={ADMIN_BTN_XS_CN}
                disabled={busyId != null}
                onClick={() => void addManagersOfStore()}
              >
                {t("leaveApproversAddManagers") || "이 매장 점장 추가"}
              </Button>
            ) : null}
          </div>
          {!storeFilter ? (
            <p className="text-xs text-muted-foreground">{t("leaveApproversPickStore") || "매장을 선택하세요."}</p>
          ) : storeApprovers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("leaveApproversEmptyFallback") ||
                "지정된 승인자가 없습니다. 이 매장은 점장·가맹점주 폴백이 적용됩니다."}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {storeApprovers.map((p) => (
                <li
                  key={p.employeeId}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <span>
                    {personLabel(p)}
                    {p.role ? (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        {p.role}
                      </Badge>
                    ) : null}
                  </span>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`${ADMIN_BTN_XS_CN} text-destructive`}
                      disabled={busyId != null}
                      onClick={() =>
                        runSave({
                          action: "remove",
                          scope: "store",
                          employeeId: p.employeeId,
                          store: storeFilter,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <UserPlus className="h-4 w-4" />
              {t("leaveApproversAdd") || "승인자 추가"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={addTarget === "global" ? "default" : "outline"}
                className={ADMIN_BTN_XS_CN}
                onClick={() => setAddTarget("global")}
              >
                {t("leaveApproversGlobal") || "전체"}
              </Button>
              <Button
                size="sm"
                variant={addTarget === "store" ? "default" : "outline"}
                className={ADMIN_BTN_XS_CN}
                onClick={() => setAddTarget("store")}
              >
                {t("leaveApproversStore") || "매장"}
              </Button>
            </div>
            <div className="relative max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("leaveApproversSearch") || "이름·닉네임·코드 검색"}
              />
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filteredEmployees.map((e) => {
                const id = empIdOf(e)
                if (!(id > 0)) return null
                const blocked =
                  addTarget === "global" ? alreadyGlobal.has(id) : alreadyStore.has(id)
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      {personLabel(e)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {displayLabelShort(e.store)} · {e.role}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      className={ADMIN_BTN_XS_CN}
                      disabled={blocked || busyId != null || (addTarget === "store" && !storeFilter)}
                      onClick={() =>
                        runSave({
                          action: "add",
                          scope: addTarget === "global" ? "all" : "store",
                          employeeId: id,
                          ...(addTarget === "store" ? { store: storeFilter } : {}),
                        })
                      }
                    >
                      {blocked ? t("leaveApproversAlready") || "등록됨" : t("add") || "추가"}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("leaveApproversViewOnly") || "승인자 목록은 본사에서만 수정할 수 있습니다."}
        </p>
      )}
    </div>
  )
}
