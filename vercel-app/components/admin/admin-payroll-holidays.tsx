"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type HolidayRow = {
  id: number
  year: number
  date: string
  name: string
}

export function AdminPayrollHolidays() {
  const { lang } = useLang()
  const t = useT(lang)

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<HolidayRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [queried, setQueried] = useState(false)

  const [addDate, setAddDate] = useState("")
  const [addName, setAddName] = useState("")
  const [saving, setSaving] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editName, setEditName] = useState("")

  const loadList = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/getPublicHolidays?year=${year}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.list)) {
        setList(data.list)
      } else {
        setList([])
        setError(translateApiMessage(data.msg) || t("pay_error"))
      }
    } catch {
      setList([])
      setError(t("pay_error"))
    } finally {
      setLoading(false)
      setQueried(true)
    }
  }

  const handleAdd = async () => {
    if (!addDate || addDate.length < 10) {
      setError(t("holiday_date_required"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/savePublicHoliday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", year, date: addDate, name: addName || "-" }),
      })
      const data = await res.json()
      if (data.success) {
        setAddDate("")
        setAddName("")
        loadList()
      } else {
        setError(translateApiMessage(data.msg) || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (editId == null || !editDate || editDate.length < 10) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/savePublicHoliday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editId,
          year,
          date: editDate,
          name: editName || "-",
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEditId(null)
        setEditDate("")
        setEditName("")
        loadList()
      } else {
        setError(translateApiMessage(data.msg) || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("holiday_delete_confirm"))) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/savePublicHoliday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      })
      const data = await res.json()
      if (data.success) {
        loadList()
      } else {
        setError(translateApiMessage(data.msg) || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (row: HolidayRow) => {
    setEditId(row.id)
    setEditDate(row.date)
    setEditName(row.name)
  }

  const cancelEdit = () => {
    setEditId(null)
    setEditDate("")
    setEditName("")
  }

  const hasResult = list.length > 0

  const translateApiMessage = (msg: string | undefined): string => {
    if (!msg) return ""
    const m = msg.trim()
    if (m === "연도를 선택해주세요.") return t("holiday_year_required")
    if (m === "조회 실패.") return t("holiday_query_fail")
    if (m === "연도와 날짜를 입력해주세요.") return t("holiday_year_date_required")
    if (m === "추가되었습니다.") return t("holiday_added")
    if (m === "id가 필요합니다.") return t("holiday_id_required")
    if (m === "수정할 항목이 없습니다.") return t("holiday_nothing_to_update")
    if (m === "수정되었습니다.") return t("holiday_updated")
    if (m === "삭제되었습니다.") return t("holiday_deleted")
    if (m.includes("action을 지정해주세요")) return t("holiday_action_required")
    return msg
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="w-24">
            <label className="text-xs font-semibold block mb-1">{t("holiday_year")}</label>
            <Input
              type="number"
              min={2020}
              max={2040}
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || currentYear)}
              className="h-9 text-xs"
            />
          </div>
          <Button
            className="h-9 font-medium"
            onClick={loadList}
            disabled={loading}
          >
            {loading ? t("loading") : t("holiday_query")}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-lg bg-muted/40">
          <div className="min-w-[140px]">
            <label className="text-xs font-semibold block mb-1">{t("holiday_date")}</label>
            <Input
              type="date"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-semibold block mb-1">{t("holiday_name")}</label>
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={t("holiday_name")}
              className="h-9 text-xs"
            />
          </div>
          <Button
            className="h-9 font-medium"
            onClick={handleAdd}
            disabled={saving}
          >
            {t("holiday_add")}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {hasResult && (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-left font-medium">{t("holiday_date")}</th>
                  <th className="p-2 text-left font-medium">{t("holiday_name")}</th>
                  <th className="p-2 text-center font-medium w-20">{t("pay_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) =>
                  editId === r.id ? (
                    <tr key={r.id} className="border-b border-border/60 bg-muted/20">
                      <td className="p-2">
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="h-8 text-xs w-36"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex flex-row gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelEdit}>
                            {t("cancel")}
                          </Button>
                          <Button size="sm" className="h-7 text-xs" onClick={handleUpdate} disabled={saving}>
                            {t("holiday_save")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                      <td className="p-2">{r.date}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">
                        <div className="flex flex-row gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => startEdit(r)} disabled={saving}>
                            {t("emp_edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDelete(r.id)}
                            disabled={saving}
                          >
                            {t("holiday_delete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {!queried && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            {t("holiday_query_please")}
          </div>
        )}

        {queried && !hasResult && !error && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {t("pay_no_data")}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
