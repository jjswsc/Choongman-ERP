"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, Pencil, Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type HolidayRow = { id?: number; year: number; date: string; name: string }

function fmtDate(d: string): string {
  if (!d || d.length < 10) return ""
  return d.slice(0, 10)
}

export function AdminPublicHolidays() {
  const { lang } = useLang()
  const t = useT(lang)

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear.toString())
  const [list, setList] = useState<HolidayRow[]>([])
  const [loading, setLoading] = useState(false)
  const [queried, setQueried] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [addDate, setAddDate] = useState("")
  const [addName, setAddName] = useState("")
  const [adding, setAdding] = useState(false)

  const [editId, setEditId] = useState<number | null>(null)
  const [editDate, setEditDate] = useState("")
  const [editName, setEditName] = useState("")
  const [saving, setSaving] = useState(false)

  const handleQuery = async () => {
    const y = parseInt(year, 10)
    if (!y || isNaN(y)) {
      setError(t("holiday_year_required") || "연도를 입력해 주세요.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/getPublicHolidays?year=${y}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.list)) {
        setList(data.list.map((r: { id?: number; year?: number; date?: string; name?: string }) => ({
          id: r.id,
          year: Number(r.year) || y,
          date: fmtDate(r.date || ""),
          name: String(r.name || "").trim(),
        })))
      } else {
        setList([])
        setError(data.msg || t("pay_error"))
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
    const y = parseInt(year, 10)
    const d = fmtDate(addDate)
    if (!y || isNaN(y) || !d) {
      setError(t("holiday_date_required") || "연도와 날짜(yyyy-MM-dd)를 입력해 주세요.")
      return
    }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch("/api/savePublicHoliday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", year: y, date: d, name: addName || "-" }),
      })
      const data = await res.json()
      if (data.success) {
        setAddDate("")
        setAddName("")
        handleQuery()
      } else {
        setError(data.msg || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    } finally {
      setAdding(false)
    }
  }

  const handleEdit = (row: HolidayRow) => {
    if (row.id) {
      setEditId(row.id)
      setEditDate(row.date)
      setEditName(row.name)
    }
  }

  const handleSaveEdit = async () => {
    if (editId == null) return
    const d = fmtDate(editDate)
    if (!d) {
      setError(t("holiday_date_required") || "날짜를 yyyy-MM-dd 형식으로 입력해 주세요.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const y = parseInt(year, 10)
      const res = await fetch("/api/savePublicHoliday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          id: editId,
          year: y || undefined,
          date: d,
          name: editName || "-",
        }),
      })
      const data = await res.json()
      if (data.success) {
        setEditId(null)
        handleQuery()
      } else {
        setError(data.msg || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("holiday_delete_confirm") || "삭제하시겠습니까?")) return
    setError(null)
    try {
      const res = await fetch("/api/savePublicHoliday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      })
      const data = await res.json()
      if (data.success) {
        handleQuery()
      } else {
        setError(data.msg || t("pay_save_fail"))
      }
    } catch {
      setError(t("pay_save_fail"))
    }
  }


  return (
    <Card className="shadow-sm">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs font-semibold block mb-1">{t("holiday_year") || "연도"}</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="h-9 text-xs"
              min={2020}
              max={2035}
            />
          </div>
          <Button className="h-9 font-medium" onClick={handleQuery} disabled={loading}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {loading ? t("loading") : t("search")}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-lg bg-muted/50">
          <div className="min-w-[130px]">
            <label className="text-xs font-semibold block mb-1">{t("holiday_date") || "날짜"}</label>
            <Input
              type="date"
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-semibold block mb-1">{t("holiday_name") || "휴일명"}</label>
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={t("holiday_name") || "휴일명"}
              className="h-9 text-xs"
            />
          </div>
          <Button
            variant="outline"
            className="h-9 font-medium"
            onClick={handleAdd}
            disabled={adding}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {adding ? t("loading") : (t("holiday_add") || "추가")}
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-2 text-left font-medium">{t("holiday_date") || "날짜"}</th>
                  <th className="p-2 text-left font-medium">{t("holiday_name") || "휴일명"}</th>
                  <th className="p-2 text-right font-medium w-24">{t("cancel") || "작업"}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id ?? r.date} className="border-b border-border/60 hover:bg-muted/30">
                    {editId === r.id ? (
                      <>
                        <td className="p-2">
                          <Input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="h-8 text-xs w-full"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditId(null)}>
                              {t("cancel")}
                            </Button>
                            <Button size="sm" className="h-7" onClick={handleSaveEdit} disabled={saving}>
                              {saving ? t("loading") : t("pay_save")}
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2">{r.date}</td>
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 text-right">
                          {r.id ? (
                            <div className="flex gap-1 justify-end">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => handleEdit(r)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => handleDelete(r.id!)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!queried && (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            {t("holiday_query_please") || "연도를 선택하고 [조회]를 눌러주세요."}
          </div>
        )}

        {queried && list.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            {t("pay_no_data")}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
