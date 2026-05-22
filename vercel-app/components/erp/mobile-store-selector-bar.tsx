"use client"

import * as React from "react"
import { Store } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import {
  useStoreView,
  filterNonOfficeStores,
  resolveDefaultViewStoreForOffice,
} from "@/lib/store-view-context"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

const ALL_STORE_VALUE = "All"

/**
 * 오피스 직원(관리자 포함)에게 상단 매장 선택 바 표시.
 * 매장 직원은 이 컴포넌트가 아무것도 렌더링하지 않음.
 * 모바일에서는 항상 표시, 데스크톱에서는 md 이하에서만 표시(md:hidden).
 */
export function MobileStoreSelectorBar() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const { viewStore, setViewStore } = useStoreView()

  const isOfficeStaff =
    auth &&
    (isOfficeRole(auth.role || "") || isOfficeStore(auth.store || ""))

  const storeOptions = React.useMemo(() => {
    const branches = filterNonOfficeStores(stores)
    return [ALL_STORE_VALUE, ...branches]
  }, [stores])

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

  if (!isOfficeStaff) return null
  if (storeOptions.length === 0) return null

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
      <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        value={viewStore ?? ALL_STORE_VALUE}
        onValueChange={setViewStore}
      >
        <SelectTrigger className="h-9 flex-1 min-w-0 max-w-[200px] text-sm">
          <SelectValue placeholder={t("store")} />
        </SelectTrigger>
        <SelectContent>
          {storeOptions.map((s) => (
            <SelectItem key={s} value={s}>
              {s === ALL_STORE_VALUE ? t("store_all_stores") : s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
