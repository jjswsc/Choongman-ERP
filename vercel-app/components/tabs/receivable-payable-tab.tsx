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
import { Search, Plus, Wallet, Building2 } from "lucide-react"
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
  addBalanceTransaction,
  type ReceivablePayableItem,
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
  const [startStr, setStartStr] = React.useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [endStr, setEndStr] = React.useState(todayStr)
  const [listData, setListData] = React.useState<ReceivablePayableItem[]>([])
  const [loading, setLoading] = React.useState(false)

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

  return (
    <div className="space-y-4">
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payable" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-4">
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
