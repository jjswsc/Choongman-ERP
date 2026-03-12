"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Upload,
  Trash2,
  BarChart3,
  TrendingUp,
  Package,
  CreditCard,
  List,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosSalesImports,
  deletePosSalesImport,
  importPosSalesExcel,
  getPosSalesFilterOptions,
  getPosSalesByPeriod,
  getPosSalesByDeliveryApp,
  getPosSalesByChannel,
  getPosSalesByMenu,
  getPosSalesByPayment,
  type PosSalesImport,
} from "@/lib/api-client"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"

const PERIOD_GROUP = [
  { value: "month", label: "월별" },
  { value: "week", label: "주간별" },
  { value: "day", label: "일별" },
  { value: "dow", label: "요일별" },
] as const

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"]

function formatBath(n: number) {
  return `฿${(n ?? 0).toLocaleString()}`
}

export function SalesManagementTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const canEdit = isOfficeRole(auth?.role || "")
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [imports, setImports] = React.useState<PosSalesImport[]>([])
  const [selectedImportId, setSelectedImportId] = React.useState<string>("")
  const [posFilter, setPosFilter] = React.useState<string>("")
  const [posOptions, setPosOptions] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [periodGroup, setPeriodGroup] = React.useState<"month" | "week" | "day" | "dow">("day")
  const [menuSearch, setMenuSearch] = React.useState("")
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const [periodData, setPeriodData] = React.useState<
    { label: string; key: string; sales: number }[]
  >([])
  const [deliveryAppData, setDeliveryAppData] = React.useState<{
    items: { label: string; sales: number; pct: number }[]
    total: number
  }>({ items: [], total: 0 })
  const [channelData, setChannelData] = React.useState<{ label: string; sales: number }[]>([])
  const [menuData, setMenuData] = React.useState<{ name: string; qty: number; sales: number }[]>([])
  const [paymentData, setPaymentData] = React.useState<{ label: string; sales: number }[]>([])

  const loadImports = React.useCallback(() => {
    setLoading(true)
    getPosSalesImports()
      .then(setImports)
      .catch(() => setImports([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    loadImports()
  }, [loadImports])

  React.useEffect(() => {
    if (imports.length > 0 && !selectedImportId) {
      setSelectedImportId(imports[0].id)
    }
  }, [imports, selectedImportId])

  const loadPosOptions = React.useCallback(() => {
    if (!selectedImportId) return
    getPosSalesFilterOptions(selectedImportId).then((r) =>
      setPosOptions(r.posOptions || [])
    )
  }, [selectedImportId])

  React.useEffect(() => {
    loadPosOptions()
  }, [loadPosOptions])

  const loadPeriodData = React.useCallback(() => {
    if (!selectedImportId) return
    setLoading(true)
    getPosSalesByPeriod({
      importId: selectedImportId,
      groupBy: periodGroup,
      pos: posFilter || undefined,
    })
      .then(setPeriodData)
      .catch(() => setPeriodData([]))
      .finally(() => setLoading(false))
  }, [selectedImportId, periodGroup, posFilter])

  const loadDeliveryAppData = React.useCallback(() => {
    if (!selectedImportId) return
    getPosSalesByDeliveryApp({
      importId: selectedImportId,
      pos: posFilter || undefined,
    })
      .then(setDeliveryAppData)
      .catch(() => setDeliveryAppData({ items: [], total: 0 }))
  }, [selectedImportId, posFilter])

  const loadChannelData = React.useCallback(() => {
    if (!selectedImportId) return
    getPosSalesByChannel({
      importId: selectedImportId,
      pos: posFilter || undefined,
    })
      .then(setChannelData)
      .catch(() => setChannelData([]))
  }, [selectedImportId, posFilter])

  const loadMenuData = React.useCallback(() => {
    if (!selectedImportId) return
    getPosSalesByMenu({
      importId: selectedImportId,
      pos: posFilter || undefined,
      search: menuSearch || undefined,
    })
      .then(setMenuData)
      .catch(() => setMenuData([]))
  }, [selectedImportId, posFilter, menuSearch])

  const loadPaymentData = React.useCallback(() => {
    if (!selectedImportId) return
    getPosSalesByPayment({
      importId: selectedImportId,
      pos: posFilter || undefined,
    })
      .then(setPaymentData)
      .catch(() => setPaymentData([]))
  }, [selectedImportId, posFilter])

  const loadAllAnalytics = React.useCallback(() => {
    loadPeriodData()
    loadDeliveryAppData()
    loadChannelData()
    loadMenuData()
    loadPaymentData()
  }, [
    loadPeriodData,
    loadDeliveryAppData,
    loadChannelData,
    loadMenuData,
    loadPaymentData,
  ])

  React.useEffect(() => {
    if (selectedImportId) {
      loadPeriodData()
      loadDeliveryAppData()
      loadChannelData()
      loadPaymentData()
    } else {
      setPeriodData([])
      setDeliveryAppData({ items: [], total: 0 })
      setChannelData([])
      setMenuData([])
      setPaymentData([])
    }
  }, [selectedImportId, posFilter, loadPeriodData, loadDeliveryAppData, loadChannelData, loadPaymentData])

  React.useEffect(() => {
    if (selectedImportId) loadMenuData()
  }, [selectedImportId, posFilter, menuSearch, loadMenuData])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const res = await importPosSalesExcel(file)
      if (res.success) {
        alert(res.message || "업로드 완료")
        loadImports()
        if (res.importId) setSelectedImportId(res.importId)
      } else {
        alert(res.message || "업로드 실패")
      }
    } catch (err) {
      alert("업로드 실패: " + String(err))
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 업로드를 삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deletePosSalesImport(id)
      if (res.success) {
        loadImports()
        if (selectedImportId === id) setSelectedImportId("")
      } else {
        alert(res.message || "삭제 실패")
      }
    } finally {
      setDeletingId(null)
    }
  }

  const selectedImport = imports.find((i) => i.id === selectedImportId)
  const hasData = !!selectedImportId

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !canEdit}
              title={!canEdit ? "업로드는 오피스 직원만 가능합니다" : undefined}
            >
              <Upload className="h-4 w-4 mr-1" />
              {uploading ? "업로드 중..." : "엑셀 업로드"}
            </Button>
            <Select value={selectedImportId} onValueChange={setSelectedImportId}>
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="업로드 선택" />
              </SelectTrigger>
              <SelectContent>
                {imports.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.year_month || "?"} · {i.row_count?.toLocaleString()}건 · {formatBath(i.total_sales ?? 0)}
                  </SelectItem>
                ))}
                {imports.length === 0 && !loading && (
                  <SelectItem value="_none" disabled>
                    업로드 내역 없음
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {posOptions.length > 0 && (
              <Select
                value={posFilter === '' ? '__all__' : posFilter}
                onValueChange={(v) => setPosFilter(v === '__all__' ? '' : v)}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="매장(전체)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {posOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={loadAllAnalytics} disabled={!hasData}>
              새로고침
            </Button>
          </div>

          <Tabs defaultValue="imports" className="space-y-4">
            <TabsList className="flex flex-wrap gap-1">
              <TabsTrigger value="imports">
                <List className="h-3.5 w-3.5 mr-1" />
                업로드 내역
              </TabsTrigger>
              <TabsTrigger value="period">
                <BarChart3 className="h-3.5 w-3.5 mr-1" />
                기간별
              </TabsTrigger>
              <TabsTrigger value="delivery">
                <TrendingUp className="h-3.5 w-3.5 mr-1" />
                배달앱별
              </TabsTrigger>
              <TabsTrigger value="channel">채널상세</TabsTrigger>
              <TabsTrigger value="menu">
                <Package className="h-3.5 w-3.5 mr-1" />
                메뉴별
              </TabsTrigger>
              <TabsTrigger value="payment">
                <CreditCard className="h-3.5 w-3.5 mr-1" />
                결제수단별
              </TabsTrigger>
            </TabsList>

            <TabsContent value="imports">
              <div className="space-y-2">
                {imports.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <span>
                      {i.file_name || "?"} · {i.year_month} · {i.row_count?.toLocaleString()}건 · {formatBath(i.total_sales ?? 0)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(i.id)}
                      disabled={deletingId === i.id || !canEdit}
                      title={!canEdit ? "삭제는 오피스 직원만 가능합니다" : undefined}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {imports.length === 0 && !loading && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    엑셀 파일을 업로드하면 내역이 표시됩니다.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="period">
              {!hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  업로드를 선택해 주세요.
                </p>
              ) : (
                <>
                  <div className="flex gap-2 mb-4">
                    {PERIOD_GROUP.map((g) => (
                      <Button
                        key={g.value}
                        size="sm"
                        variant={periodGroup === g.value ? "default" : "outline"}
                        onClick={() => setPeriodGroup(g.value)}
                      >
                        {g.label}
                      </Button>
                    ))}
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <Tooltip formatter={(v: number) => [formatBath(v), "매출"]} />
                        <Bar dataKey="sales" fill="#3b82f6" name="매출" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-sm mt-4">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">기간</th>
                        <th className="py-2 text-right">매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodData.map((r) => (
                        <tr key={r.key} className="border-b">
                          <td className="py-1.5">{r.label}</td>
                          <td className="py-1.5 text-right font-mono">
                            {formatBath(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </TabsContent>

            <TabsContent value="delivery">
              {!hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  업로드를 선택해 주세요.
                </p>
              ) : deliveryAppData.items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  데이터 없음
                </p>
              ) : (
                <div className="flex flex-wrap gap-6">
                  <div className="h-[280px] w-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={deliveryAppData.items}
                          dataKey="sales"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ label, pct }) => `${label} ${pct.toFixed(1)}%`}
                        >
                          {deliveryAppData.items.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatBath(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-lg font-bold mb-2">
                      총 매출 {formatBath(deliveryAppData.total)}
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="py-2 text-left">배달앱/채널</th>
                          <th className="py-2 text-right">매출</th>
                          <th className="py-2 text-right">비율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveryAppData.items.map((r) => (
                          <tr key={r.label} className="border-b">
                            <td className="py-1.5">{r.label}</td>
                            <td className="py-1.5 text-right font-mono">
                              {formatBath(r.sales)}
                            </td>
                            <td className="py-1.5 text-right text-muted-foreground">
                              {r.pct.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="channel">
              {!hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  업로드를 선택해 주세요.
                </p>
              ) : (
                <>
                  <div className="h-[300px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelData} layout="vertical" margin={{ left: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                        <YAxis dataKey="label" type="category" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [formatBath(v), "매출"]} />
                        <Bar dataKey="sales" fill="#22c55e" name="매출" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 text-left">채널</th>
                      <th className="py-2 text-right">매출</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelData.slice(0, 30).map((r) => (
                      <tr key={r.label} className="border-b">
                        <td className="py-1.5">{r.label}</td>
                        <td className="py-1.5 text-right font-mono">
                          {formatBath(r.sales)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </TabsContent>

            <TabsContent value="menu">
              {!hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  업로드를 선택해 주세요.
                </p>
              ) : (
                <>
                  <div className="mb-4">
                    <Input
                      placeholder="메뉴 검색"
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left">메뉴</th>
                        <th className="py-2 text-right">수량</th>
                        <th className="py-2 text-right">매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuData.slice(0, 100).map((r) => (
                        <tr key={r.name} className="border-b">
                          <td className="py-1.5">{r.name}</td>
                          <td className="py-1.5 text-right font-mono">
                            {r.qty.toLocaleString()}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {formatBath(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {menuData.length > 100 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      상위 100개만 표시
                    </p>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="payment">
              {!hasData ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  업로드를 선택해 주세요.
                </p>
              ) : paymentData.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  데이터 없음
                </p>
              ) : (
                <div className="flex flex-wrap gap-6">
                  <div className="h-[260px] w-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentData}
                          dataKey="sales"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                        >
                          {paymentData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatBath(v)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-2 text-left pr-4">결제수단</th>
                        <th className="py-2 text-right">매출</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentData.map((r) => (
                        <tr key={r.label} className="border-b">
                          <td className="py-1.5 pr-4">{r.label}</td>
                          <td className="py-1.5 text-right font-mono">
                            {formatBath(r.sales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
