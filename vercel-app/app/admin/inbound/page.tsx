"use client"

import * as React from "react"
import { ArrowDownToLine } from "lucide-react"
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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getAdminItems,
  getAdminVendors,
  registerInboundBatch,
  getInboundHistory,
  getInboundForStore,
  type AdminItem,
  type AdminVendor,
  type InboundHistoryItem,
} from "@/lib/api-client"
import { ItemPickerDialog } from "@/components/erp/item-picker-dialog"
import { cn } from "@/lib/utils"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

interface InboundCartItem {
  date: string
  vendor: string
  code: string
  name: string
  spec: string
  qty: string
}

export default function InboundPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [items, setItems] = React.useState<AdminItem[]>([])
  const [vendors, setVendors] = React.useState<AdminVendor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyList, setHistoryList] = React.useState<InboundHistoryItem[]>([])

  const [inDate, setInDate] = React.useState("")
  const [inVendor, setInVendor] = React.useState("")
  const [inQty, setInQty] = React.useState("")
  const [cart, setCart] = React.useState<InboundCartItem[]>([])
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [selectedItem, setSelectedItem] = React.useState<AdminItem | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [histStart, setHistStart] = React.useState("")
  const [histEnd, setHistEnd] = React.useState("")
  const [histVendor, setHistVendor] = React.useState("")
  const [histMonth, setHistMonth] = React.useState("")

  const isOffice = React.useMemo(() => {
    const store = (auth?.store || "").trim()
    return OFFICE_STORES.some((s) => store.toLowerCase().includes(s.toLowerCase()))
  }, [auth?.store])

  const purchaseVendors = React.useMemo(() => {
    return vendors.filter((v) => v.type === "purchase" || v.type === "both")
  }, [vendors])

  React.useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setInDate(today)
  }, [])

  React.useEffect(() => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)
    setHistStart(first)
    setHistEnd(last)
  }, [])

  React.useEffect(() => {
    Promise.all([getAdminItems(), getAdminVendors()])
      .then(([itemList, vendorList]) => {
        setItems(Array.isArray(itemList) ? itemList : [])
        setVendors(Array.isArray(vendorList) ? vendorList : [])
      })
      .catch(() => {
        setItems([])
        setVendors([])
      })
      .finally(() => setLoading(false))
  }, [])

  const handleItemSelect = (item: AdminItem) => {
    setSelectedItem(item)
    setInQty("")
  }

  const handleAddToList = () => {
    if (!selectedItem) {
      alert(t("inAlertSelectItem") || "품목을 선택해주세요.")
      return
    }
    if (!inQty.trim()) {
      alert(t("inAlertEnterQty") || "수량을 입력해주세요.")
      return
    }
    if (!inVendor) {
      alert(t("inAlertSelectVendor") || "매입처를 선택해주세요.")
      return
    }
    const q = parseFloat(inQty.replace(/,/g, ""))
    if (isNaN(q) || q <= 0) {
      alert(t("inAlertEnterQty") || "수량을 입력해주세요.")
      return
    }
    setCart((prev) => [
      ...prev,
      {
        date: inDate || new Date().toISOString().slice(0, 10),
        vendor: inVendor,
        code: selectedItem.code,
        name: selectedItem.name,
        spec: selectedItem.spec || "",
        qty: inQty,
      },
    ])
    setSelectedItem(null)
    setInQty("")
  }

  const handleRemoveFromCart = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!cart.length) {
      alert(t("inAlertNoList") || "저장할 목록이 없습니다.")
      return
    }
    const msg = (t("inConfirmSave") || "총 {count}건을 입고 처리하시겠습니까?").replace("{count}", String(cart.length))
    if (!confirm(msg)) return
    setSaving(true)
    try {
      const list = cart.map((c) => ({
        date: c.date,
        vendor: c.vendor,
        code: c.code,
        name: c.name,
        spec: c.spec,
        qty: c.qty,
      }))
      const res = await registerInboundBatch(list)
      if (res.success) {
        alert(res.message || t("inSaveSuccess"))
        setCart([])
      } else {
        alert(res.message || t("inSaveFailed"))
      }
    } catch {
      alert(t("inSaveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const fetchHistory = React.useCallback(async () => {
    let s = histStart
    let e = histEnd
    if (histMonth) {
      const [y, m] = histMonth.split("-").map(Number)
      const first = new Date(y, m - 1, 1).toISOString().slice(0, 10)
      const last = new Date(y, m, 0).toISOString().slice(0, 10)
      s = first
      e = last
    }
    if (!s || !e) return
    setHistoryLoading(true)
    try {
      if (isOffice) {
        const list = await getInboundHistory({
          startStr: s,
          endStr: e,
          vendorFilter: histVendor || undefined,
        })
        setHistoryList(Array.isArray(list) ? list : [])
      } else {
        const list = await getInboundForStore({
          storeName: auth?.store || "",
          startStr: s,
          endStr: e,
        })
        setHistoryList(Array.isArray(list) ? list : [])
      }
    } catch {
      setHistoryList([])
    } finally {
      setHistoryLoading(false)
    }
  }, [histStart, histEnd, histMonth, histVendor, isOffice, auth?.store])

  const groupedHistory = React.useMemo(() => {
    const g: Record<string, { date: string; vendor: string; totalQty: number; totalAmt: number; items: InboundHistoryItem[] }> = {}
    for (const i of historyList) {
      const k = `${i.date}_${i.vendor}`
      if (!g[k]) g[k] = { date: i.date, vendor: i.vendor, totalQty: 0, totalAmt: 0, items: [] }
      g[k].items.push(i)
      g[k].totalQty += i.qty
      g[k].totalAmt += i.amount || 0
    }
    return Object.values(g)
  }, [historyList])

  const periodTotal = React.useMemo(() => {
    return historyList.reduce((sum, i) => sum + (i.amount || 0), 0)
  }, [historyList])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
            <ArrowDownToLine className="h-5 w-5 text-success" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("adminInbound")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isOffice
                ? (t("inPageSubOffice") || "입고 등록 및 내역을 관리합니다.")
                : (t("inPageSubStore") || "본사에서 보낸 입고 수령 내역을 조회합니다.")}
            </p>
          </div>
        </div>

        <Tabs defaultValue={isOffice ? "new" : "hist"} className="space-y-4">
          <TabsList>
            {isOffice && (
              <TabsTrigger value="new">{t("inTabNew")}</TabsTrigger>
            )}
            <TabsTrigger value="hist">{t("inTabHist")}</TabsTrigger>
          </TabsList>

          {isOffice && (
            <TabsContent value="new">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-2 space-y-4">
                  <div className="rounded-xl border bg-card p-5">
                    <h3 className="text-sm font-bold mb-4">{t("inNewTitle")}</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold">{t("inDate")}</label>
                        <Input
                          type="date"
                          value={inDate}
                          onChange={(e) => setInDate(e.target.value)}
                          className="mt-1 h-9"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inVendor")}</label>
                        <Select value={inVendor || "__none__"} onValueChange={(v) => setInVendor(v === "__none__" ? "" : v)}>
                          <SelectTrigger className="mt-1 h-9">
                            <SelectValue placeholder={t("inVendorPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">{t("inVendorPlaceholder")}</SelectItem>
                            {purchaseVendors.map((v) => (
                              <SelectItem key={v.code} value={v.name}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inItem")}</label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            readOnly
                            value={selectedItem ? `${selectedItem.code} ${selectedItem.name}` : ""}
                            placeholder={t("inFindItem")}
                            className="h-9"
                          />
                          <Button size="sm" className="h-9" onClick={() => setPickerOpen(true)}>
                            🔍
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold">{t("inQty")}</label>
                        <Input
                          type="number"
                          value={inQty}
                          onChange={(e) => setInQty(e.target.value)}
                          placeholder={t("inQty")}
                          className="mt-1 h-9"
                          onKeyDown={(e) => e.key === "Enter" && handleAddToList()}
                        />
                      </div>
                      <Button className="w-full" variant="secondary" onClick={handleAddToList}>
                        {t("inAddList")}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-bold">
                        {t("inWaitList")} <span className="badge bg-muted px-2 py-0.5 rounded text-xs">{cart.length}</span>
                      </h3>
                    </div>
                    <div className="overflow-x-auto max-h-[400px]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-2">{t("inColItem")}</th>
                            <th className="text-right py-2 px-2 w-20">{t("inColQty")}</th>
                            <th className="w-12"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cart.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-8 text-center text-muted-foreground text-sm">
                                {t("inEmptyList")}
                              </td>
                            </tr>
                          ) : (
                            cart.map((c, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="py-2 px-2">{c.name} {c.spec ? `(${c.spec})` : ""}</td>
                                <td className="py-2 px-2 text-right font-medium">{c.qty}</td>
                                <td className="py-2 px-2">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-destructive hover:text-destructive"
                                    onClick={() => handleRemoveFromCart(idx)}
                                  >
                                    {t("delete")}
                                  </Button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      className="w-full mt-4"
                      onClick={handleSave}
                      disabled={saving || !cart.length}
                    >
                      {saving ? t("loading") : t("inSave")}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="hist">
            <div className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Input type="date" value={histStart} onChange={(e) => setHistStart(e.target.value)} className="h-9 w-36" />
                <Input type="date" value={histEnd} onChange={(e) => setHistEnd(e.target.value)} className="h-9 w-36" />
                <Input type="month" value={histMonth} onChange={(e) => setHistMonth(e.target.value)} className="h-9 w-36" title={t("inMonthHint")} />
                {isOffice && (
                    <Select value={histVendor || "__all__"} onValueChange={(v) => setHistVendor(v === "__all__" ? "" : v)}>
                      <SelectTrigger className="h-9 w-40">
                        <SelectValue placeholder={t("inVendorAll")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("inVendorAll")}</SelectItem>
                      {purchaseVendors.map((v) => (
                        <SelectItem key={v.code} value={v.name}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" className="h-9" onClick={fetchHistory}>
                  {t("stockBtnSearch")}
                </Button>
                <span className="text-sm font-bold text-primary ml-2">
                  {t("inPeriodTotal")}: {periodTotal.toLocaleString()}
                </span>
              </div>
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-2 text-left w-24">{t("stockColDate")}</th>
                      <th className="px-4 py-2 text-left">{t("inVendor")}</th>
                      <th className="px-4 py-2 text-left">{t("inColItem")}</th>
                      <th className="px-4 py-2 text-right w-20">{t("inColQty")}</th>
                      <th className="px-4 py-2 text-right w-24">{t("inColAmount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLoading ? (
                      <tr><td colSpan={5} className="py-12 text-center">{t("loading")}</td></tr>
                    ) : groupedHistory.length === 0 ? (
                      <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">{t("inNoData")}</td></tr>
                    ) : (
                      groupedHistory.flatMap((g, gi) => [
                        <tr key={gi} className="border-b font-medium">
                          <td className="px-4 py-2">{g.date}</td>
                          <td className="px-4 py-2">{g.vendor}</td>
                          <td className="px-4 py-2">
                            {g.items[0].name}
                            {g.items.length > 1 ? ` ${t("inEtcCount")} ${g.items.length - 1}` : ""}
                          </td>
                          <td className="px-4 py-2 text-right">{g.totalQty.toLocaleString()}</td>
                          <td className="px-4 py-2 text-right text-primary">{g.totalAmt.toLocaleString()}</td>
                        </tr>,
                        ...g.items.slice(1).map((i, ii) => (
                          <tr key={`${gi}-${ii}`} className="border-b bg-muted/5">
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 pl-8 text-muted-foreground text-xs">{i.name} {i.spec ? `(${i.spec})` : ""}</td>
                            <td className="px-4 py-2 text-right">{i.qty.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right">{(i.amount || 0).toLocaleString()}</td>
                          </tr>
                        )),
                      ])
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <ItemPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          items={items}
          onSelect={handleItemSelect}
        />
      </div>
    </div>
  )
}
