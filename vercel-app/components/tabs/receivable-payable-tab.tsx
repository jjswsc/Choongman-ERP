"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Search, Plus, Wallet, Building2, Printer, FileSpreadsheet, ChevronRight } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isManagerOrFranchiseeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { getVendorsForPurchase } from "@/lib/api-client"
import {
  getReceivablePayableList,
  getReceivablePayableSummary,
  addBalanceTransaction,
  type ReceivablePayableItem,
  type ReceivablePayableSummaryItem,
} from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export function ReceivablePayableTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { stores: storeList } = useStoreList()
  const [vendors, setVendors] = React.useState<{ code: string; name: string }[]>([])

  const isManager = isManagerOrFranchiseeRole(auth?.role || "")
  const managerStore = (auth?.store || "").trim()

  const [tab, setTab] = React.useState<"receivable" | "payable">("receivable")
  const [storeFilter, setStoreFilter] = React.useState(() =>
    isManager && managerStore ? managerStore : "All"
  )
  const [vendorFilter, setVendorFilter] = React.useState("All")
  const [startStr, setStartStr] = React.useState(todayStr)
  const [endStr, setEndStr] = React.useState(todayStr)
  const [listData, setListData] = React.useState<ReceivablePayableItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [subTab, setSubTab] = React.useState<"summary" | "detail">("summary")
  const [summaryData, setSummaryData] = React.useState<ReceivablePayableSummaryItem[]>([])
  const [summaryLoading, setSummaryLoading] = React.useState(false)

  const [addAmount, setAddAmount] = React.useState("")
  const [addDate, setAddDate] = React.useState(todayStr)
  const [addMemo, setAddMemo] = React.useState("")
  const [addEntity, setAddEntity] = React.useState("")
  const [addSaving, setAddSaving] = React.useState(false)

  React.useEffect(() => {
    getVendorsForPurchase().then((rows) => setVendors(rows || []))
  }, [])

  // 매니저: storeFilter를 자기 매장으로 고정
  React.useEffect(() => {
    if (isManager && managerStore) {
      setStoreFilter(managerStore)
    }
  }, [isManager, managerStore])

  // 매니저 + receivable 탭: 수령 입력 시 자기 매장 자동 선택
  React.useEffect(() => {
    if (tab === "receivable" && isManager && managerStore && !addEntity) {
      setAddEntity(managerStore)
    }
  }, [tab, isManager, managerStore])

  // 매니저: 미지급금 탭 접근 불가 → receivable로 고정
  React.useEffect(() => {
    if (isManager && tab === "payable") setTab("receivable")
  }, [isManager, tab])

  // 미수금/미지급금 탭 전환 시 요약으로
  React.useEffect(() => {
    setSubTab("summary")
  }, [tab])

  const loadList = React.useCallback(() => {
    setLoading(true)
    getReceivablePayableList({
      type: tab,
      storeFilter: tab === "receivable" && storeFilter !== "All" ? storeFilter : undefined,
      vendorFilter: tab === "payable" && vendorFilter !== "All" ? vendorFilter : undefined,
      startStr,
      endStr,
      userStore: auth?.store || undefined,
      userRole: auth?.role || undefined,
    })
      .then((r) => setListData(r.list || []))
      .catch(() => setListData([]))
      .finally(() => setLoading(false))
  }, [tab, storeFilter, vendorFilter, startStr, endStr, auth?.store, auth?.role])

  React.useEffect(() => {
    loadList()
  }, [loadList])

  const loadSummary = React.useCallback(() => {
    setSummaryLoading(true)
    getReceivablePayableSummary({
      type: tab,
      userStore: auth?.store || undefined,
      userRole: auth?.role || undefined,
    })
      .then((r) => setSummaryData(r.list || []))
      .catch(() => setSummaryData([]))
      .finally(() => setSummaryLoading(false))
  }, [tab, auth?.store, auth?.role])

  React.useEffect(() => {
    if (subTab === "summary") loadSummary()
  }, [subTab, loadSummary])

  const handleViewDetail = (entityKey: string) => {
    if (tab === "receivable") setStoreFilter(entityKey)
    else setVendorFilter(entityKey)
    setSubTab("detail")
  }

  const handleAdd = async () => {
    const amount = Number(addAmount?.replace(/,/g, ""))
    if (!amount || amount <= 0) {
      alert(t("pettyAlertAmount") || "금액을 입력해 주세요.")
      return
    }
    if (!addEntity?.trim()) {
      alert(tab === "receivable" ? "매출처를 선택해 주세요." : "매입처를 선택해 주세요.")
      return
    }
    setAddSaving(true)
    try {
      const res = await addBalanceTransaction({
        type: tab,
        storeName: tab === "receivable" ? addEntity : undefined,
        vendorCode: tab === "payable" ? addEntity : undefined,
        amount,
        transDate: addDate,
        memo: addMemo || undefined,
        userStore: auth?.store || undefined,
        userRole: auth?.role || undefined,
      })
      if (res.success) {
        setAddAmount("")
        setAddMemo("")
        loadList()
      } else {
        alert(translateApiMessage(res.message, t) || res.message)
      }
    } catch (e) {
      alert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAddSaving(false)
    }
  }

  const receivableStores = tab === "receivable"
    ? (isManager && managerStore ? [managerStore] : (storeList || []))
    : []

  const escapeXml = (s: string) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

  const handlePrint = () => {
    const hasSummary = subTab === "summary" && summaryData.length > 0
    const hasDetail = subTab === "detail" && listData.length > 0
    if (!hasSummary && !hasDetail) return
    const area = document.getElementById("receivable-payable-print-area")
    if (!area) return
    const style = document.createElement("style")
    style.id = "receivable-payable-print-style"
    style.textContent = `@media print {
      body * { visibility: hidden; }
      #receivable-payable-print-area, #receivable-payable-print-area * { visibility: visible; }
      #receivable-payable-print-area { position: absolute; left: 0; top: 0; width: 100%; display: block !important; }
      .print\\:hidden { display: none !important; }
    }`
    document.head.appendChild(style)
    window.print()
    document.getElementById("receivable-payable-print-style")?.remove()
  }

  const handleExcelForSummary = () => {
    if (summaryData.length === 0) return
    const isRec = tab === "receivable"
    const entityCol = isRec ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")
    const rows: string[][] = [[entityCol, t("amount") || "금액", t("receivPayCount") || "건수"]]
    for (const item of summaryData) {
      const name = isRec ? (item.storeName ?? "") : (vendors.find((v) => v.code === item.vendorCode)?.name || item.vendorCode ?? "")
      rows.push([name, String(item.balance ?? 0), String(item.count ?? 0)])
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td,th{border:1px solid #333;padding:4px 8px;font-size:11px}th{font-weight:bold;background:#e8e8e8}table{border-collapse:collapse;width:100%}</style></head>
<body>
<table>
<tr>${rows[0].map((c) => `<th>${escapeXml(c)}</th>`).join("")}</tr>
${rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${tab}_summary_${todayStr()}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExcel = () => {
    if (listData.length === 0) return
    const isRec = tab === "receivable"
    const entityCol = isRec ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")
    const typeOrder = isRec ? "주문" : "발주"
    const typeReceive = isRec ? "수령" : "지급"
    const rows: string[][] = [[entityCol, t("date") || "날짜", t("type") || "구분", t("amount") || "금액", t("memo") || "메모"]]
    for (const item of listData) {
      const name = isRec ? (item.storeName ?? "") : (vendors.find((v) => v.code === item.vendorCode)?.name || item.vendorCode ?? "")
      const typeLabel = (ref: string) => (ref === (isRec ? "Order" : "PO") ? typeOrder : typeReceive)
      for (const row of item.items || []) {
        rows.push([
          name,
          row.trans_date || "-",
          typeLabel(row.ref_type || ""),
          String(row.amount ?? 0),
          row.memo || "",
        ])
      }
    }
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td,th{border:1px solid #333;padding:4px 8px;font-size:11px}th{font-weight:bold;background:#e8e8e8}table{border-collapse:collapse;width:100%}</style></head>
<body>
<table>
<tr>${rows[0].map((c) => `<th>${escapeXml(c)}</th>`).join("")}</tr>
${rows.slice(1).map((row) => `<tr>${row.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${tab}_${startStr}_${endStr}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const isRec = tab === "receivable"
  const printTitle = isRec ? (t("receivableTab") || "미수금 (매출)") : (t("payableTab") || "미지급금 (매입)")
  const typeLabel = (ref: string) => (ref === (isRec ? "Order" : "PO") ? (isRec ? "주문" : "발주") : (isRec ? "수령" : "지급"))

  return (
    <div className="space-y-4">
      {/* 인쇄용 영역 (화면에는 숨김) */}
      <div id="receivable-payable-print-area" className="hidden print:block p-6">
        <h1 className="text-lg font-bold mb-2">{printTitle}</h1>
        {subTab === "summary" ? (
          <p className="text-sm text-muted-foreground mb-4">{(t("receivPaySummary") || "요약")} · {new Date().toISOString().slice(0, 10)}</p>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            {startStr} ~ {endStr}
            {isRec && storeFilter !== "All" && ` · ${t("outColStore")}: ${storeFilter}`}
            {!isRec && vendorFilter !== "All" && ` · ${t("vendor")}: ${vendorFilter}`}
          </p>
        )}
        {subTab === "summary" && summaryData.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">{isRec ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")}</th>
                <th className="text-right py-2">{t("amount")}</th>
                <th className="text-center py-2">{t("receivPayCount")}</th>
              </tr>
            </thead>
            <tbody>
              {summaryData.map((item) => {
                const name = isRec ? (item.storeName ?? "") : (vendors.find((v) => v.code === item.vendorCode)?.name || item.vendorCode ?? "")
                const bal = item.balance ?? 0
                return (
                  <tr key={name} className="border-b">
                    <td className="py-2">{name}</td>
                    <td className="py-2 text-right">฿{bal.toLocaleString()}</td>
                    <td className="py-2 text-center">{item.count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {subTab === "detail" && listData.length > 0 && (
          <div className="space-y-6">
            {listData.map((item) => {
              const name = isRec ? (item.storeName ?? "") : (vendors.find((v) => v.code === item.vendorCode)?.name || item.vendorCode ?? "")
              return (
                <div key={name} className="break-inside-avoid">
                  <h2 className="font-semibold text-sm mb-1">{name}</h2>
                  <p className="text-primary font-bold mb-2">฿{(item.balance ?? 0).toLocaleString()}</p>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-1">{t("date")}</th>
                        <th className="text-left py-1">{t("type")}</th>
                        <th className="text-right py-1">{t("amount")}</th>
                        <th className="text-left py-1">{t("memo")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(item.items || []).map((row, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="py-1">{row.trans_date || "-"}</td>
                          <td className="py-1">{typeLabel(row.ref_type || "")}</td>
                          <td className="py-1 text-right">{Number(row.amount ?? 0) >= 0 ? "+" : ""}฿{(row.amount ?? 0).toLocaleString()}</td>
                          <td className="py-1 text-muted-foreground">{row.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "receivable" | "payable")}>
        <TabsList className={cn("grid w-full max-w-md", isManager ? "grid-cols-1" : "grid-cols-2")}>
          <TabsTrigger value="receivable" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            {t("receivableTab") || "미수금 (매출)"}
          </TabsTrigger>
          {!isManager && (
            <TabsTrigger value="payable" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t("payableTab") || "미지급금 (매입)"}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="receivable" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4">
              <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "summary" | "detail")} className="w-full">
                <TabsList className="grid w-full max-w-xs grid-cols-2 mb-4">
                  <TabsTrigger value="summary">{t("receivPaySummary") || "요약"}</TabsTrigger>
                  <TabsTrigger value="detail">{t("receivPayDetail") || "내역"}</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-0">
                  {summaryLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                  ) : summaryData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("receivableEmpty") || "조회된 미수금이 없습니다."}</p>
                  ) : (
                    <>
                    <div className="flex justify-end gap-2 mb-3">
                      <Button size="sm" variant="outline" onClick={handlePrint} disabled={summaryData.length === 0} title={t("pettyPrintHint")}>
                        <Printer className="h-4 w-4 mr-1" />
                        {t("printBtn")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleExcelForSummary()} disabled={summaryData.length === 0} title={t("pettyExcelHint")}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                        {t("excelBtn")}
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">{t("outColStore") || "매출처"}</th>
                            <th className="text-right py-2">{t("amount") || "금액"}</th>
                            <th className="text-center py-2">{t("receivPayCount") || "건수"}</th>
                            <th className="w-24" />
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.map((item) => {
                            const bal = item.balance ?? 0
                            const balanceClass =
                              bal === 0
                                ? "text-muted-foreground"
                                : bal > 0
                                  ? "text-primary font-bold"
                                  : "text-blue-600 dark:text-blue-400 font-medium"
                            return (
                              <tr key={item.storeName!} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="py-2.5 font-medium">{item.storeName}</td>
                                <td className={cn("py-2.5 text-right tabular-nums", balanceClass)}>
                                  {bal >= 0 ? "" : "-"}฿{Math.abs(bal).toLocaleString()}
                                </td>
                                <td className="py-2.5 text-center text-muted-foreground">{item.count} {t("receivPayCount") || "건"}</td>
                                <td className="py-2.5">
                                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleViewDetail(item.storeName!)}>
                                    {t("receivPayViewDetail") || "상세보기"}
                                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="detail" className="mt-0">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Select
                      value={storeFilter}
                      onValueChange={setStoreFilter}
                      disabled={isManager && !!managerStore}
                    >
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("outColStore")} />
                      </SelectTrigger>
                      <SelectContent>
                        {!(isManager && managerStore) && (
                          <SelectItem value="All">{t("outFilterStoreAll") || "전체"}</SelectItem>
                        )}
                        {(storeList || []).map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[140px] h-9" />
                    <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[140px] h-9" />
                    <Button size="sm" onClick={loadList} disabled={loading}>
                      <Search className="h-4 w-4 mr-1" />
                      {t("btn_query")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || listData.length === 0} title={t("pettyPrintHint")}>
                      <Printer className="h-4 w-4 mr-1" />
                      {t("printBtn")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExcel} disabled={loading || listData.length === 0} title={t("pettyExcelHint")}>
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      {t("excelBtn")}
                    </Button>
                  </div>
                  {loading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                  ) : listData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("receivableEmpty") || "조회된 미수금이 없습니다."}</p>
                  ) : (
                    <Accordion type="multiple" className="w-full">
                      {listData.map((item) => (
                        <AccordionItem key={item.storeName!} value={item.storeName!}>
                          <AccordionTrigger className="hover:no-underline">
                            <span className="font-semibold">{item.storeName}</span>
                            <span className="ml-2 text-primary font-bold">
                              ฿{(item.balance ?? 0).toLocaleString()}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2">{t("date") || "날짜"}</th>
                                  <th className="text-left py-2">{t("type") || "구분"}</th>
                                  <th className="text-right py-2">{t("amount") || "금액"}</th>
                                  <th className="text-left py-2">{t("memo") || "메모"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(item.items || []).map((row) => (
                                  <tr key={row.id} className="border-b border-border/50">
                                    <td className="py-1.5">{row.trans_date || "-"}</td>
                                    <td className="py-1.5">{row.ref_type === "Order" ? "주문" : "수령"}</td>
                                    <td className="py-1.5 text-right font-medium">
                                      {Number(row.amount ?? 0) >= 0 ? "+" : ""}฿{(row.amount ?? 0).toLocaleString()}
                                    </td>
                                    <td className="py-1.5 text-muted-foreground">{row.memo || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payable" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4">
              <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "summary" | "detail")} className="w-full">
                <TabsList className="grid w-full max-w-xs grid-cols-2 mb-4">
                  <TabsTrigger value="summary">{t("receivPaySummary") || "요약"}</TabsTrigger>
                  <TabsTrigger value="detail">{t("receivPayDetail") || "내역"}</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-0">
                  {summaryLoading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                  ) : summaryData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("payableEmpty") || "조회된 미지급금이 없습니다."}</p>
                  ) : (
                    <>
                    <div className="flex justify-end gap-2 mb-3">
                      <Button size="sm" variant="outline" onClick={handlePrint} disabled={summaryData.length === 0} title={t("pettyPrintHint")}>
                        <Printer className="h-4 w-4 mr-1" />
                        {t("printBtn")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleExcelForSummary()} disabled={summaryData.length === 0} title={t("pettyExcelHint")}>
                        <FileSpreadsheet className="h-4 w-4 mr-1" />
                        {t("excelBtn")}
                      </Button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">{t("vendor") || "매입처"}</th>
                            <th className="text-right py-2">{t("amount") || "금액"}</th>
                            <th className="text-center py-2">{t("receivPayCount") || "건수"}</th>
                            <th className="w-24" />
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.map((item) => {
                            const bal = item.balance ?? 0
                            const balanceClass =
                              bal === 0
                                ? "text-muted-foreground"
                                : bal > 0
                                  ? "text-primary font-bold"
                                  : "text-blue-600 dark:text-blue-400 font-medium"
                            const vendorName = vendors.find((v) => v.code === item.vendorCode)?.name || item.vendorCode
                            return (
                              <tr key={item.vendorCode!} className="border-b border-border/50 hover:bg-muted/30">
                                <td className="py-2.5 font-medium">{vendorName}</td>
                                <td className={cn("py-2.5 text-right tabular-nums", balanceClass)}>
                                  {bal >= 0 ? "" : "-"}฿{Math.abs(bal).toLocaleString()}
                                </td>
                                <td className="py-2.5 text-center text-muted-foreground">{item.count} {t("receivPayCount") || "건"}</td>
                                <td className="py-2.5">
                                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleViewDetail(item.vendorCode!)}>
                                    {t("receivPayViewDetail") || "상세보기"}
                                    <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="detail" className="mt-0">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <Select value={vendorFilter} onValueChange={setVendorFilter}>
                      <SelectTrigger className="w-[160px] h-9">
                        <SelectValue placeholder={t("vendor") || "거래처"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">{t("outFilterStoreAll") || "전체"}</SelectItem>
                        {vendors.map((v) => (
                          <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="date" value={startStr} onChange={(e) => setStartStr(e.target.value)} className="w-[140px] h-9" />
                    <Input type="date" value={endStr} onChange={(e) => setEndStr(e.target.value)} className="w-[140px] h-9" />
                    <Button size="sm" onClick={loadList} disabled={loading}>
                      <Search className="h-4 w-4 mr-1" />
                      {t("btn_query")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handlePrint} disabled={loading || listData.length === 0} title={t("pettyPrintHint")}>
                      <Printer className="h-4 w-4 mr-1" />
                      {t("printBtn")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleExcel} disabled={loading || listData.length === 0} title={t("pettyExcelHint")}>
                      <FileSpreadsheet className="h-4 w-4 mr-1" />
                      {t("excelBtn")}
                    </Button>
                  </div>
                  {loading ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
                  ) : listData.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">{t("payableEmpty") || "조회된 미지급금이 없습니다."}</p>
                  ) : (
                    <Accordion type="multiple" className="w-full">
                      {listData.map((item) => (
                        <AccordionItem key={item.vendorCode!} value={item.vendorCode!}>
                          <AccordionTrigger className="hover:no-underline">
                            <span className="font-semibold">{vendors.find((v) => v.code === item.vendorCode)?.name || item.vendorCode}</span>
                            <span className="ml-2 text-primary font-bold">
                              ฿{(item.balance ?? 0).toLocaleString()}
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-2">{t("date") || "날짜"}</th>
                                  <th className="text-left py-2">{t("type") || "구분"}</th>
                                  <th className="text-right py-2">{t("amount") || "금액"}</th>
                                  <th className="text-left py-2">{t("memo") || "메모"}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(item.items || []).map((row) => (
                                  <tr key={row.id} className="border-b border-border/50">
                                    <td className="py-1.5">{row.trans_date || "-"}</td>
                                    <td className="py-1.5">{row.ref_type === "PO" ? "발주" : "지급"}</td>
                                    <td className="py-1.5 text-right font-medium">
                                      {Number(row.amount ?? 0) >= 0 ? "+" : ""}฿{(row.amount ?? 0).toLocaleString()}
                                    </td>
                                    <td className="py-1.5 text-muted-foreground">{row.memo || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardContent className="pt-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            {tab === "receivable" ? (t("addReceive") || "수령 입력") : (t("addPayment") || "지급 입력")}
          </h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                {tab === "receivable" ? (t("outColStore") || "매출처") : (t("vendor") || "매입처")}
              </label>
              <Select value={addEntity} onValueChange={setAddEntity}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder={tab === "receivable" ? "매장 선택" : "거래처 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {tab === "receivable"
                    ? receivableStores.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)
                    : vendors.map((v) => <SelectItem key={v.code} value={v.code}>{v.name || v.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("amount") || "금액"}</label>
              <Input
                type="number"
                placeholder="0"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
                className="w-[120px] h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("date") || "날짜"}</label>
              <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-[140px] h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("memo") || "메모"}</label>
              <Input
                placeholder={tab === "receivable" ? "수령 메모" : "지급 메모"}
                value={addMemo}
                onChange={(e) => setAddMemo(e.target.value)}
                className="w-[160px] h-9"
              />
            </div>
            <Button onClick={handleAdd} disabled={addSaving}>
              {addSaving ? t("loading") : t("btnSave") || "등록"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
