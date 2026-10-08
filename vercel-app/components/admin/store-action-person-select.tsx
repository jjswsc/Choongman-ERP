"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getStoreActionAssignees, type StoreActionAssignee } from "@/lib/api-client"

const MANUAL = "__manual__"

const cache = new Map<string, Promise<StoreActionAssignee[]>>()

function loadAssignees(store: string): Promise<StoreActionAssignee[]> {
  const key = store || "__hq__"
  let p = cache.get(key)
  if (!p) {
    p = getStoreActionAssignees(store).catch(() => [])
    cache.set(key, p)
  }
  return p
}

/** 담당자/재확인자 선택 — 매장 직원 + 본사·슈퍼바이저. 목록에 없으면 직접 입력 */
export function StoreActionPersonSelect(props: {
  store: string
  name: string
  userId?: string
  onChange: (next: { name: string; userId: string }) => void
  t: (k: string) => string
  /** 재확인자 선택 시 본사·슈퍼바이저를 먼저 보여 줌 */
  preferHq?: boolean
  disabled?: boolean
}) {
  const { store, name, userId, onChange, t, preferHq, disabled } = props
  const [list, setList] = useState<StoreActionAssignee[]>([])
  const [manual, setManual] = useState(false)

  useEffect(() => {
    let alive = true
    void loadAssignees(store).then((rows) => {
      if (alive) setList(rows)
    })
    return () => {
      alive = false
    }
  }, [store])

  const selected = useMemo(() => {
    if (userId) {
      const byId = list.find((e) => String(e.id) === String(userId))
      if (byId) return String(byId.id)
    }
    const byName = list.find((e) => e.name.toLowerCase() === name.trim().toLowerCase())
    return byName ? String(byName.id) : ""
  }, [list, userId, name])

  const storeGroup = list.filter((e) => e.group === "store")
  const hqGroup = list.filter((e) => e.group === "hq")
  const groups = preferHq
    ? [
        { key: "hq", label: t("action_person_group_hq"), rows: hqGroup },
        { key: "store", label: t("action_person_group_store"), rows: storeGroup },
      ]
    : [
        { key: "store", label: t("action_person_group_store"), rows: storeGroup },
        { key: "hq", label: t("action_person_group_hq"), rows: hqGroup },
      ]

  if (manual || (list.length === 0 && name)) {
    return (
      <div className="flex gap-1">
        <Input
          value={name}
          disabled={disabled}
          onChange={(e) => onChange({ name: e.target.value, userId: "" })}
          className="h-9 text-xs"
        />
        {list.length > 0 ? (
          <button
            type="button"
            className="shrink-0 text-[11px] text-blue-600 underline"
            onClick={() => setManual(false)}
          >
            {t("action_person_pick")}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <Select
      value={selected || undefined}
      disabled={disabled}
      onValueChange={(v) => {
        if (v === MANUAL) {
          setManual(true)
          return
        }
        const e = list.find((x) => String(x.id) === v)
        if (e) onChange({ name: e.name, userId: String(e.id) })
      }}
    >
      <SelectTrigger className="h-9 text-xs">
        <SelectValue placeholder={name || t("action_person_ph")} />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) =>
          g.rows.length ? (
            <SelectGroup key={g.key}>
              <SelectLabel className="text-[11px]">{g.label}</SelectLabel>
              {g.rows.map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name}
                  {e.nick ? ` (${e.nick})` : ""}
                  <span className="text-muted-foreground">
                    {" "}
                    · {[e.job, g.key === "hq" ? e.store : ""].filter(Boolean).join(" · ")}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null
        )}
        <SelectItem value={MANUAL}>{t("action_person_manual")}</SelectItem>
      </SelectContent>
    </Select>
  )
}
