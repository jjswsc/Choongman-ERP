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
import { useStoreView, filterNonOfficeStores } from "@/lib/store-view-context"
import { useIsMobile } from "@/hooks/use-mobile"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

/**
 * 모바일에서 오피스 직원(관리자 포함)에게만 상단 매장 선택 바 표시.
 * 매장 직원은 이 컴포넌트가 아무것도 렌더링하지 않음.
 */
export function MobileStoreSelectorBar() {
  const isMobile = useIsMobile()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const { viewStore, setViewStore } = useStoreView()

  const isOfficeStaff =
    auth &&
    (isOfficeRole(auth.role || "") || isOfficeStore(auth.store || ""))

  const storeOptions = React.useMemo(
    () => filterNonOfficeStores(stores),
    [stores]
  )

  // 목록 있으면 선택 없을 때 첫 매장을 기본값으로
  React.useEffect(() => {
    if (storeOptions.length > 0 && !viewStore) {
      setViewStore(storeOptions[0])
    }
  }, [storeOptions, viewStore, setViewStore])

  if (!isMobile || !isOfficeStaff) return null
  if (storeOptions.length === 0) return null

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5 md:hidden">
      <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
      <Select
        value={viewStore ?? storeOptions[0]}
        onValueChange={setViewStore}
      >
        <SelectTrigger className="h-9 flex-1 min-w-0 max-w-[200px] text-sm">
          <SelectValue placeholder={t("store")} />
        </SelectTrigger>
        <SelectContent>
          {storeOptions.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
