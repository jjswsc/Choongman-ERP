"use client"

import * as React from "react"
import { CalendarClock, RefreshCw, XCircle, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  getAdminItems,
  getItemCategories,
  getPosMenus,
  getPosMenuCategoriesConfig,
  getPriceSchedules,
  savePriceSchedule,
  cancelPriceSchedule,
  applyDuePriceSchedules,
  type PriceScheduleRow,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"

type PriceScheduleEntity = "item" | "pos_menu"

export interface PriceScheduleTabProps {
  mode: PriceScheduleEntity
  canManage: boolean
}

function utcIsoToBangkokText(iso: string): string {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return iso
  }
}

function bangkokLocalToUtcIso(localDateTime: string): string {
  const [datePart, timePart] = String(localDateTime || "").split("T")
  if (!datePart || !timePart) return ""
  const [y, m, d] = datePart.split("-").map(Number)
  const [hh, mm] = timePart.split(":").map(Number)
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return ""
  // 사용자 입력을 방콕 로컬 시간으로 간주하고 UTC로 변환한다.
  return new Date(Date.UTC(y, m - 1, d, hh - 7, mm, 0, 0)).toISOString()
}

function nextHourBangkokLocalInput(): string {
  const now = new Date()
  const bkk = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }))
  bkk.setMinutes(0, 0, 0)
  bkk.setHours(bkk.getHours() + 1)
  const yyyy = bkk.getFullYear()
  const mm = String(bkk.getMonth() + 1).padStart(2, "0")
  const dd = String(bkk.getDate()).padStart(2, "0")
  const hh = String(bkk.getHours()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:00`
}

export function PriceScheduleTab({ mode, canManage }: PriceScheduleTabProps) {
  const { lang } = useLang()
  const [rows, setRows] = React.useState<PriceScheduleRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<"all" | "pending" | "applied" | "cancelled" | "failed">("pending")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [entityId, setEntityId] = React.useState("")
  const [fieldName, setFieldName] = React.useState(mode === "item" ? "price" : "price")
  const [scheduledValue, setScheduledValue] = React.useState("")
  const [effectiveAtLocal, setEffectiveAtLocal] = React.useState(nextHourBangkokLocalInput())
  const [itemOptions, setItemOptions] = React.useState<{ id: string; label: string; category: string }[]>([])
  const [categoryOptions, setCategoryOptions] = React.useState<string[]>([])

  const fieldOptions = React.useMemo(() => {
    if (mode === "item") {
      return [
        { value: "price", label: "판매가" },
        { value: "cost", label: "원가" },
      ]
    }
    return [
      { value: "price", label: "홀/매장가" },
      { value: "price_delivery", label: "배달가" },
    ]
  }, [mode])

  const loadEntityOptions = React.useCallback(async () => {
    if (mode === "item") {
      const [items, categoryRes] = await Promise.all([getAdminItems(), getItemCategories()])
      const categories = (categoryRes?.categories || []).filter(Boolean).sort()
      setCategoryOptions(categories)
      setItemOptions(
        (items || [])
          .map((x) => ({
            id: String(x.code || ""),
            label: `${x.code} ${x.name}`,
            category: String(x.category || "").trim(),
          }))
          .filter((x) => x.id)
      )
      return
    }
    const [menus, categoriesConfig] = await Promise.all([getPosMenus(), getPosMenuCategoriesConfig()])
    const categoryMap = categoriesConfig?.categoriesByMain || {}
    const categories = Array.from(new Set(Object.values(categoryMap).flat().filter(Boolean))).sort()
    setCategoryOptions(categories)
    setItemOptions(
      (menus || [])
        .map((x) => ({
          id: String(x.id || ""),
          label: `${x.code || x.id} ${x.name}`,
          category: String(x.category || "").trim(),
        }))
        .filter((x) => x.id)
    )
  }, [mode])

  const loadSchedules = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPriceSchedules({
        entityType: mode,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm.trim() || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        limit: 300,
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [mode, statusFilter, searchTerm, categoryFilter])

  const filteredEntityOptions = React.useMemo(() => {
    if (categoryFilter === "all") return itemOptions
    return itemOptions.filter((x) => (x.category || "").trim() === categoryFilter)
  }, [itemOptions, categoryFilter])

  React.useEffect(() => {
    if (!entityId) return
    if (!filteredEntityOptions.some((x) => x.id === entityId)) {
      setEntityId("")
    }
  }, [entityId, filteredEntityOptions])

  React.useEffect(() => {
    loadEntityOptions().catch(() => setItemOptions([]))
  }, [loadEntityOptions])

  React.useEffect(() => {
    loadSchedules().catch(() => setRows([]))
  }, [loadSchedules])

  const handleSave = React.useCallback(async () => {
    if (!canManage) {
      await appAlert("본사 권한만 가격 예약을 등록할 수 있습니다.")
      return
    }
    if (!entityId) {
      await appAlert("대상을 선택해 주세요.")
      return
    }
    const n = Number(scheduledValue)
    if (!Number.isFinite(n) || n < 0) {
      await appAlert("변경 가격은 0 이상 숫자로 입력해 주세요.")
      return
    }
    const effectiveAt = bangkokLocalToUtcIso(effectiveAtLocal)
    if (!effectiveAt) {
      await appAlert("적용 시각을 확인해 주세요.")
      return
    }
    setSaving(true)
    try {
      const r = await savePriceSchedule({
        entityType: mode,
        entityId,
        fieldName,
        scheduledValue: n,
        effectiveAt,
      })
      if (!r.success) {
        await appAlert(r.message || "저장에 실패했습니다.")
        return
      }
      setScheduledValue("")
      await loadSchedules()
      await appAlert("가격 예약이 등록되었습니다.")
    } finally {
      setSaving(false)
    }
  }, [canManage, entityId, scheduledValue, effectiveAtLocal, mode, fieldName, loadSchedules])

  const handleCancel = React.useCallback(async (id: number) => {
    if (!canManage) return
    if (!await appConfirm("이 예약을 취소할까요?")) return
    const r = await cancelPriceSchedule({ id })
    if (!r.success) {
      await appAlert(r.message || "취소에 실패했습니다.")
      return
    }
    await loadSchedules()
  }, [canManage, loadSchedules])

  const handleApplyDue = React.useCallback(async () => {
    if (!canManage) return
    if (!await appConfirm("도래한 예약 가격을 지금 즉시 반영할까요?")) return
    setApplying(true)
    try {
      const r = await applyDuePriceSchedules()
      if (!r.success) {
        await appAlert(r.message || "적용 실행에 실패했습니다.")
        return
      }
      await loadSchedules()
      await appAlert(`적용 완료: 성공 ${r.appliedCount}건, 실패 ${r.failedCount}건`)
    } finally {
      setApplying(false)
    }
  }, [canManage, loadSchedules])

  const statusLabel = (s: string) => {
    if (s === "pending") return "대기"
    if (s === "applied") return "적용"
    if (s === "cancelled") return "취소"
    if (s === "failed") return "실패"
    return s
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="applied">적용</SelectItem>
            <SelectItem value="cancelled">취소</SelectItem>
            <SelectItem value="failed">실패</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">카테고리 전체</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-9 w-[220px] text-sm"
          placeholder={mode === "item" ? "품목명 검색" : "메뉴명 검색"}
        />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void loadSchedules()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          {loading ? "조회 중" : "조회"}
        </Button>
        {canManage && (
          <Button size="sm" variant="secondary" className="h-9 gap-1.5" onClick={handleApplyDue} disabled={applying}>
            <PlayCircle className="h-3.5 w-3.5" />
            {applying ? "반영 중" : "도래 예약 즉시 반영"}
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          가격 예약 등록
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <Select value={entityId} onValueChange={setEntityId} disabled={!canManage}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={mode === "item" ? "품목 선택" : "메뉴 선택"} />
            </SelectTrigger>
            <SelectContent>
              {filteredEntityOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fieldName} onValueChange={setFieldName} disabled={!canManage}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="항목" />
            </SelectTrigger>
            <SelectContent>
              {fieldOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={scheduledValue}
            onChange={(e) => setScheduledValue(e.target.value)}
            type="number"
            min={0}
            step="0.01"
            className="h-9 text-sm"
            placeholder="변경 가격"
            disabled={!canManage}
          />
          <Input
            value={effectiveAtLocal}
            onChange={(e) => setEffectiveAtLocal(e.target.value)}
            type="datetime-local"
            className="h-9 text-sm"
            disabled={!canManage}
          />
          <Button className="h-9" onClick={handleSave} disabled={!canManage || saving}>
            {saving ? "저장 중" : "예약 저장"}
          </Button>
        </div>
        {!canManage && (
          <p className="text-xs text-muted-foreground">매장 계정은 가격 예약 목록 조회만 가능합니다.</p>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left">대상</th>
                <th className="px-3 py-2 text-left">항목</th>
                <th className="px-3 py-2 text-right">예약가</th>
                <th className="px-3 py-2 text-left">적용 시각(방콕)</th>
                <th className="px-3 py-2 text-left">상태</th>
                <th className="px-3 py-2 text-left">처리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{r.entity_display_name || r.entity_id}</td>
                  <td className="px-3 py-2">{r.field_name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.scheduled_value || 0).toLocaleString(lang === "ko" ? "ko-KR" : "en-US")}</td>
                  <td className="px-3 py-2">{utcIsoToBangkokText(r.effective_at)}</td>
                  <td className="px-3 py-2">{statusLabel(r.status)}</td>
                  <td className="px-3 py-2">
                    {canManage && r.status === "pending" ? (
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void handleCancel(r.id)}>
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        취소
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    예약 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
