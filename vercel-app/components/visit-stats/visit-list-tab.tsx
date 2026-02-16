"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  useStoreList,
  getAdminEmployeeList,
  getStoreVisitHistory,
  type StoreVisitHistoryItem,
} from "@/lib/api-client"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function VisitListTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [stores, setStores] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [officeEmployees, setOfficeEmployees] = useState<string[]>([])

  const [listStart, setListStart] = useState(todayStr())
  const [listEnd, setListEnd] = useState(todayStr())
  const [listStore, setListStore] = useState("All")
  const [listDept, setListDept] = useState("All")
  const [listEmployee, setListEmployee] = useState("All")
  const [listPurpose, setListPurpose] = useState("__all__")
  const [historyList, setHistoryList] = useState<StoreVisitHistoryItem[]>([])
  const [listLoading, setListLoading] = useState(false)

  const { stores: storeKeys } = useStoreList()
  const loadOptions = useCallback(async () => {
    setStores(["All", ...storeKeys.filter((s) => s !== "All")])
    const empRes = await getAdminEmployeeList({ userStore: auth?.store || "", userRole: auth?.role || "director" })

    const deptSet = new Set<string>()
    const empList: string[] = []
    for (const e of empRes.list || []) {
      const st = String(e.store || "").trim()
      const stLower = st.toLowerCase()
      const isOffice = OFFICE_STORES.some((o) => st === o || stLower.includes(o.toLowerCase()))
      if (!isOffice) continue
      const dept = String(e.job || "").trim() || "Staff"
      deptSet.add(dept)
      const name = String(e.nick || "").trim() || String(e.name || "").trim()
      if (name && !empList.includes(name)) empList.push(name)
    }
    setDepartments(["All", ...Array.from(deptSet).sort()])
    setOfficeEmployees(["All", ...empList.sort()])
  }, [auth?.store, auth?.role, storeKeys])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  const loadHistory = useCallback(async () => {
    setListLoading(true)
    try {
      const list = await getStoreVisitHistory({
        startStr: listStart,
        endStr: listEnd,
        store: listStore === "All" ? undefined : listStore,
        employeeName: listEmployee === "All" ? undefined : listEmployee,
        department: listDept === "All" ? undefined : listDept,
        purpose: listPurpose && listPurpose !== "__all__" ? listPurpose : undefined,
      })
      setHistoryList(list || [])
    } catch {
      setHistoryList([])
    } finally {
      setListLoading(false)
    }
  }, [listStart, listEnd, listStore, listEmployee, listDept, listPurpose])

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <label className="text-xs font-semibold block mb-1">{t("visit_start_date")}</label>
            <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 w-[130px] text-xs" />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">{t("visit_end_date")}</label>
            <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 w-[130px] text-xs" />
          </div>
          <Select value={listStore} onValueChange={setListStore}>
            <SelectTrigger className="h-9 w-[120px] text-xs">
              <SelectValue placeholder={t("store")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((st) => (
                <SelectItem key={st} value={st}>{st === "All" ? t("all") : st}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={listDept} onValueChange={setListDept}>
            <SelectTrigger className="h-9 w-[100px] text-xs">
              <SelectValue placeholder={t("visit_dept_col")} />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>{d === "All" ? t("all") : d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={listEmployee} onValueChange={setListEmployee}>
            <SelectTrigger className="h-9 w-[110px] text-xs">
              <SelectValue placeholder={t("visit_employee_office")} />
            </SelectTrigger>
            <SelectContent>
              {officeEmployees.map((emp) => (
                <SelectItem key={emp} value={emp}>{emp === "All" ? t("all") : emp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={listPurpose} onValueChange={setListPurpose}>
            <SelectTrigger className="h-9 w-[110px] text-xs">
              <SelectValue placeholder={t("visit_col_purpose")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("all")}</SelectItem>
              <SelectItem value="정기 점검">{t("visitPurposeInspect")}</SelectItem>
              <SelectItem value="직원 교육">{t("visitPurposeTraining")}</SelectItem>
              <SelectItem value="긴급 지원">{t("visitPurposeUrgent")}</SelectItem>
              <SelectItem value="매장 미팅">{t("visitPurposeMeeting")}</SelectItem>
              <SelectItem value="기타">{t("visitPurposeEtc")}</SelectItem>
            </SelectContent>
          </Select>
          <Button className="h-9 font-medium" onClick={loadHistory} disabled={listLoading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {listLoading ? t("loading") : t("search")}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-2 text-center font-medium">{t("visit_col_date")}</th>
                <th className="p-2 text-center font-medium">{t("visit_col_time")}</th>
                <th className="p-2 text-center font-medium">{t("visit_col_visitor")}</th>
                <th className="p-2 text-center font-medium">{t("visit_col_store")}</th>
                <th className="p-2 text-center font-medium">{t("visit_col_type")}</th>
                <th className="p-2 text-center font-medium">{t("visit_col_purpose")}</th>
                <th className="p-2 text-center font-medium">{t("visit_col_duration")}</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">{t("loading")}</td>
                </tr>
              ) : historyList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">{t("visit_query_please")}</td>
                </tr>
              ) : (
                historyList.map((h, i) => (
                  <tr key={i} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="p-2 text-center">{h.date}</td>
                    <td className="p-2 text-center">{h.time}</td>
                    <td className="p-2 text-center font-medium">{h.name}</td>
                    <td className="p-2 text-center">{h.store}</td>
                    <td className="p-2 text-center">{h.type}</td>
                    <td className="p-2 text-center">{h.purpose || "-"}</td>
                    <td className="p-2 text-center font-medium">{h.duration ? `${h.duration}분` : "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
