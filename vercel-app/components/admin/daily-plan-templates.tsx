"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import {
  copyRoutineTemplate,
  getDailyPlanBoard,
  getRoutineTemplates,
  saveRoutineTemplate,
  useStoreList,
  type DailyPlanCandidate,
  type RoutineTemplateDto,
  type RoutineTemplateItemDto,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  DAILY_PLAN_CATEGORIES,
  DAILY_PLAN_LINK_TYPES,
  DAILY_PLAN_POSITIONS,
  DAILY_PLAN_ROLES,
  DAILY_PLAN_WORKDAY_MINUTES,
  ROUTINE_TEMPLATE_STATUSES,
  diffPersonalAgainstSharedTemplate,
  mergeRoutineTemplatesForPlan,
  pickRoutineTemplatesForPlan,
  type DailyPlanRole,
  type RoutineTemplate,
} from "@/lib/daily-plan-generate"
import { dailyPlanLabelers, minutesLabel } from "@/lib/daily-plan-i18n"

type T = (k: string) => string

const WEEKDAYS = ["1", "2", "3", "4", "5", "6", "7"]

function blankItem(): RoutineTemplateItemDto {
  return {
    sortOrder: 0,
    timeSlot: "",
    block: "",
    category: "기타",
    title: "",
    description: "",
    estMinutes: 15,
    weekdays: "1234567",
    photoRequired: false,
    linkType: "none",
    perStore: false,
    employeeId: 0,
  }
}

function toRoutineTemplate(dto: RoutineTemplateDto): RoutineTemplate {
  return {
    id: dto.id,
    name: dto.name,
    roleScope: dto.roleScope,
    position: dto.position,
    storeName: dto.storeName,
    employeeId: Number(dto.employeeId || 0) || 0,
    status: dto.status,
    version: dto.version,
    note: dto.note,
    travelMinutes: dto.travelMinutes,
    updatedBy: dto.updatedBy,
    updatedAt: dto.updatedAt,
    items: (dto.items || []).map((it) => ({
      ...it,
      employeeId: Number(it.employeeId || 0) || 0,
    })),
  }
}

function blankTemplate(
  roleScope: DailyPlanRole = "supervisor",
  opts: { storeName?: string; employeeId?: number } = {}
): RoutineTemplateDto {
  return {
    id: 0,
    name: "",
    roleScope,
    position: "all",
    storeName: opts.storeName || "",
    employeeId: opts.employeeId || 0,
    status: "draft",
    version: 0,
    note: "",
    travelMinutes: 30,
    updatedBy: "",
    updatedAt: "",
    items: [blankItem()],
  }
}

export function DailyPlanTemplates({ t }: { t: T }) {
  const label = dailyPlanLabelers(t)
  const { stores: storeList } = useStoreList()
  const [list, setList] = useState<RoutineTemplateDto[]>([])
  const [canEdit, setCanEdit] = useState(false)
  const [canCopy, setCanCopy] = useState(false)
  const [storeLeadOnly, setStoreLeadOnly] = useState(false)
  const [allowedStores, setAllowedStores] = useState<string[]>([])
  const [candidates, setCandidates] = useState<DailyPlanCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [edit, setEdit] = useState<RoutineTemplateDto | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyStores, setCopyStores] = useState<string[]>([])
  const [copying, setCopying] = useState(false)

  const goBackToList = () => {
    setCopyOpen(false)
    setCopyStores([])
    setEdit(null)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = getBangkokTodayDateString()
      const [res, board] = await Promise.all([
        getRoutineTemplates(),
        getDailyPlanBoard(today, { candidates: true }).catch(() => null),
      ])
      setList(
        (Array.isArray(res.list) ? res.list : []).map((x) => ({
          ...x,
          employeeId: Number(x.employeeId || 0) || 0,
          items: (x.items || []).map((it) => ({
            ...it,
            employeeId: Number(it.employeeId || 0) || 0,
          })),
        }))
      )
      setCanEdit(!!res.canEdit)
      setCanCopy(!!res.canCopy)
      setStoreLeadOnly(!!res.storeLeadOnly)
      setAllowedStores(Array.isArray(res.allowedStores) ? res.allowedStores : [])
      setCandidates(Array.isArray(board?.candidates) ? board!.candidates : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const roleFilterOptions = useMemo(
    () => (storeLeadOnly ? (["all", "manager", "staff"] as const) : (["all", ...DAILY_PLAN_ROLES] as const)),
    [storeLeadOnly]
  )

  const storeOptions = useMemo(() => {
    if (storeLeadOnly && allowedStores.length > 0) return [...allowedStores].sort()
    return (storeList || []).map((s) => String(s || "").trim()).filter(Boolean).sort()
  }, [storeLeadOnly, allowedStores, storeList])

  const employeeOptions = useMemo(() => {
    const storeSet = new Set(storeOptions.map((s) => s.toLowerCase()))
    return candidates
      .filter((c) => {
        if (storeLeadOnly && storeSet.size > 0 && !storeSet.has(String(c.store || "").trim().toLowerCase())) {
          return false
        }
        if (edit?.roleScope === "manager") return c.planRole === "manager"
        if (edit?.roleScope === "staff") return c.planRole === "staff"
        return c.planRole === "manager" || c.planRole === "staff"
      })
      .sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name))
  }, [candidates, storeOptions, storeLeadOnly, edit?.roleScope])

  const employeeNameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const c of candidates) m.set(c.id, c.name)
    return m
  }, [candidates])

  const visible = useMemo(
    () =>
      list.filter(
        (x) =>
          (showArchived || x.status !== "archived") &&
          (roleFilter === "all" || x.roleScope === roleFilter)
      ),
    [list, showArchived, roleFilter]
  )

  const fixedMinutes = (tpl: RoutineTemplateDto) =>
    tpl.items.filter((i) => !i.perStore).reduce((s, i) => s + (Number(i.estMinutes) || 0), 0)
  const perStoreMinutes = (tpl: RoutineTemplateDto) =>
    tpl.items.filter((i) => i.perStore).reduce((s, i) => s + (Number(i.estMinutes) || 0), 0)

  /** 개인 템플릿 편집 시 — 공통 템플릿과 항목 비교 */
  const personalDiff = useMemo(() => {
    if (!edit || !(Number(edit.employeeId) > 0)) return []
    const role = (["supervisor", "manager", "staff"].includes(edit.roleScope)
      ? edit.roleScope
      : "staff") as DailyPlanRole
    const sharedPool = list
      .filter((x) => !(Number(x.employeeId) > 0) && x.id !== edit.id)
      .map(toRoutineTemplate)
    const picked = pickRoutineTemplatesForPlan(sharedPool, {
      role,
      position: edit.position || "all",
      store: edit.storeName || "",
    })
    const shared = mergeRoutineTemplatesForPlan(picked)
    return diffPersonalAgainstSharedTemplate(toRoutineTemplate(edit), shared)
  }, [edit, list])

  const setItem = (idx: number, patch: Partial<RoutineTemplateItemDto>) =>
    setEdit((e) => (e ? { ...e, items: e.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) } : e))

  const moveItem = (idx: number, dir: -1 | 1) =>
    setEdit((e) => {
      if (!e) return e
      const j = idx + dir
      if (j < 0 || j >= e.items.length) return e
      const items = [...e.items]
      ;[items[idx], items[j]] = [items[j], items[idx]]
      return { ...e, items }
    })

  const save = async () => {
    if (!edit) return
    if (!edit.name.trim()) {
      await appAlert(t("dp_tpl_name_required"))
      return
    }
    const titled = edit.items.filter((i) => i.title.trim())
    if (titled.length > 0 && titled.every((i) => !(Number(i.estMinutes) > 0))) {
      if (!(await appConfirm(t("dp_tpl_est_all_zero_confirm")))) return
    }
    setSaving(true)
    try {
      const res = await saveRoutineTemplate({
        id: edit.id || undefined,
        name: edit.name,
        roleScope: edit.roleScope,
        position: edit.position,
        storeName: edit.storeName,
        employeeId: Number(edit.employeeId || 0) || 0,
        status: edit.status,
        note: edit.note,
        travelMinutes: edit.travelMinutes,
        items: titled,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      await appAlert(t("dp_saved_ok"))
      goBackToList()
      await load()
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!edit?.id) return
    if (!(await appConfirm(t("dp_tpl_archive_confirm")))) return
    const res = await saveRoutineTemplate({ id: edit.id, deleteTemplate: true })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("dp_save_fail"))
      return
    }
    goBackToList()
    await load()
  }

  const openCopy = () => {
    if (!edit?.id) {
      void appAlert(t("dp_tpl_copy_need_id"))
      return
    }
    setCopyStores([])
    setCopyOpen(true)
  }

  const toggleCopyStore = (store: string) =>
    setCopyStores((prev) => (prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]))

  const runCopy = async () => {
    if (!edit?.id) return
    if (copyStores.length === 0) {
      await appAlert(t("dp_tpl_copy_pick"))
      return
    }
    setCopying(true)
    try {
      const res = await copyRoutineTemplate({ sourceId: edit.id, targetStoreNames: copyStores })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      const created = Number(res.created || 0)
      const skipped = Number(res.skipped || 0)
      if (created === 0) {
        await appAlert(t("dp_tpl_copy_none"))
      } else {
        await appAlert(
          t("dp_tpl_copy_done").replace("{created}", String(created)).replace("{skipped}", String(skipped))
        )
      }
      setCopyOpen(false)
      setCopyStores([])
      await load()
    } finally {
      setCopying(false)
    }
  }

  const copyTargetStores = useMemo(
    () =>
      (storeList || [])
        .map((s) => String(s || "").trim())
        .filter((s) => s && s !== (edit?.storeName || "").trim())
        .sort(),
    [storeList, edit?.storeName]
  )

  if (edit) {
    const fixed = fixedMinutes(edit)
    const per = perStoreMinutes(edit) + (edit.roleScope === "supervisor" ? Number(edit.travelMinutes) || 0 : 0)
    return (
      <Card>
        <CardContent className="space-y-3 p-3">
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={goBackToList}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("dp_back")}
            </Button>
            <p className="min-w-0 flex-1 truncate text-sm font-medium">
              {edit.name.trim() || t("dp_tpl_new")}
              <span className="ml-2 font-normal text-muted-foreground">
                · {label.role(edit.roleScope)} · {label.position(edit.position)}
              </span>
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              placeholder={t("dp_tpl_name")}
              className="h-9 lg:col-span-2"
              disabled={!canEdit}
            />
            <select
              value={edit.roleScope}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  roleScope: e.target.value,
                  employeeId: 0,
                })
              }
              className="h-9 rounded border bg-background px-2 text-sm"
              disabled={!canEdit || storeLeadOnly}
            >
              {(storeLeadOnly ? (["manager", "staff"] as const) : DAILY_PLAN_ROLES).map((r) => (
                <option key={r} value={r}>
                  {label.role(r)}
                </option>
              ))}
            </select>
            <select
              value={edit.position}
              onChange={(e) => setEdit({ ...edit, position: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm"
              disabled={!canEdit}
            >
              {DAILY_PLAN_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {label.position(p)}
                </option>
              ))}
            </select>
            <select
              value={edit.status}
              onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm"
              disabled={!canEdit}
            >
              {ROUTINE_TEMPLATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {label.templateStatus(s)}
                </option>
              ))}
            </select>
            <div className="space-y-1 lg:col-span-2">
              <select
                value={edit.storeName}
                onChange={(e) => setEdit({ ...edit, storeName: e.target.value, employeeId: 0 })}
                className="h-9 w-full rounded border bg-background px-2 text-sm"
                disabled={!canEdit || (storeLeadOnly && storeOptions.length <= 1)}
              >
                {!storeLeadOnly ? <option value="">{t("dp_tpl_all_stores")}</option> : null}
                {storeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {storeLeadOnly ? t("dp_tpl_store_hint_manager") : t("dp_tpl_store_hint")}
              </p>
            </div>
            <div className="space-y-1 lg:col-span-2">
              <select
                value={String(edit.employeeId || 0)}
                onChange={(e) => {
                  const eid = Math.floor(Number(e.target.value) || 0)
                  const hit = employeeOptions.find((c) => c.id === eid)
                  setEdit({
                    ...edit,
                    employeeId: eid > 0 ? eid : 0,
                    items:
                      eid > 0
                        ? edit.items.map((it) => ({ ...it, employeeId: 0 }))
                        : edit.items,
                    ...(hit
                      ? {
                          storeName: hit.store || edit.storeName,
                          roleScope: hit.planRole === "manager" ? "manager" : edit.roleScope === "supervisor" ? "staff" : edit.roleScope,
                        }
                      : {}),
                  })
                }}
                className="h-9 w-full rounded border bg-background px-2 text-sm"
                disabled={!canEdit || edit.roleScope === "supervisor"}
              >
                <option value="0">{t("dp_tpl_employee_all")}</option>
                {employeeOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.store ? ` · ${c.store}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{t("dp_tpl_employee_hint")}</p>
            </div>
            <Textarea
              value={edit.note}
              onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              placeholder={t("dp_tpl_note")}
              rows={1}
              className="lg:col-span-2"
              disabled={!canEdit}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="shrink-0">{t("dp_tpl_travel")}</span>
              <Input
                type="number"
                min={0}
                max={240}
                value={edit.travelMinutes}
                onChange={(e) => setEdit({ ...edit, travelMinutes: Math.max(0, Number(e.target.value) || 0) })}
                className="h-9 w-20"
                disabled={!canEdit}
              />
            </label>
          </div>

          <p className={cn("text-xs", fixed + per > DAILY_PLAN_WORKDAY_MINUTES ? "text-red-600" : "text-muted-foreground")}>
            {t("dp_tpl_capacity")
              .replace("{fixed}", minutesLabel(fixed, t))
              .replace("{per}", minutesLabel(per, t))
              .replace("{cap}", minutesLabel(DAILY_PLAN_WORKDAY_MINUTES, t))}
          </p>

          {Number(edit.employeeId) > 0 && personalDiff.length > 0 ? (
            <div className="rounded-md border bg-muted/20 p-2">
              <p className="mb-1 text-xs font-semibold">{t("dp_tpl_diff_title")}</p>
              <p className="mb-2 text-[11px] text-muted-foreground">{t("dp_tpl_diff_hint")}</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px]">
                {personalDiff.map((d) => (
                  <li key={`${d.kind}-${d.title}`} className="flex flex-wrap gap-x-2 gap-y-0.5">
                    <span
                      className={cn(
                        "rounded px-1 font-medium",
                        d.kind === "personal_only" && "bg-emerald-100 text-emerald-800",
                        d.kind === "shared_only" && "bg-amber-100 text-amber-900",
                        d.kind === "both_changed" && "bg-sky-100 text-sky-900",
                        d.kind === "both_same" && "bg-muted text-muted-foreground"
                      )}
                    >
                      {t(`dp_tpl_diff_${d.kind}`)}
                    </span>
                    <span className="font-medium">{d.title}</span>
                    {d.kind === "both_changed" ? (
                      <span className="text-muted-foreground">
                        {minutesLabel(Number(d.sharedEst) || 0, t)} → {minutesLabel(Number(d.personalEst) || 0, t)}
                      </span>
                    ) : null}
                    {d.kind === "shared_only" ? (
                      <span className="text-muted-foreground">{t("dp_tpl_diff_not_applied")}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AdminTableScroll>
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-1">#</th>
                  <th className="p-1">{t("dp_col_time_slot")}</th>
                  <th className="p-1">{t("dp_col_block")}</th>
                  <th className="p-1">{t("dp_col_category")}</th>
                  <th className="p-1">{t("dp_col_title")}</th>
                  <th className="p-1">{t("dp_est_min")}</th>
                  <th className="p-1">{t("dp_col_weekdays")}</th>
                  <th className="p-1">{t("dp_tpl_item_employee")}</th>
                  <th className="p-1">{t("dp_col_per_store")}</th>
                  <th className="p-1">📷</th>
                  <th className="p-1">{t("dp_col_link")}</th>
                  <th className="p-1" />
                </tr>
              </thead>
              <tbody>
                {edit.items.map((it, idx) => (
                  <tr key={idx} className="border-b align-top">
                    <td className="p-1 text-muted-foreground">{idx + 1}</td>
                    <td className="p-1">
                      <Input
                        value={it.timeSlot}
                        onChange={(e) => setItem(idx, { timeSlot: e.target.value })}
                        placeholder={t("dp_tpl_time_ph")}
                        className="h-8 w-[5.5rem]"
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        value={it.block}
                        onChange={(e) => setItem(idx, { block: e.target.value })}
                        placeholder={t("dp_tpl_block_ph")}
                        className="h-8 w-20"
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="p-1">
                      <select
                        value={it.category}
                        onChange={(e) => setItem(idx, { category: e.target.value })}
                        className="h-8 rounded border bg-background px-1"
                        disabled={!canEdit}
                      >
                        {DAILY_PLAN_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {label.category(c)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <Input
                        value={it.title}
                        onChange={(e) => setItem(idx, { title: e.target.value })}
                        className="h-8 min-w-[200px]"
                        disabled={!canEdit}
                      />
                      <Input
                        value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                        placeholder={t("dp_col_desc")}
                        className="mt-1 h-7 text-[11px]"
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        type="number"
                        min={0}
                        value={it.estMinutes}
                        onChange={(e) => setItem(idx, { estMinutes: Number(e.target.value) || 0 })}
                        className={cn("h-8 w-16", !(Number(it.estMinutes) > 0) && it.title.trim() ? "border-amber-500" : "")}
                        disabled={!canEdit}
                      />
                      {!(Number(it.estMinutes) > 0) && it.title.trim() ? (
                        <p className="mt-0.5 max-w-[7rem] text-[10px] leading-tight text-amber-700">{t("dp_tpl_est_zero_row")}</p>
                      ) : null}
                    </td>
                    <td className="p-1">
                      <div className="flex gap-0.5">
                        {WEEKDAYS.map((d) => {
                          const on = it.weekdays.includes(d)
                          return (
                            <button
                              key={d}
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                setItem(idx, {
                                  weekdays: on
                                    ? it.weekdays.replace(d, "")
                                    : WEEKDAYS.filter((w) => w === d || it.weekdays.includes(w)).join(""),
                                })
                              }
                              className={cn(
                                "h-6 w-6 rounded border text-[10px]",
                                on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground"
                              )}
                            >
                              {t(`dp_wd_${d}`)}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                    <td className="p-1">
                      <select
                        value={String(it.employeeId || 0)}
                        onChange={(e) => setItem(idx, { employeeId: Math.floor(Number(e.target.value) || 0) })}
                        className="h-8 max-w-[9rem] rounded border bg-background px-1"
                        disabled={!canEdit || Number(edit.employeeId) > 0}
                        title={
                          Number(edit.employeeId) > 0
                            ? t("dp_tpl_item_employee_locked")
                            : t("dp_tpl_item_employee_hint")
                        }
                      >
                        <option value="0">{t("dp_tpl_employee_all")}</option>
                        {employeeOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={it.perStore}
                        disabled={!canEdit}
                        onChange={(e) => setItem(idx, { perStore: e.target.checked })}
                      />
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        checked={it.photoRequired}
                        disabled={!canEdit}
                        onChange={(e) => setItem(idx, { photoRequired: e.target.checked })}
                      />
                    </td>
                    <td className="p-1">
                      <select
                        value={it.linkType}
                        onChange={(e) => setItem(idx, { linkType: e.target.value })}
                        className="h-8 rounded border bg-background px-1"
                        disabled={!canEdit}
                      >
                        {DAILY_PLAN_LINK_TYPES.map((l) => (
                          <option key={l} value={l}>
                            {label.link(l)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      {canEdit ? (
                        <div className="flex">
                          <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => moveItem(idx, -1)}>
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => moveItem(idx, 1)}>
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1"
                            onClick={() => setEdit({ ...edit, items: edit.items.filter((_, i) => i !== idx) })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableScroll>

          <p className="text-[11px] text-muted-foreground">{t("dp_tpl_per_store_hint")}</p>

          {copyOpen && canEdit && edit.id ? (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <p className="text-sm font-medium">{t("dp_tpl_copy_title")}</p>
              {copyTargetStores.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("dp_tpl_empty")}</p>
              ) : (
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {copyTargetStores.map((store) => {
                    const on = copyStores.includes(store)
                    return (
                      <label
                        key={store}
                        className={cn(
                          "flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs",
                          on ? "border-primary bg-primary/10" : "bg-background"
                        )}
                      >
                        <input type="checkbox" checked={on} onChange={() => toggleCopyStore(store)} />
                        {store}
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={copying || copyStores.length === 0} onClick={() => void runCopy()}>
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {t("dp_tpl_copy_btn")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={copying}
                  onClick={() => {
                    setCopyOpen(false)
                    setCopyStores([])
                  }}
                >
                  {t("dp_tpl_copy_cancel")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <>
                <Button variant="outline" onClick={() => setEdit({ ...edit, items: [...edit.items, blankItem()] })}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t("dp_tpl_add_item")}
                </Button>
                <Button disabled={saving} onClick={() => void save()}>
                  <Save className="mr-1 h-4 w-4" />
                  {t("dp_save")}
                </Button>
                {edit.id && canCopy ? (
                  <Button variant="outline" disabled={copying} onClick={openCopy}>
                    <Copy className="mr-1 h-4 w-4" />
                    {t("dp_tpl_copy")}
                  </Button>
                ) : null}
                {edit.id ? (
                  <Button variant="ghost" className="text-red-600" onClick={() => void archive()}>
                    {t("dp_tpl_archive")}
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button variant="ghost" onClick={goBackToList}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t("dp_back")}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <Button
            size="sm"
            onClick={() => {
              const role =
                roleFilter !== "all"
                  ? (roleFilter as DailyPlanRole)
                  : storeLeadOnly
                    ? "staff"
                    : "supervisor"
              setEdit(
                blankTemplate(role, {
                  storeName: storeLeadOnly ? allowedStores[0] || "" : "",
                })
              )
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("dp_tpl_new")}
          </Button>
        ) : null}
        <div className="flex gap-1">
          {roleFilterOptions.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={roleFilter === r ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setRoleFilter(r)}
            >
              {r === "all" ? t("dp_all") : label.role(r)}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("dp_tpl_show_archived")}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {storeLeadOnly ? t("dp_tpl_hint_manager") : t("dp_tpl_hint")}
      </p>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">{loading ? t("loading") : t("dp_tpl_empty")}</p>
        ) : (
          visible.map((tpl) => (
            <Card
              key={tpl.id}
              className={cn(
                "cursor-pointer border-l-4 hover:bg-muted/30",
                tpl.status === "active"
                  ? "border-l-emerald-500"
                  : tpl.status === "pilot"
                    ? "border-l-blue-500"
                    : "border-l-slate-300"
              )}
              onClick={() => setEdit({ ...tpl, items: tpl.items.length ? tpl.items : [blankItem()] })}
            >
              <CardContent className="space-y-1 p-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{tpl.name}</p>
                  <span className="ml-auto rounded bg-muted px-1.5 text-[10px]">{label.templateStatus(tpl.status)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {label.role(tpl.roleScope)} · {label.position(tpl.position)}
                  {tpl.storeName ? ` · ${tpl.storeName}` : ""}
                  {tpl.employeeId
                    ? ` · ${employeeNameById.get(tpl.employeeId) || t("dp_tpl_employee_one").replace("{id}", String(tpl.employeeId))}`
                    : ""}{" "}
                  · v{tpl.version}
                </p>
                <p className="text-xs">
                  {t("dp_tpl_items_n").replace("{n}", String(tpl.items.length))} · {minutesLabel(fixedMinutes(tpl), t)}
                  {perStoreMinutes(tpl) > 0 ? ` + ${minutesLabel(perStoreMinutes(tpl), t)} × ${t("dp_per_store_short")}` : ""}
                </p>
                {tpl.note ? <p className="line-clamp-2 text-[11px] text-muted-foreground">{tpl.note}</p> : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
