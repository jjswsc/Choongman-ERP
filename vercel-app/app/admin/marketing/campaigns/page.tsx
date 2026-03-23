"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Megaphone, Save, Plus, Trash2, RotateCw, Upload, Calculator, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getMarketingCampaigns,
  getMarketingCampaign,
  saveMarketingCampaign,
  deleteMarketingCampaign,
  importMarketingExcel,
  getMarketingCampaignResults,
  getMarketingCampaignCosts,
  type MarketingCampaign,
} from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { PromoSetSimulator } from "@/components/marketing/promo-set-simulator"

const FORMAT_OPTIONS = [
  { value: "Delivery", label: "Delivery" },
  { value: "Dine in", label: "Dine in" },
  { value: "Carry out", label: "Carry out" },
  { value: "Delivery & Dine in", label: "Delivery & Dine in" },
  { value: "Delivery, Carry out", label: "Delivery, Carry out" },
  { value: "Dine in, Carry out", label: "Dine in, Carry out" },
]

const STATUS_OPTIONS = [
  { value: "draft", label: "준비" },
  { value: "ongoing", label: "진행중" },
  { value: "finish", label: "완료" },
]

const KPI_UNIT_OPTIONS = [
  { value: "order", label: "주문" },
  { value: "coupon", label: "쿠폰" },
  { value: "member", label: "회원" },
]

const defaultForm = {
  topic: "",
  format: "",
  status: "draft",
  detail: "",
  startDate: "",
  endDate: "",
  branches: "" as string,
  discountType: "percent",
  discountValue: "",
  discountPricePromotion: "",
  costAdsOnline: "",
  costAdsOffline: "",
  costProduction: "",
  costFood: "",
  costInfluencer: "",
  budgetTotal: "",
  kpiTarget: "",
  kpiUnit: "order",
  campaignPerformance: "",
  conclusion: "",
}

export default function MarketingCampaignsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [list, setList] = React.useState<MarketingCampaign[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState(defaultForm)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [costResults, setCostResults] = React.useState<{
    bankCosts: number
    pettyCosts: number
    totalCosts: number
  } | null>(null)
  const [showSimulator, setShowSimulator] = React.useState(false)
  const [posResults, setPosResults] = React.useState<{
    dineInOrders: number
    deliveryOrders: number
    carryOutOrders: number
    totalOrders: number
    dineInSales: number
    deliverySales: number
    carryOutSales: number
    totalSales: number
  } | null>(null)

  const loadList = React.useCallback(() => {
    getMarketingCampaigns()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadList()
  }, [loadList])

  React.useEffect(() => {
    if (editingId) {
      setPosResults(null)
      setCostResults(null)
      getMarketingCampaign(editingId).then((c) => {
        if (c) {
          setForm({
            topic: c.topic ?? "",
            format: c.format ?? "",
            status: c.status ?? "draft",
            detail: c.detail ?? "",
            startDate: c.startDate ?? "",
            endDate: c.endDate ?? "",
            branches: Array.isArray(c.branches) ? c.branches.join("\n") : "",
            discountType: c.discountType ?? "percent",
            discountValue: String(c.discountValue ?? ""),
            discountPricePromotion: c.discountPricePromotion ?? "",
            costAdsOnline: String(c.costAdsOnline ?? ""),
            costAdsOffline: String(c.costAdsOffline ?? ""),
            costProduction: String(c.costProduction ?? ""),
            costFood: String(c.costFood ?? ""),
            costInfluencer: String(c.costInfluencer ?? ""),
            budgetTotal: String(c.budgetTotal ?? ""),
            kpiTarget: String(c.kpiTarget ?? ""),
            kpiUnit: c.kpiUnit ?? "order",
            campaignPerformance: c.campaignPerformance ?? "",
            conclusion: c.conclusion ?? "",
          })
        }
      })
    }
  }, [editingId])

  const handleNew = () => {
    setEditingId(null)
    setForm(defaultForm)
  }

  const handleEdit = (c: MarketingCampaign) => {
    setEditingId(c.id)
  }

  const handleCopyCampaign = (c: MarketingCampaign) => {
    getMarketingCampaign(c.id).then((detail) => {
      if (!detail) return
      setEditingId(null)
      setForm({
        topic: (detail.topic ?? "") + " (복사)",
        format: detail.format ?? "",
        status: "draft",
        detail: detail.detail ?? "",
        startDate: "",
        endDate: "",
        branches: Array.isArray(detail.branches) ? detail.branches.join("\n") : "",
        discountType: detail.discountType ?? "percent",
        discountValue: String(detail.discountValue ?? ""),
        discountPricePromotion: detail.discountPricePromotion ?? "",
        costAdsOnline: String(detail.costAdsOnline ?? ""),
        costAdsOffline: String(detail.costAdsOffline ?? ""),
        costProduction: String(detail.costProduction ?? ""),
        costFood: String(detail.costFood ?? ""),
        costInfluencer: String(detail.costInfluencer ?? ""),
        budgetTotal: String(detail.budgetTotal ?? ""),
        kpiTarget: String(detail.kpiTarget ?? ""),
        kpiUnit: detail.kpiUnit ?? "order",
        campaignPerformance: "",
        conclusion: "",
      })
    })
  }

  const handleSave = async () => {
    const topic = form.topic.trim()
    if (!topic) {
      await appAlert(t("required") || "캠페인 제목을 입력하세요.")
      return
    }

    const branches = form.branches
      .split(/[\n,;]/)
      .map((x) => x.trim())
      .filter(Boolean)

    setSaving(true)
    try {
      const res = await saveMarketingCampaign({
        id: editingId ?? undefined,
        topic,
        format: form.format.trim(),
        status: form.status,
        detail: form.detail.trim(),
        startDate: form.startDate.trim() || null,
        endDate: form.endDate.trim() || null,
        branches,
        discountType: form.discountType,
        discountValue: Number(form.discountValue) || 0,
        discountPricePromotion: form.discountPricePromotion.trim(),
        costAdsOnline: Number(form.costAdsOnline) || 0,
        costAdsOffline: Number(form.costAdsOffline) || 0,
        costProduction: Number(form.costProduction) || 0,
        costFood: Number(form.costFood) || 0,
        costInfluencer: Number(form.costInfluencer) || 0,
        budgetTotal: Number(form.budgetTotal) || 0,
        kpiTarget: Number(form.kpiTarget) || 0,
        kpiUnit: form.kpiUnit,
        campaignPerformance: form.campaignPerformance.trim(),
        conclusion: form.conclusion.trim(),
      })
      if (res.success) {
        await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
        loadList()
        handleNew()
      } else {
        await appAlert(res.message)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: MarketingCampaign) => {
    if (!await appConfirm(`"${c.topic}" ${t("posMenuConfirmDelete") || "삭제하시겠습니까?"}`)) return
    const res = await deleteMarketingCampaign({ id: c.id })
    if (res.success) {
      loadList()
      if (editingId === c.id) handleNew()
    } else {
      await appAlert(res.message)
    }
  }

  const handleLoadCosts = async () => {
    if (!editingId) return
    const res = await getMarketingCampaignCosts(editingId)
    if (res.success && res.totalCosts != null) {
      setCostResults({
        bankCosts: res.bankCosts ?? 0,
        pettyCosts: res.pettyCosts ?? 0,
        totalCosts: res.totalCosts ?? 0,
      })
    } else {
      setCostResults(null)
      if (!res.success) await appAlert(res.message || "비용 데이터를 불러올 수 없습니다.")
    }
  }

  const handleLoadPosResults = async () => {
    if (!editingId) return
    const res = await getMarketingCampaignResults({ campaignId: editingId })
    if (res.success && res.totalOrders != null) {
      setPosResults({
        dineInOrders: res.dineInOrders ?? 0,
        deliveryOrders: res.deliveryOrders ?? 0,
        carryOutOrders: res.carryOutOrders ?? 0,
        totalOrders: res.totalOrders ?? 0,
        dineInSales: res.dineInSales ?? 0,
        deliverySales: res.deliverySales ?? 0,
        carryOutSales: res.carryOutSales ?? 0,
        totalSales: res.totalSales ?? 0,
      })
    } else {
      setPosResults(null)
      await appAlert(res.message || "데이터를 불러올 수 없습니다.")
    }
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const res = await importMarketingExcel(file)
      if (res.success) {
        await appAlert(res.message || "가져오기 완료")
        loadList()
      } else {
        await appAlert(res.message || "가져오기 실패")
      }
    } catch (err) {
      await appAlert("가져오기 실패: " + String(err))
    } finally {
      setImporting(false)
      e.target.value = ""
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("adminMarketingCampaigns") || "캠페인"}
            </h1>
            <p className="text-xs text-muted-foreground">
              마케팅 캠페인 등록 및 관리
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={loadList} disabled={loading}>
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {t("posRefresh") || "새로고침"}
          </Button>
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={handleNew}>
            <Plus className="h-4 w-4" />
            추가
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleExcelImport}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className={cn("h-4 w-4", importing && "animate-pulse")} />
            {importing ? "가져오는 중..." : (t("adminMarketingExcelImport") || "엑셀 가져오기")}
          </Button>
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => setShowSimulator(true)}>
            <Calculator className="h-4 w-4" />
            세트 시뮬레이터
          </Button>
        </div>
        {showSimulator && <PromoSetSimulator onClose={() => setShowSimulator(false)} />}

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="space-y-4">
          {(editingId !== null || form.topic) && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">
                {editingId ? "캠페인 수정" : "캠페인 등록"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">캠페인 제목 *</label>
                  <Input
                    value={form.topic}
                    onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                    placeholder="Rider MBK, Promotion : CM Set 2"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">형식</label>
                  <select
                    value={form.format}
                    onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    <option value="">선택</option>
                    {FORMAT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">상태</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">기간 시작</label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">기간 종료</label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">참여 지점 (줄바꿈 또는 쉼표 구분)</label>
                  <Textarea
                    value={form.branches}
                    onChange={(e) => setForm((f) => ({ ...f, branches: e.target.value }))}
                    placeholder="MBK&#10;Union Mall&#10;Seacon&#10;Silom"
                    className="mt-1 min-h-[60px]"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">할인 유형</label>
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant={form.discountType === "percent" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, discountType: "percent" }))}
                    >
                      %
                    </Button>
                    <Button
                      type="button"
                      variant={form.discountType === "amount" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, discountType: "amount" }))}
                    >
                      ฿
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">할인 값</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.discountValue}
                    onChange={(e) => setForm((f) => ({ ...f, discountValue: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">KPI 목표</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.kpiTarget}
                    onChange={(e) => setForm((f) => ({ ...f, kpiTarget: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">KPI 단위</label>
                  <select
                    value={form.kpiUnit}
                    onChange={(e) => setForm((f) => ({ ...f, kpiUnit: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {KPI_UNIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">총 예산 (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.budgetTotal}
                    onChange={(e) => setForm((f) => ({ ...f, budgetTotal: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">광고 온라인 (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.costAdsOnline}
                    onChange={(e) => setForm((f) => ({ ...f, costAdsOnline: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">광고 오프라인 (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.costAdsOffline}
                    onChange={(e) => setForm((f) => ({ ...f, costAdsOffline: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">제작비 (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.costProduction}
                    onChange={(e) => setForm((f) => ({ ...f, costProduction: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">식품비 (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.costFood}
                    onChange={(e) => setForm((f) => ({ ...f, costFood: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">인플루언서 (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={form.costInfluencer}
                    onChange={(e) => setForm((f) => ({ ...f, costInfluencer: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">상세 설명</label>
                  <Textarea
                    value={form.detail}
                    onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
                    placeholder="캠페인 상세 내용"
                    className="mt-1 min-h-[80px]"
                    rows={3}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">{t("adminMarketingConclusionLabel") || "결론/평가"}</label>
                  <Input
                    value={form.conclusion}
                    onChange={(e) => setForm((f) => ({ ...f, conclusion: e.target.value }))}
                    placeholder={t("adminMarketingConclusionPlaceholder") || "ได้ผล / ไม่ได้ผล ไม่คุ้มค่า"}
                    className="mt-1"
                  />
                </div>
                {editingId && (
                  <div className="sm:col-span-2 rounded-lg border border-dashed p-3">
                    <label className="text-xs font-medium text-muted-foreground">POS 실적</label>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleLoadPosResults}>
                        POS 실적 조회
                      </Button>
                    </div>
                    <div className="mt-2">
                      <Button variant="outline" size="sm" onClick={handleLoadCosts}>
                        실제 비용 조회
                      </Button>
                      {costResults && (
                        <div className="mt-2 flex flex-wrap gap-2 text-sm">
                          <span>통장: ฿{costResults.bankCosts.toLocaleString()}</span>
                          <span>Petty: ฿{costResults.pettyCosts.toLocaleString()}</span>
                          <span className="font-semibold">합계: ฿{costResults.totalCosts.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                    {posResults && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                        <div className="rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">매장 주문</span>
                          <div className="font-semibold">{posResults.dineInOrders}건</div>
                          <div className="text-xs">฿{posResults.dineInSales.toLocaleString()}</div>
                        </div>
                        <div className="rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">배달 주문</span>
                          <div className="font-semibold">{posResults.deliveryOrders}건</div>
                          <div className="text-xs">฿{posResults.deliverySales.toLocaleString()}</div>
                        </div>
                        <div className="rounded bg-muted/50 px-2 py-1">
                          <span className="text-muted-foreground">포장 주문</span>
                          <div className="font-semibold">{posResults.carryOutOrders}건</div>
                          <div className="text-xs">฿{posResults.carryOutSales.toLocaleString()}</div>
                        </div>
                        <div className="rounded bg-primary/10 px-2 py-1">
                          <span className="text-muted-foreground">합계</span>
                          <div className="font-semibold">{posResults.totalOrders}건</div>
                          <div className="text-xs">฿{posResults.totalSales.toLocaleString()}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "..." : t("itemsBtnSave") || "저장"}
                </Button>
                <Button variant="outline" onClick={handleNew}>
                  {t("posCancel") || "취소"}
                </Button>
              </div>
            </div>
          )}

          <div className="rounded-xl border bg-card">
            <h3 className="border-b px-4 py-3 text-sm font-semibold">캠페인 목록</h3>
            <div className="divide-y overflow-x-auto">
              {list.length === 0 && !loading && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  등록된 캠페인이 없습니다.
                </p>
              )}
              {list.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 px-4 py-3",
                    editingId === c.id && "bg-primary/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{c.topic}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0 text-xs text-muted-foreground">
                      {c.format && <span>{c.format}</span>}
                      {(c.startDate || c.endDate) && (
                        <span>{c.startDate || "~"} ~ {c.endDate || "~"}</span>
                      )}
                      {c.branches?.length > 0 && <span>{c.branches.slice(0, 2).join(", ")}{c.branches.length > 2 ? "..." : ""}</span>}
                      {c.kpiTarget > 0 && <span>KPI: {c.kpiTarget} {c.kpiUnit}</span>}
                      {c.budgetTotal > 0 && <span>예산: ฿{c.budgetTotal.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleCopyCampaign(c)} title="템플릿 복사">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(c)}>
                      {t("posEdit") || "수정"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
