"use client"

import * as React from "react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { adminTabsListRowCn, adminTabsScrollCn, adminTabsTriggerCn } from "@/lib/admin-tab-styles"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChevronDown, ChevronRight, Download, GitBranch, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { isAccountingRole, isOfficeRole } from "@/lib/permissions"
import {
  deleteAccountSubject,
  getAccountSubjects,
  saveAccountSubject,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"

type CoaTab = "all" | "asset" | "liability" | "equity" | "revenue" | "expense" | "transfer"

function sortSubjects(a: AccountSubjectItem, b: AccountSubjectItem): number {
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  if (so !== 0) return so
  return a.code.localeCompare(b.code)
}

function visibleIdSet(items: AccountSubjectItem[], tab: CoaTab): Set<number> {
  const byId = new Map<number, AccountSubjectItem>()
  for (const x of items) {
    if (x.id != null) byId.set(x.id, x)
  }
  const match = (x: AccountSubjectItem) => tab === "all" || x.type === tab
  const ids = new Set<number>()
  for (const x of items) {
    if (x.id != null && match(x)) ids.add(x.id)
  }
  const addAncestors = (id: number) => {
    let cur = byId.get(id)
    let guard = 0
    while (cur?.parentId != null && guard++ < 500) {
      const p = cur.parentId
      if (ids.has(p)) break
      ids.add(p)
      cur = byId.get(p)
    }
  }
  for (const id of [...ids]) addAncestors(id)
  return ids
}

function buildChildrenMap(rows: AccountSubjectItem[]): Map<number | null, AccountSubjectItem[]> {
  const m = new Map<number | null, AccountSubjectItem[]>()
  for (const r of rows) {
    const p = r.parentId ?? null
    if (!m.has(p)) m.set(p, [])
    m.get(p)!.push(r)
  }
  for (const [, arr] of m) arr.sort(sortSubjects)
  return m
}

function rowMatchesSearch(row: AccountSubjectItem, needle: string): boolean {
  if (!needle) return true
  const parts = [row.code, row.name, row.nameEn ?? "", row.nameTh ?? ""].map((s) => String(s).toLowerCase())
  return parts.some((p) => p.includes(needle))
}

/** 검색 시: 본인 일치 또는 하위 트리에 일치가 있는 노드만 남김(null = 검색 없음) */
function subtreeMatchIdsForSearch(filteredItems: AccountSubjectItem[], rawQuery: string): Set<number> | null {
  const needle = rawQuery.trim().toLowerCase()
  if (!needle) return null

  const byId = new Map<number, AccountSubjectItem>()
  for (const x of filteredItems) {
    if (x.id != null) byId.set(x.id, x)
  }
  const children = buildChildrenMap(filteredItems)
  const memo = new Map<number, boolean>()

  function subtreeHasMatch(id: number): boolean {
    if (memo.has(id)) return memo.get(id)!
    const row = byId.get(id)
    if (!row) {
      memo.set(id, false)
      return false
    }
    if (rowMatchesSearch(row, needle)) {
      memo.set(id, true)
      return true
    }
    const kids = children.get(id) ?? []
    const v = kids.some((k) => k.id != null && subtreeHasMatch(k.id))
    memo.set(id, v)
    return v
  }

  const out = new Set<number>()
  for (const x of filteredItems) {
    if (x.id != null && subtreeHasMatch(x.id)) out.add(x.id)
  }
  return out
}

export function AdminChartOfAccounts() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const tt = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      if (!v || v === key) return fallback
      return v
    },
    [t]
  )

  const canEdit = isOfficeRole(auth?.role || "") || isAccountingRole(auth?.role || "")

  const [items, setItems] = React.useState<AccountSubjectItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [tab, setTab] = React.useState<CoaTab>("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set())
  const [dlgOpen, setDlgOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AccountSubjectItem | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [form, setForm] = React.useState({
    code: "",
    name: "",
    nameEn: "",
    nameTh: "",
    type: "expense",
    pAndLSection: "expense",
    sortOrder: 0,
    parentId: "" as string,
    isHeader: false,
    statementType: "" as string,
    normalSide: "" as string,
    coaClass: "" as string,
  })

  const load = React.useCallback(() => {
    setLoading(true)
    getAccountSubjects()
      .then((list) => {
        setItems(Array.isArray(list) ? list : [])
        setExpanded(new Set((list || []).map((x) => x.id).filter((id): id is number => id != null)))
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const visibleIds = React.useMemo(() => visibleIdSet(items, tab), [items, tab])
  const tabFiltered = React.useMemo(
    () => items.filter((x) => x.id != null && visibleIds.has(x.id)),
    [items, visibleIds]
  )
  const searchMatchIds = React.useMemo(
    () => subtreeMatchIdsForSearch(tabFiltered, searchQuery),
    [tabFiltered, searchQuery]
  )
  const displayFiltered = React.useMemo(() => {
    if (searchMatchIds === null) return tabFiltered
    return tabFiltered.filter((x) => x.id != null && searchMatchIds.has(x.id))
  }, [tabFiltered, searchMatchIds])

  const childrenByParent = React.useMemo(() => buildChildrenMap(displayFiltered), [displayFiltered])
  const roots = childrenByParent.get(null) ?? []

  React.useEffect(() => {
    if (!searchQuery.trim()) return
    const ids = displayFiltered.map((x) => x.id).filter((id): id is number => id != null)
    setExpanded(new Set(ids))
  }, [searchQuery, displayFiltered])

  const openNew = () => {
    setEditing(null)
    setForm({
      code: "",
      name: "",
      nameEn: "",
      nameTh: "",
      type: tab === "all" || tab === "transfer" ? "expense" : tab,
      pAndLSection: tab === "revenue" ? "revenue" : tab === "expense" ? "expense" : "expense",
      sortOrder: 0,
      parentId: "",
      isHeader: false,
      statementType: "",
      normalSide: "",
      coaClass: "",
    })
    setDlgOpen(true)
  }

  const openEdit = (row: AccountSubjectItem) => {
    setEditing(row)
    setForm({
      code: row.code,
      name: row.name,
      nameEn: row.nameEn || "",
      nameTh: row.nameTh || "",
      type: row.type,
      pAndLSection: row.pAndLSection === "fixed" ? "expense" : row.pAndLSection || "",
      sortOrder: row.sortOrder ?? 0,
      parentId: row.parentId != null ? String(row.parentId) : "",
      isHeader: Boolean(row.isHeader),
      statementType: row.statementType || "",
      normalSide: row.normalSide || "",
      coaClass: row.coaClass || "",
    })
    setDlgOpen(true)
  }

  const parentOptions = React.useMemo(() => {
    const selfId = editing?.id
    return [...items]
      .filter((x) => x.id != null && x.id !== selfId)
      .sort(sortSubjects)
      .map((x) => ({ id: x.id!, label: `${x.code} — ${lang === "ko" ? x.name : x.nameEn || x.name}` }))
  }, [items, editing?.id, lang])

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      await appAlert(tt("coaCodeNameRequired", "코드와 과목명을 입력하세요."))
      return
    }
    setSaving(true)
    try {
      const parentId = form.parentId ? Number(form.parentId) : null
      const res = await saveAccountSubject({
        id: editing?.id,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || null,
        nameTh: form.nameTh.trim() || null,
        type: form.type,
        pAndLSection: form.pAndLSection.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
        parentId: parentId && !Number.isNaN(parentId) ? parentId : null,
        isHeader: form.isHeader,
        statementType: form.statementType ? form.statementType : null,
        normalSide: form.normalSide ? form.normalSide : null,
        coaClass: form.coaClass ? form.coaClass : null,
      })
      if (res.success) {
        setDlgOpen(false)
        load()
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_saved", "저장되었습니다."))
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: AccountSubjectItem) => {
    if (!row.id) return
    if (!canEdit) return
    if (row.isSystem) {
      await appAlert(tt("coaErrSystemDelete", "시스템 기본 계정은 삭제할 수 없습니다."))
      return
    }
    if (!(await appConfirm(tt("coaDeleteConfirm", "이 계정과목을 삭제하시겠습니까?")))) return
    try {
      const res = await deleteAccountSubject({ id: row.id })
      if (res.success) {
        load()
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_deleted", "삭제되었습니다."))
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    }
  }

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    setExpanded(new Set(items.map((x) => x.id).filter((id): id is number => id != null)))
  }

  const collapseAll = () => setExpanded(new Set())

  const exportCsv = () => {
    const byId = new Map(items.filter((x) => x.id != null).map((x) => [x.id!, x]))
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    const cols = [
      "code",
      "name",
      "name_en",
      "name_th",
      "type",
      "parent_code",
      "p_and_l_section",
      "sort_order",
      "statement_type",
      "normal_side",
      "is_header",
      "is_system",
      "coa_class",
    ]
    const lines = [cols.join(",")]
    for (const r of [...items].sort(sortSubjects)) {
      const pcode = r.parentId != null ? byId.get(r.parentId)?.code ?? "" : ""
      lines.push(
        [
          esc(r.code),
          esc(r.name),
          esc(r.nameEn || ""),
          esc(r.nameTh || ""),
          esc(r.type),
          esc(pcode),
          esc(r.pAndLSection || ""),
          String(r.sortOrder ?? 0),
          esc(r.statementType || ""),
          esc(r.normalSide || ""),
          r.isHeader ? "1" : "0",
          r.isSystem ? "1" : "0",
          esc(r.coaClass || ""),
        ].join(",")
      )
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `coa_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const typeLabel = (ty: string) => {
    if (ty === "expense") return tt("accountSubjectTypeExpense", "비용")
    if (ty === "revenue") return tt("accountSubjectTypeRevenue", "수익")
    if (ty === "asset") return tt("accountSubjectTypeAsset", "자산")
    if (ty === "liability") return tt("coaTypeLiability", "부채")
    if (ty === "equity") return tt("coaTypeEquity", "자본")
    if (ty === "transfer") return tt("accountSubjectTypeTransfer", "이체")
    return ty
  }

  const renderNode = (row: AccountSubjectItem, depth: number): React.ReactNode => {
    const id = row.id
    if (id == null) return null
    const kids = childrenByParent.get(id) ?? []
    const hasKids = kids.length > 0
    const isExp = expanded.has(id)
    const displayName = lang === "ko" ? row.name : row.nameEn || row.name

    return (
      <div key={id}>
        <div
          className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2 text-sm"
          style={{ paddingLeft: 8 + depth * 18 }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {hasKids ? (
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => toggle(id)}>
                {isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : (
              <span className="inline-block w-7 shrink-0" />
            )}
            <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
            <span className="min-w-0 truncate font-medium">{displayName}</span>
            {row.nameTh ? <span className="hidden text-xs text-muted-foreground sm:inline">({row.nameTh})</span> : null}
            {row.isHeader ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                {tt("coaBadgeHeader", "헤더")}
              </span>
            ) : null}
            {row.isSystem ? (
              <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
                {tt("coaBadgeSystem", "시스템")}
              </span>
            ) : null}
          </div>
          <span className="text-xs text-muted-foreground">{typeLabel(row.type)}</span>
          <div className="flex shrink-0 gap-1">
            {canEdit ? (
              <>
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => openEdit(row)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  {tt("coaEdit", "수정")}
                </Button>
                {!row.isSystem ? (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => handleDelete(row)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        {hasKids && isExp ? <div>{kids.map((c) => renderNode(c, depth + 1))}</div> : null}
      </div>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as CoaTab)} className="w-full sm:w-auto">
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="all" className={adminTabsTriggerCn}>
                  {tt("coaTabAll", "전체")}
                </TabsTrigger>
                <TabsTrigger value="asset" className={adminTabsTriggerCn}>
                  {tt("coaTabAsset", "자산")}
                </TabsTrigger>
                <TabsTrigger value="liability" className={adminTabsTriggerCn}>
                  {tt("coaTabLiability", "부채")}
                </TabsTrigger>
                <TabsTrigger value="equity" className={adminTabsTriggerCn}>
                  {tt("coaTabEquity", "자본")}
                </TabsTrigger>
                <TabsTrigger value="revenue" className={adminTabsTriggerCn}>
                  {tt("coaTabRevenue", "수익")}
                </TabsTrigger>
                <TabsTrigger value="expense" className={adminTabsTriggerCn}>
                  {tt("coaTabExpense", "비용")}
                </TabsTrigger>
                <TabsTrigger value="transfer" className={adminTabsTriggerCn}>
                  {tt("coaTabTransfer", "이체")}
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("store_refresh")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={expandAll}>
              {tt("coaExpandAll", "모두 펼치기")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={collapseAll}>
              {tt("coaCollapseAll", "모두 접기")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1 h-3.5 w-3.5" />
              {tt("coaExportCsv", "CSV")}
            </Button>
            {canEdit ? (
              <Button type="button" size="sm" onClick={openNew}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                {tt("coaAddAccount", "계정 추가")}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:max-w-md">
          <Label className="text-xs text-muted-foreground sr-only">{tt("coaSearchLabel", "계정 검색")}</Label>
          <div className="relative flex w-full items-center">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              className="h-9 pl-9 pr-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tt("coaSearchPlaceholder", "코드, 과목명, 영문, 태국어 검색")}
              aria-label={tt("coaSearchLabel", "계정 검색")}
            />
            {searchQuery.trim() ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0.5 top-1/2 h-7 w-7 -translate-y-1/2 shrink-0 text-muted-foreground"
                onClick={() => setSearchQuery("")}
                aria-label={tt("coaSearchClear", "검색 지우기")}
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>

        {!canEdit ? (
          <p className="text-sm text-muted-foreground">{tt("coaOfficeOnlyHint", "본사·회계 역할만 계정 추가·삭제·구조 변경이 가능합니다.")}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t("loading") || "…"}</p>
        ) : roots.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {searchQuery.trim() ? tt("coaNoSearchResults", "검색 결과가 없습니다.") : tt("coaEmpty", "표시할 계정이 없습니다.")}
          </p>
        ) : (
          <div className="rounded-md border bg-card">{roots.map((r) => renderNode(r, 0))}</div>
        )}
      </CardContent>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              {editing ? tt("coaDlgEditTitle", "계정과목 수정") : tt("coaDlgNewTitle", "계정과목 추가")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editing?.isSystem ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">{tt("coaSystemEditHint", "시스템 계정: 코드·유형은 변경할 수 없습니다.")}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{tt("coaColCode", "코드")}</Label>
                <Input
                  className="h-9 font-mono text-sm"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                  disabled={Boolean(editing?.isSystem)}
                />
              </div>
              <div>
                <Label className="text-xs">{tt("coaSortOrder", "정렬")}</Label>
                <Input
                  type="number"
                  className="h-9 text-sm"
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">{tt("coaColName", "과목명")}</Label>
              <Input className="h-9 text-sm" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{tt("coaNameEn", "영문명")}</Label>
              <Input className="h-9 text-sm" value={form.nameEn} onChange={(e) => setForm((p) => ({ ...p, nameEn: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">{tt("coaFieldNameTh", "태국어명")}</Label>
              <Input className="h-9 text-sm" value={form.nameTh} onChange={(e) => setForm((p) => ({ ...p, nameTh: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{tt("accountSubjectType", "유형")}</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}
                  disabled={Boolean(editing?.isSystem)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">{typeLabel("asset")}</SelectItem>
                    <SelectItem value="liability">{typeLabel("liability")}</SelectItem>
                    <SelectItem value="equity">{typeLabel("equity")}</SelectItem>
                    <SelectItem value="revenue">{typeLabel("revenue")}</SelectItem>
                    <SelectItem value="expense">{typeLabel("expense")}</SelectItem>
                    <SelectItem value="transfer">{typeLabel("transfer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{tt("coaPlSection", "손익 구분")}</Label>
                <Select value={form.pAndLSection || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, pAndLSection: v === "__none__" ? "" : v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{tt("coaUnset", "(없음)")}</SelectItem>
                    <SelectItem value="revenue">{tt("accountSubjectPLRevenue", "수익")}</SelectItem>
                    <SelectItem value="cost">{tt("accountSubjectPLCost", "매출원가")}</SelectItem>
                    <SelectItem value="expense">{tt("accountSubjectPLExpense", "판관비")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">{tt("coaFieldParent", "상위 계정")}</Label>
              <Select value={form.parentId || "__root__"} onValueChange={(v) => setForm((p) => ({ ...p, parentId: v === "__root__" ? "" : v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={tt("coaFieldParentNone", "(없음)")} />
                </SelectTrigger>
                <SelectContent className="max-h-[240px]">
                  <SelectItem value="__root__">{tt("coaFieldParentNone", "(없음)")}</SelectItem>
                  {parentOptions.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{tt("coaFieldStatement", "재무제표")}</Label>
                <Select value={form.statementType || "__auto__"} onValueChange={(v) => setForm((p) => ({ ...p, statementType: v === "__auto__" ? "" : v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">{tt("coaStmtUnset", "(자동)")}</SelectItem>
                    <SelectItem value="bs">{tt("coaStmtBs", "재무상태표")}</SelectItem>
                    <SelectItem value="pl">{tt("coaStmtPl", "손익계산서")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{tt("coaFieldNormalSide", "정상 잔액")}</Label>
                <Select value={form.normalSide || "__auto__"} onValueChange={(v) => setForm((p) => ({ ...p, normalSide: v === "__auto__" ? "" : v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__auto__">{tt("coaSideUnset", "(자동)")}</SelectItem>
                    <SelectItem value="debit">{tt("coaSideDebit", "차변")}</SelectItem>
                    <SelectItem value="credit">{tt("coaSideCredit", "대변")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">{tt("coaFieldCoaClass", "태국 FS 분류(1~5)")}</Label>
              <Select value={form.coaClass || "__none__"} onValueChange={(v) => setForm((p) => ({ ...p, coaClass: v === "__none__" ? "" : v }))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tt("coaUnset", "(없음)")}</SelectItem>
                  <SelectItem value="1">1 — {tt("coaClass1", "자산")}</SelectItem>
                  <SelectItem value="2">2 — {tt("coaClass2", "부채")}</SelectItem>
                  <SelectItem value="3">3 — {tt("coaClass3", "자본")}</SelectItem>
                  <SelectItem value="4">4 — {tt("coaClass4", "수익")}</SelectItem>
                  <SelectItem value="5">5 — {tt("coaClass5", "비용")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">{tt("coaFieldCoaClassHint", "RD 등 제출용 틀에 맞출 때 참고(선택).")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="coa-hdr" checked={form.isHeader} onCheckedChange={(c) => setForm((p) => ({ ...p, isHeader: Boolean(c) }))} />
              <Label htmlFor="coa-hdr" className="text-sm font-normal">
                {tt("coaFieldIsHeader", "헤더 계정(하위에만 분개 권장)")}
              </Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDlgOpen(false)} disabled={saving}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "…" : t("btn_save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
