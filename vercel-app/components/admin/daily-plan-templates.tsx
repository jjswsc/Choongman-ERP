"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { appAlert, appConfirm } from "@/lib/app-message"
import { cn } from "@/lib/utils"
import {
  getRoutineTemplates,
  saveRoutineTemplate,
  useStoreList,
  type RoutineTemplateDto,
  type RoutineTemplateItemDto,
} from "@/lib/api-client"
import {
  DAILY_PLAN_CATEGORIES,
  DAILY_PLAN_LINK_TYPES,
  DAILY_PLAN_POSITIONS,
  DAILY_PLAN_ROLES,
  DAILY_PLAN_WORKDAY_MINUTES,
  ROUTINE_TEMPLATE_STATUSES,
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
  }
}

function blankTemplate(): RoutineTemplateDto {
  return {
    id: 0,
    name: "",
    roleScope: "supervisor",
    position: "all",
    storeName: "",
    status: "draft",
    version: 0,
    note: "",
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
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [edit, setEdit] = useState<RoutineTemplateDto | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getRoutineTemplates()
      setList(Array.isArray(res.list) ? res.list : [])
      setCanEdit(!!res.canEdit)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(
    () => list.filter((x) => showArchived || x.status !== "archived"),
    [list, showArchived]
  )

  const fixedMinutes = (tpl: RoutineTemplateDto) =>
    tpl.items.filter((i) => !i.perStore).reduce((s, i) => s + (Number(i.estMinutes) || 0), 0)
  const perStoreMinutes = (tpl: RoutineTemplateDto) =>
    tpl.items.filter((i) => i.perStore).reduce((s, i) => s + (Number(i.estMinutes) || 0), 0)

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
    setSaving(true)
    try {
      const res = await saveRoutineTemplate({
        id: edit.id || undefined,
        name: edit.name,
        roleScope: edit.roleScope,
        position: edit.position,
        storeName: edit.storeName,
        status: edit.status,
        note: edit.note,
        items: edit.items.filter((i) => i.title.trim()),
      })
      if (!res.success) {
        await appAlert(res.message || t("dp_save_fail"))
        return
      }
      await appAlert(t("dp_saved_ok"))
      setEdit(null)
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
      await appAlert(res.message || t("dp_save_fail"))
      return
    }
    setEdit(null)
    await load()
  }

  if (edit) {
    const fixed = fixedMinutes(edit)
    const per = perStoreMinutes(edit)
    return (
      <Card>
        <CardContent className="space-y-3 p-3">
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
              onChange={(e) => setEdit({ ...edit, roleScope: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm"
              disabled={!canEdit}
            >
              {DAILY_PLAN_ROLES.map((r) => (
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
            <select
              value={edit.storeName}
              onChange={(e) => setEdit({ ...edit, storeName: e.target.value })}
              className="h-9 rounded border bg-background px-2 text-sm lg:col-span-2"
              disabled={!canEdit}
            >
              <option value="">{t("dp_tpl_all_stores")}</option>
              {(storeList || [])
                .filter((s) => s && String(s).trim())
                .sort()
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            <Textarea
              value={edit.note}
              onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              placeholder={t("dp_tpl_note")}
              rows={1}
              className="lg:col-span-3"
              disabled={!canEdit}
            />
          </div>

          <p className={cn("text-xs", fixed + per > DAILY_PLAN_WORKDAY_MINUTES ? "text-red-600" : "text-muted-foreground")}>
            {t("dp_tpl_capacity")
              .replace("{fixed}", minutesLabel(fixed, t))
              .replace("{per}", minutesLabel(per, t))
              .replace("{cap}", minutesLabel(DAILY_PLAN_WORKDAY_MINUTES, t))}
          </p>

          <AdminTableScroll>
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-1">#</th>
                  <th className="p-1">{t("dp_col_time_slot")}</th>
                  <th className="p-1">{t("dp_col_block")}</th>
                  <th className="p-1">{t("dp_col_category")}</th>
                  <th className="p-1">{t("dp_col_title")}</th>
                  <th className="p-1">{t("dp_est_min")}</th>
                  <th className="p-1">{t("dp_col_weekdays")}</th>
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
                        placeholder="09:00"
                        className="h-8 w-16"
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="p-1">
                      <Input
                        value={it.block}
                        onChange={(e) => setItem(idx, { block: e.target.value })}
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
                        className="h-8 w-16"
                        disabled={!canEdit}
                      />
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
                {edit.id ? (
                  <Button variant="ghost" className="text-red-600" onClick={() => void archive()}>
                    {t("dp_tpl_archive")}
                  </Button>
                ) : null}
              </>
            ) : null}
            <Button variant="ghost" onClick={() => setEdit(null)}>
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
          <Button size="sm" onClick={() => setEdit(blankTemplate())}>
            <Plus className="mr-1 h-4 w-4" />
            {t("dp_tpl_new")}
          </Button>
        ) : null}
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("dp_tpl_show_archived")}
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("dp_tpl_hint")}</p>
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
                  {tpl.storeName ? ` · ${tpl.storeName}` : ""} · v{tpl.version}
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
