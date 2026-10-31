"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import {
  useStoreView,
  filterOperationalStorePickerOptions,
  resolveDefaultViewStoreForOffice,
} from "@/lib/store-view-context"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"

const ALL_STORE_VALUE = "All"

/**
 * 오피스 직원(관리자 포함)에게 상단 매장 검색·선택 바 표시.
 * 한 칸에서 매장 선택(칩) + 텍스트 검색/필터를 같이 쓴다. (나란히 두면 모바일에서 좁음)
 * 매장 직원은 이 컴포넌트가 아무것도 렌더링하지 않음.
 */
export function MobileStoreSelectorBar() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, formatStoreLabel } = useStoreList()
  const { viewStore, setViewStore, storePickerQuery, setStorePickerQuery } = useStoreView()

  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const listId = React.useId()

  const isOfficeStaff =
    auth &&
    (isOfficeRole(auth.role || "") || isOfficeStore(auth.store || ""))

  const branchOptions = React.useMemo(
    () => filterOperationalStorePickerOptions(stores),
    [stores]
  )

  const selectedValue = viewStore ?? ALL_STORE_VALUE
  const storeLocked = selectedValue !== ALL_STORE_VALUE
  const selectedLabel = storeLocked ? formatStoreLabel(selectedValue) : ""

  const filteredOptions = React.useMemo(() => {
    const q = storePickerQuery.trim().toLowerCase()
    const allLabel = String(t("store_all_stores") || "").toLowerCase()
    const branches = !q
      ? branchOptions
      : branchOptions.filter((s) => {
          const label = formatStoreLabel(s).toLowerCase()
          return s.toLowerCase().includes(q) || label.includes(q)
        })
    const showAll =
      !q || ALL_STORE_VALUE.toLowerCase().includes(q) || allLabel.includes(q)
    return showAll ? [ALL_STORE_VALUE, ...branches] : branches
  }, [branchOptions, formatStoreLabel, storePickerQuery, t])

  /** 오피스 직원: 기본「전체 매장」— 본사(Office) 단일 조회는 대시보드에서 쓰지 않음 */
  React.useEffect(() => {
    if (!isOfficeStaff) return
    const v = String(viewStore || "").trim()
    if (!v || isOfficeStore(v)) {
      setViewStore(ALL_STORE_VALUE)
      return
    }
    if (viewStore) return
    setViewStore(resolveDefaultViewStoreForOffice(stores, auth?.store) ?? ALL_STORE_VALUE)
  }, [stores, viewStore, setViewStore, auth?.store, isOfficeStaff])

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const pickStore = React.useCallback(
    (s: string) => {
      setViewStore(s)
      setStorePickerQuery("")
      setOpen(false)
      inputRef.current?.blur()
    },
    [setViewStore, setStorePickerQuery]
  )

  if (!isOfficeStaff) return null
  if (branchOptions.length === 0) return null

  const searchPh =
    t("dp_search_person") || t("salesStoreSearch") || "ค้นหาชื่อ/สาขา"
  const showClearQuery = storePickerQuery.trim().length > 0

  return (
    <div
      ref={rootRef}
      className="sticky top-0 z-40 border-b bg-muted/50 px-4 py-2.5"
    >
      <div className="relative">
        <div
          className={cn(
            "flex min-h-10 w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 shadow-xs",
            open && "border-ring ring-ring/50 ring-[3px]"
          )}
          onClick={() => inputRef.current?.focus()}
        >
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          {storeLocked ? (
            <button
              type="button"
              className="inline-flex max-w-[46%] shrink-0 items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
              title={selectedLabel}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                pickStore(ALL_STORE_VALUE)
              }}
            >
              <span className="truncate">{selectedLabel}</span>
              <X className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              <span className="sr-only">{t("store_all_stores")}</span>
            </button>
          ) : null}
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            enterKeyHint="search"
            value={storePickerQuery}
            placeholder={searchPh}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setOpen(true)
              setStorePickerQuery(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false)
                inputRef.current?.blur()
              }
              if (e.key === "Enter" && filteredOptions.length === 1) {
                e.preventDefault()
                pickStore(filteredOptions[0]!)
              }
              if (e.key === "Backspace" && !storePickerQuery && storeLocked) {
                pickStore(ALL_STORE_VALUE)
              }
            }}
            className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
          {showClearQuery ? (
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation()
                setStorePickerQuery("")
                inputRef.current?.focus()
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {open ? (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 z-50 mt-1 max-h-[min(60vh,320px)] overflow-y-auto rounded-md border bg-background py-1 shadow-lg"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {t("salesStorePickerEmpty") || "—"}
              </div>
            ) : (
              filteredOptions.map((s) => {
                const label =
                  s === ALL_STORE_VALUE ? t("store_all_stores") : formatStoreLabel(s)
                const active = s === selectedValue
                return (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-center px-3 py-2.5 text-left text-sm hover:bg-accent",
                      active && "bg-accent/60 font-medium"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickStore(s)}
                  >
                    {label}
                  </button>
                )
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
