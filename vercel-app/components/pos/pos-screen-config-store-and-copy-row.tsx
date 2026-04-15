"use client"

import * as React from "react"
import { RotateCw } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { PosScreenConfigActionBar } from "@/components/pos/pos-screen-config-action-bar"
import { PosScreenConfigCopyInline } from "@/components/pos/pos-screen-config-copy-blocks"
import { cn } from "@/lib/utils"

/**
 * 테이블 구성 탭과 동일한 한 줄: [매장] [새로고침] [다른 매장 복사] … [저장 슬롯]
 */
export function PosScreenConfigStoreAndCopyRow({
  canPickStore,
  stores,
  pickedStore,
  onPickedStoreChange,
  readOnlyStoreCode,
  effectiveStore,
  showCopy,
  copyVariant,
  tr,
  onRefresh,
  refreshLoading,
  betweenRefreshAndCopy,
  onCopySuccess,
  rightSlot,
}: {
  canPickStore: boolean
  stores: string[]
  pickedStore: string
  onPickedStoreChange: (v: string) => void
  readOnlyStoreCode?: string | null
  effectiveStore: string
  showCopy: boolean
  copyVariant: "menu" | "display" | "cooking" | "payment" | "delivery"
  tr: (key: string, fallback: string) => string
  /** 있으면 테이블 구성과 같이 새로고침 버튼 표시 */
  onRefresh?: () => void
  refreshLoading?: boolean
  /** 새로고침과 복사 사이(예: 배달앱「비활성 포함」) */
  betweenRefreshAndCopy?: React.ReactNode
  onCopySuccess?: () => void
  /** 오른쪽 끝(예: 녹색 저장). 메뉴 화면 구성은 터미널 내부 저장만 쓰면 비움 */
  rightSlot?: React.ReactNode
}) {
  const code = String(effectiveStore || "").trim()
  const storeList = canPickStore && stores.length > 0 ? stores : readOnlyStoreCode ? [String(readOnlyStoreCode)] : []
  const selectValue = canPickStore ? pickedStore || undefined : readOnlyStoreCode || code || undefined

  const left = (
    <>
      <Select
        value={selectValue}
        onValueChange={onPickedStoreChange}
        disabled={!canPickStore || storeList.length === 0}
      >
        <SelectTrigger className="h-10 w-40 font-mono text-sm tabular-nums">
          <SelectValue placeholder={tr("store", "매장")} />
        </SelectTrigger>
        <SelectContent>
          {storeList.map((s) => (
            <SelectItem key={s} value={s} className="font-mono text-sm tabular-nums">
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {onRefresh ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 gap-1.5"
          onClick={onRefresh}
          disabled={Boolean(refreshLoading)}
        >
          <RotateCw className={cn("h-4 w-4", refreshLoading && "animate-spin")} />
          {tr("posRefresh", "새로고침")}
        </Button>
      ) : null}
      {betweenRefreshAndCopy}
      {showCopy && code ? (
        <PosScreenConfigCopyInline
          variant={copyVariant}
          targetStoreCode={code}
          stores={stores}
          tr={tr}
          onCopySuccess={onCopySuccess}
        />
      ) : null}
    </>
  )

  return (
    <div className="space-y-2">
      <PosScreenConfigActionBar left={left} right={rightSlot} />
      {!code ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {tr(
            "posScreenConfigSelectStoreForSave",
            "적용할 매장을 먼저 선택해야 이 화면의 설정을 불러오고 저장할 수 있습니다."
          )}
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {tr(
            "posScreenConfigStoreRowHint",
            "선택한 매장에만 저장됩니다. 다른 매장과 동일하게 맞추려면 원본 매장을 고른 뒤 복사를 누르세요."
          )}
        </p>
      )}
    </div>
  )
}
