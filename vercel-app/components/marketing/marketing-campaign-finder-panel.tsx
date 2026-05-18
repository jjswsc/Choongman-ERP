"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import { ChevronDown, ChevronUp, Filter, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getMarketingCampaigns, useStoreList, type MarketingCampaign } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  applyMarketingCampaignListFilters,
  emptyMarketingCampaignHubLinkSets,
  type CampaignListSearchScope,
  type MarketingCampaignHubLinkSets,
} from "@/lib/marketing-campaign-list-query"
import { fetchMarketingCampaignHubLinkSets } from "@/lib/marketing-campaign-hub-link-data"
import { CAMPAIGN_TYPE_OPTIONS, KPI_UNIT_OPTIONS } from "@/lib/marketing-campaign-type-utils"
import type { CampaignHubLinkFilterValue } from "@/lib/marketing-campaign-filters"
import { getCampaignTypeLabel } from "@/lib/marketing-campaign-type-utils"
import { getBangkokRolling30DayRangeYmd } from "@/lib/collab-overview-period"

export type MarketingCampaignFinderPanelProps = {
  value: string
  onChange: (campaignId: string) => void
  /** 주입 시 캠페인 목록 API를 다시 호출하지 않음 */
  campaigns?: MarketingCampaign[] | null
  /** 이 화면에 맞는 연동 영역 기본값 */
  defaultHubLinkFilter?: CampaignHubLinkFilterValue
  /** true면 허브 연동 필터 UI를 숨기고 조건 없이 표시(부모가 이미 범위를 한정한 경우) */
  hideHubLinkFilter?: boolean
  /** 필터·검색 적용 후 목록이 바뀔 때마다 알림(하단 카드 등과 동기화) */
  onFilteredCampaignsChange?: (rows: MarketingCampaign[]) => void
  allowEmpty?: boolean
  emptyOptionLabel?: string
  maxListHeightClass?: string
  className?: string
  /** 부모 새로고침(목록 재로드) — 검색 버튼 처리 후 캠페인 prop이 갱신될 때까지 대기하려면 Promise 반환 */
  onRefresh?: () => void | Promise<void>
  disabled?: boolean
  /** 등록 화면 등: 제목·기간·검색·필터를 한 줄(줄바꿈) 툴바로 압축 */
  toolbarLayout?: "default" | "compact"
  /** compact 툴바일 때 맨 앞 열 — 제목과 검색·기간 입력 하단선 맞춤 */
  compactToolbarTitle?: React.ReactNode
  /** compact 툴바 같은 줄 오른쪽(캠페인 허브 링크 등) */
  compactToolbarEnd?: React.ReactNode
}

export function MarketingCampaignFinderPanel({
  value,
  onChange,
  campaigns: campaignsProp,
  defaultHubLinkFilter = "",
  hideHubLinkFilter = false,
  onFilteredCampaignsChange,
  allowEmpty = false,
  emptyOptionLabel,
  maxListHeightClass = "max-h-72",
  className,
  onRefresh,
  disabled = false,
  toolbarLayout = "default",
  compactToolbarTitle: _compactToolbarTitle,
  compactToolbarEnd,
}: MarketingCampaignFinderPanelProps) {
  const isCompactToolbar = toolbarLayout === "compact"
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, loading: storesLoading } = useStoreList()

  const tr = React.useCallback(
    (ko: string, en: string, th: string) => {
      if (lang === "en") return en
      if (lang === "th") return th
      if (lang === "ko") return ko
      return en
    },
    [lang]
  )

  const statusLabel = React.useCallback(
    (s: string) => {
      switch (s) {
        case "draft":
          return tr("준비", "Draft", "เตรียมการ")
        case "ongoing":
          return tr("진행중", "Ongoing", "กำลังดำเนินการ")
        case "finish":
          return tr("완료", "Done", "เสร็จสิ้น")
        default:
          return s
      }
    },
    [tr]
  )

  const [campaignsInternal, setCampaignsInternal] = React.useState<MarketingCampaign[]>([])
  const [hubLinkSets, setHubLinkSets] = React.useState<MarketingCampaignHubLinkSets>(() =>
    emptyMarketingCampaignHubLinkSets()
  )
  const [dataLoading, setDataLoading] = React.useState(true)

  /** 입력창(초안) — 적용은 「검색」 클릭 시 listSearchQuery로 반영 */
  const [listSearchDraft, setListSearchDraft] = React.useState("")
  /** 필터에 실제로 쓰이는 검색어 */
  const [listSearchQuery, setListSearchQuery] = React.useState("")
  const [listSearchScope, setListSearchScope] = React.useState<CampaignListSearchScope>("all")
  const [listFiltersOpen, setListFiltersOpen] = React.useState(false)
  const [listPeriodFrom, setListPeriodFrom] = React.useState(() => getBangkokRolling30DayRangeYmd().from)
  const [listPeriodTo, setListPeriodTo] = React.useState(() => getBangkokRolling30DayRangeYmd().to)
  const [listDesignFrom, setListDesignFrom] = React.useState("")
  const [listDesignTo, setListDesignTo] = React.useState("")
  const [listCampaignTypeFilter, setListCampaignTypeFilter] = React.useState("")
  const [listStatusDraft, setListStatusDraft] = React.useState(true)
  const [listStatusOngoing, setListStatusOngoing] = React.useState(true)
  const [listStatusFinish, setListStatusFinish] = React.useState(true)
  const [listBranchFilter, setListBranchFilter] = React.useState("")
  const [listHubLinkFilter, setListHubLinkFilter] = React.useState(() => String(defaultHubLinkFilter ?? ""))
  const [listBudgetMin, setListBudgetMin] = React.useState("")
  const [listBudgetMax, setListBudgetMax] = React.useState("")
  const [listKpiMin, setListKpiMin] = React.useState("")
  const [listKpiMax, setListKpiMax] = React.useState("")
  const [listKpiUnitFilter, setListKpiUnitFilter] = React.useState("")
  const [listDiscountFilter, setListDiscountFilter] = React.useState<"any" | "none" | "percent" | "amount">("any")

  const campaignsSource = campaignsProp ?? campaignsInternal

  const reloadData = React.useCallback(async () => {
    setDataLoading(true)
    try {
      const sets = await fetchMarketingCampaignHubLinkSets()
      setHubLinkSets(sets)
      if (campaignsProp == null) {
        const c = await getMarketingCampaigns()
        setCampaignsInternal(Array.isArray(c) ? c : [])
      }
    } catch {
      setHubLinkSets(emptyMarketingCampaignHubLinkSets())
      if (campaignsProp == null) setCampaignsInternal([])
    } finally {
      setDataLoading(false)
    }
  }, [campaignsProp])

  React.useEffect(() => {
    void reloadData()
  }, [reloadData])

  React.useEffect(() => {
    if (campaignsProp != null) setCampaignsInternal(campaignsProp)
  }, [campaignsProp])

  const effectiveHubLinkFilter = hideHubLinkFilter ? "" : listHubLinkFilter

  const filterParams = React.useMemo(
    () => ({
      listSearch: listSearchQuery,
      listSearchScope,
      listPeriodFrom,
      listPeriodTo,
      listDesignFrom,
      listDesignTo,
      listCampaignTypeFilter,
      listStatusDraft,
      listStatusOngoing,
      listStatusFinish,
      listBranchFilter,
      listHubLinkFilter: effectiveHubLinkFilter,
      listBudgetMin,
      listBudgetMax,
      listKpiMin,
      listKpiMax,
      listKpiUnitFilter,
      listDiscountFilter,
      lang,
      statusLabel,
    }),
    [
      listSearchQuery,
      listSearchScope,
      listPeriodFrom,
      listPeriodTo,
      listDesignFrom,
      listDesignTo,
      listCampaignTypeFilter,
      listStatusDraft,
      listStatusOngoing,
      listStatusFinish,
      listBranchFilter,
      effectiveHubLinkFilter,
      listBudgetMin,
      listBudgetMax,
      listKpiMin,
      listKpiMax,
      listKpiUnitFilter,
      listDiscountFilter,
      lang,
      statusLabel,
    ]
  )

  const filteredList = React.useMemo(
    () => applyMarketingCampaignListFilters(campaignsSource, hubLinkSets, filterParams),
    [campaignsSource, hubLinkSets, filterParams]
  )

  React.useEffect(() => {
    onFilteredCampaignsChange?.(filteredList)
  }, [filteredList, onFilteredCampaignsChange])

  React.useEffect(() => {
    setListHubLinkFilter(String(defaultHubLinkFilter ?? ""))
  }, [defaultHubLinkFilter])

  const selectedCampaign = React.useMemo(() => {
    const id = value.trim()
    if (!id) return undefined
    return campaignsSource.find((c) => c.id === id)
  }, [campaignsSource, value])

  const emptyLabel =
    emptyOptionLabel ??
    tr("캠페인 미선택", "No campaign", "ไม่เลือกแคมเปญ")

  const runSearch = React.useCallback(async () => {
    const q = listSearchDraft.trim()
    // await reloadData() 전에 검색어가 반드시 반영되도록 동기 플러시 (부모 campaigns prop과 함께 쓸 때 필터가 빈 키워드로 한 번 도는 문제 방지)
    flushSync(() => {
      setListSearchQuery(q)
    })
    await reloadData()
    await Promise.resolve(onRefresh?.())
  }, [listSearchDraft, reloadData, onRefresh])

  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      <div
        className={cn(
          "border-b",
          isCompactToolbar ? "px-2 py-2 sm:px-3" : "flex flex-col gap-3 px-3 py-3 sm:px-4",
        )}
      >
        {!isCompactToolbar && (
          <h3 className="text-sm font-semibold">{tr("캠페인 찾기", "Find campaign", "ค้นหาแคมเปญ")}</h3>
        )}

        <div
          className={cn(
            "flex w-full min-w-0 flex-wrap items-end gap-x-2 gap-y-2 rounded-lg border border-border/70 bg-muted/10 px-2 py-2 sm:px-3",
            isCompactToolbar &&
              "flex-nowrap gap-x-2 gap-y-0 overflow-x-auto overflow-y-visible border-dashed border-border/60 bg-muted/5 px-2 py-2 sm:gap-x-2 sm:px-3 sm:py-2",
          )}
        >
          <div className="flex shrink-0 flex-col gap-0.5">
            <span
              className={cn(
                "font-medium leading-none text-muted-foreground whitespace-nowrap text-[9px]",
                isCompactToolbar && "text-[10px] sm:text-xs",
              )}
            >
              {tr("조회 기간", "Period", "ช่วงวันที่")}
            </span>
            <div className={cn("flex min-w-0 items-center gap-1", isCompactToolbar && "gap-1")}>
              <Input
                type="date"
                title={tr("시작", "From", "เริ่ม")}
                className="h-8 w-[8.65rem] shrink-0 px-1.5 text-xs"
                disabled={disabled}
                value={listPeriodFrom}
                onChange={(e) => setListPeriodFrom(e.target.value)}
              />
              <span className="shrink-0 pb-0.5 text-[10px] text-muted-foreground sm:text-xs">~</span>
              <Input
                type="date"
                title={tr("종료", "To", "ถึง")}
                className="h-8 w-[8.65rem] shrink-0 px-1.5 text-xs"
                disabled={disabled}
                value={listPeriodTo}
                onChange={(e) => setListPeriodTo(e.target.value)}
              />
            </div>
          </div>
          <div
            className={cn(
              "flex min-w-[6.5rem] max-w-[9.5rem] flex-col gap-0.5 sm:min-w-[7.5rem]",
              isCompactToolbar && "w-[7.25rem] max-w-none shrink-0 sm:w-[8rem]",
            )}
          >
            <Label
              className={cn(
                "font-medium leading-none text-muted-foreground text-[9px]",
                isCompactToolbar && "text-[10px] sm:text-xs",
              )}
            >
              {tr("검색 범위", "Search in", "ค้นหาใน")}
            </Label>
            <select
              value={listSearchScope}
              disabled={disabled}
              onChange={(e) => setListSearchScope(e.target.value as CampaignListSearchScope)}
              className={cn(
                "h-8 w-full rounded-md border border-input bg-background px-1.5 text-[11px]",
                isCompactToolbar && "px-2 text-xs sm:text-sm",
              )}
            >
              <option value="all">{tr("전체 필드", "All fields", "ทุกฟิลด์")}</option>
              <option value="topic">{tr("제목만", "Title only", "ชื่ออย่างเดียว")}</option>
              <option value="campaignNo">{tr("캠페인 번호만", "Campaign no. only", "เฉพาะเลขแคมเปญ")}</option>
              <option value="format">{tr("채널/형식만", "Format only", "เฉพาะรูปแบบ")}</option>
              <option value="audience_promo">
                {tr("지점·대상·프로모", "Branch, audience, promo", "สาขา กลุ่มเป้า โปร")}
              </option>
            </select>
          </div>
          <div
            className={cn(
              "flex min-w-[5.5rem] max-w-[9rem] flex-col gap-0.5",
              isCompactToolbar && "w-[6.75rem] max-w-[9rem] shrink-0 sm:w-[7.25rem]",
            )}
          >
            <Label
              className={cn(
                "font-medium leading-none text-muted-foreground text-[9px]",
                isCompactToolbar && "text-[10px] sm:text-xs",
              )}
            >
              {tr("매장", "Store", "สาขา")}
            </Label>
            <select
              value={listBranchFilter || "_all"}
              disabled={disabled || storesLoading}
              onChange={(e) => setListBranchFilter(e.target.value === "_all" ? "" : e.target.value)}
              className={cn(
                "h-8 w-full rounded-md border border-input bg-background px-1.5 text-[11px] disabled:opacity-60",
                isCompactToolbar && "px-2 text-xs sm:text-sm",
              )}
            >
              <option value="_all">{tr("전체", "All", "ทั้งหมด")}</option>
              <option value="_allStoresPlan">{tr("전체 매장(기획)만", "All stores (plan) only", "เฉพาะทุกสาขา (แผน)")}</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div
            className={cn(
              "relative min-w-[8rem] flex-1 basis-[10rem]",
              isCompactToolbar && "min-w-[9rem] flex-1 basis-0",
            )}
          >
            <Label className="sr-only">{tr("검색", "Search", "ค้นหา")}</Label>
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground sm:left-2.5" />
            <Input
              value={listSearchDraft}
              disabled={disabled}
              onChange={(e) => setListSearchDraft(e.target.value)}
              placeholder={tr("키워드 입력 후 검색", "Enter keywords, then Search", "พิมพ์คำค้น แล้วกดค้นหา")}
              className={cn("h-8 min-w-0 pl-8 text-xs", isCompactToolbar && "pl-9 text-sm sm:pl-10")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void runSearch()
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            className={cn(
              "h-8 shrink-0 gap-1 px-2.5 text-xs",
              isCompactToolbar && "shrink-0 px-2.5 text-xs sm:px-3",
            )}
            disabled={disabled || dataLoading}
            onClick={() => void runSearch()}
          >
            {dataLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {t("search")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-8 shrink-0 gap-1 px-2.5 text-xs",
              isCompactToolbar && "shrink-0 px-2.5 text-xs sm:px-3",
            )}
            disabled={disabled}
            onClick={() => setListFiltersOpen((o) => !o)}
          >
            <Filter className="h-3.5 w-3.5" />
            {tr("필터", "Filters", "ตัวกรอง")}
            {listFiltersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          {isCompactToolbar && compactToolbarEnd != null ? (
            <div className="ms-auto flex shrink-0 flex-wrap items-center gap-2">{compactToolbarEnd}</div>
          ) : null}
        </div>

        {listFiltersOpen && (
          <div className="space-y-3 rounded-lg border border-dashed bg-muted/20 px-3 py-3">
            <div className="space-y-1.5 border-b border-border/60 pb-3">
              <p className="text-xs font-medium text-foreground">{t("marketingCampaignFinderPrepPeriodLabel")}</p>
              <p className="text-[10px] leading-relaxed text-muted-foreground">{t("marketingCampaignFinderPrepPeriodHint")}</p>
              <div className="flex flex-wrap gap-2">
                <div className="min-w-[9rem] flex-1 space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{tr("시작", "From", "เริ่ม")}</Label>
                  <Input
                    type="date"
                    className="h-9"
                    disabled={disabled}
                    value={listDesignFrom}
                    onChange={(e) => setListDesignFrom(e.target.value)}
                  />
                </div>
                <div className="min-w-[9rem] flex-1 space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{tr("종료", "To", "ถึง")}</Label>
                  <Input
                    type="date"
                    className="h-9"
                    disabled={disabled}
                    value={listDesignTo}
                    onChange={(e) => setListDesignTo(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {t("marketingCampaignFinderDesignOverlapHint")}
              </p>
            </div>

            <div
              className={cn(
                "grid gap-3 sm:grid-cols-2 lg:items-end",
                hideHubLinkFilter ? "lg:grid-cols-1" : "lg:grid-cols-2",
              )}
            >
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("캠페인 유형", "Campaign type", "ประเภทแคมเปญ")}</Label>
                <select
                  value={listCampaignTypeFilter || "_all"}
                  disabled={disabled}
                  onChange={(e) => setListCampaignTypeFilter(e.target.value === "_all" ? "" : e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="_all">{tr("전체", "All", "ทั้งหมด")}</option>
                  {CAMPAIGN_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {lang === "en" ? o.en : lang === "th" ? o.th : o.ko}
                    </option>
                  ))}
                </select>
              </div>
              {!hideHubLinkFilter && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("marketingCampaignListHubLinkLabel")}</Label>
                  <select
                    value={listHubLinkFilter || "_all"}
                    disabled={disabled}
                    onChange={(e) => setListHubLinkFilter(e.target.value === "_all" ? "" : e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="_all">{tr("전체", "All", "ทั้งหมด")}</option>
                    <option value="collab">{t("marketingCampaignListHubLinkCollab")}</option>
                    <option value="promo_set">{t("marketingCampaignListHubLinkPromoSet")}</option>
                    <option value="ads_roas">{t("marketingCampaignListHubLinkAdsRoas")}</option>
                    <option value="influencer">{t("marketingCampaignListHubLinkInfluencer")}</option>
                    <option value="materials">{t("marketingCampaignListHubLinkMaterials")}</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border/60 pt-3">
              <span className="w-full text-xs font-medium text-foreground sm:w-auto">{tr("상태", "Status", "สถานะ")}</span>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={listStatusDraft}
                  disabled={disabled}
                  onCheckedChange={(v) => setListStatusDraft(v === true)}
                />
                {statusLabel("draft")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={listStatusOngoing}
                  disabled={disabled}
                  onCheckedChange={(v) => setListStatusOngoing(v === true)}
                />
                {statusLabel("ongoing")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={listStatusFinish}
                  disabled={disabled}
                  onCheckedChange={(v) => setListStatusFinish(v === true)}
                />
                {statusLabel("finish")}
              </label>
            </div>

            <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("예산 최소 (฿)", "Budget min (฿)", "งบขั้นต่ำ (฿)")}</Label>
                <Input
                  className="h-9"
                  inputMode="decimal"
                  disabled={disabled}
                  value={listBudgetMin}
                  onChange={(e) => setListBudgetMin(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("예산 최대 (฿)", "Budget max (฿)", "งบสูงสุด (฿)")}</Label>
                <Input
                  className="h-9"
                  inputMode="decimal"
                  disabled={disabled}
                  value={listBudgetMax}
                  onChange={(e) => setListBudgetMax(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("KPI 목표 최소", "KPI target min", "KPI ขั้นต่ำ")}</Label>
                <Input
                  className="h-9"
                  inputMode="decimal"
                  disabled={disabled}
                  value={listKpiMin}
                  onChange={(e) => setListKpiMin(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("KPI 목표 최대", "KPI target max", "KPI สูงสุด")}</Label>
                <Input
                  className="h-9"
                  inputMode="decimal"
                  disabled={disabled}
                  value={listKpiMax}
                  onChange={(e) => setListKpiMax(e.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("KPI 단위", "KPI unit", "หน่วย KPI")}</Label>
                <select
                  value={listKpiUnitFilter || "_any"}
                  disabled={disabled}
                  onChange={(e) => setListKpiUnitFilter(e.target.value === "_any" ? "" : e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="_any">{tr("전체", "All", "ทั้งหมด")}</option>
                  {KPI_UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{tr("기획 할인", "Planned discount", "ส่วนลดที่วางแผน")}</Label>
                <select
                  value={listDiscountFilter}
                  disabled={disabled}
                  onChange={(e) => setListDiscountFilter(e.target.value as "any" | "none" | "percent" | "amount")}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="any">{tr("제한 없음", "Any", "ไม่กรอง")}</option>
                  <option value="none">{tr("할인 없음", "No discount", "ไม่มีส่วนลด")}</option>
                  <option value="percent">{tr("퍼센트 할인", "Percent off", "ส่วนลด %")}</option>
                  <option value="amount">{tr("금액 할인", "Amount off", "ส่วนลดเงิน")}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {value.trim() && selectedCampaign && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="min-w-0">
              <span className="text-muted-foreground">{tr("선택됨", "Selected", "เลือกแล้ว")}: </span>
              <span className="font-medium">
                {selectedCampaign.campaignNo ? `[${selectedCampaign.campaignNo}] ` : ""}
                {selectedCampaign.topic}
              </span>
            </div>
            {allowEmpty && (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange("")}>
                {tr("선택 해제", "Clear", "ล้าง")}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border/60">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/25 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-medium">{tr("캠페인 목록", "Campaign list", "รายการแคมเปญ")}</span>
          {!dataLoading && (
            <span>
              {filteredList.length}
              {tr("건", "", " รายการ")}
            </span>
          )}
        </div>
        <div className={cn("divide-y overflow-y-auto overflow-x-hidden", maxListHeightClass)}>
        {dataLoading && (
          <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {tr("불러오는 중…", "Loading…", "กำลังโหลด…")}
          </div>
        )}
        {!dataLoading && allowEmpty && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange("")}
            className={cn(
              "flex w-full min-h-[3.25rem] flex-col items-start justify-center gap-0.5 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/50",
              !value.trim() && "bg-muted/40"
            )}
          >
            <span className="text-muted-foreground">{emptyLabel}</span>
          </button>
        )}
        {!dataLoading && filteredList.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {campaignsSource.length === 0
              ? tr("등록된 캠페인이 없습니다.", "No campaigns.", "ไม่มีแคมเปญ")
              : tr(
                  "필터·검색 조건에 맞는 캠페인이 없습니다.",
                  "No campaigns match filters or search.",
                  "ไม่มีแคมเปญที่ตรงกับตัวกรองหรือการค้นหา",
                )}
          </p>
        )}
        {!dataLoading &&
          filteredList.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(c.id)}
              className={cn(
                "flex w-full min-h-[3.5rem] flex-col items-start justify-center gap-1 px-3 py-3 text-left text-sm transition-colors hover:bg-muted/50",
                value === c.id && "bg-primary/10 ring-2 ring-inset ring-primary/30"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {c.campaignNo && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {c.campaignNo}
                  </span>
                )}
                <span className="font-medium">{c.topic}</span>
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/35 dark:text-blue-200">
                  {getCampaignTypeLabel(c.campaignType, lang)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    c.status === "ongoing"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : c.status === "finish"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-amber-100 text-amber-800"
                  )}
                >
                  {statusLabel(c.status)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                {c.format && <span>{c.format}</span>}
                {(c.startDate || c.endDate) && (
                  <span>
                    {c.startDate || "~"} ~ {c.endDate || "~"}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
