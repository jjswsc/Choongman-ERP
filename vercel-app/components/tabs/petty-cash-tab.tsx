"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Banknote, Search, Plus, Camera } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { getLoginData } from "@/lib/api-client"
import {
  getPettyCashList,
  getPettyCashMonthDetail,
  addPettyCashTransaction,
  type PettyCashItem,
} from "@/lib/api-client"
import { compressImageForUpload } from "@/lib/utils"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const typeLabels: Record<string, string> = {
  receive: "수령",
  expense: "지출",
  replenish: "보충",
  settle: "정산",
}

export function PettyCashTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [stores, setStores] = useState<string[]>([])
  const [listStore, setListStore] = useState("All")
  const [listStart, setListStart] = useState(todayStr)
  const [listEnd, setListEnd] = useState(todayStr)
  const [listData, setListData] = useState<PettyCashItem[]>([])
  const [listLoading, setListLoading] = useState(false)

  const [monthlyStore, setMonthlyStore] = useState("All")
  const [monthlyYm, setMonthlyYm] = useState(() => {
    const n = new Date()
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0")
  })
  const [monthlyData, setMonthlyData] = useState<PettyCashItem[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  const [addStore, setAddStore] = useState("")
  const [addDate, setAddDate] = useState(todayStr)
  const [addType, setAddType] = useState("expense")
  const [addAmount, setAddAmount] = useState("")
  const [addMemo, setAddMemo] = useState("")
  const [addReceiptFile, setAddReceiptFile] = useState<File | null>(null)
  const [addReceiptPreview, setAddReceiptPreview] = useState<string | null>(null)
  const [addSaving, setAddSaving] = useState(false)

  useEffect(() => {
    if (!auth?.store) return
    const isOffice = ["director", "officer", "ceo", "hr"].includes(auth.role || "")
    getLoginData().then((r) => {
      const storeList = Object.keys(r.users || {}).filter(Boolean).sort()
      if (isOffice) {
        setStores(["All", ...storeList])
        setListStore("All")
        setMonthlyStore("All")
        setAddStore(storeList[0] || "")
      } else {
        setStores([auth.store!])
        setListStore(auth.store!)
        setMonthlyStore(auth.store!)
        setAddStore(auth.store!)
      }
    })
  }, [auth])

  const loadList = () => {
    if (!auth?.store) return
    setListLoading(true)
    getPettyCashList({
      startStr: listStart,
      endStr: listEnd,
      storeFilter: listStore === "All" ? undefined : listStore,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setListData)
      .catch(() => setListData([]))
      .finally(() => setListLoading(false))
  }

  const loadMonthly = () => {
    if (!auth?.store) return
    setMonthlyLoading(true)
    getPettyCashMonthDetail({
      yearMonth: monthlyYm,
      storeFilter: monthlyStore === "All" ? undefined : monthlyStore,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then(setMonthlyData)
      .catch(() => setMonthlyData([]))
      .finally(() => setMonthlyLoading(false))
  }

  const monthlyYmOptions = Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return { value: y + "-" + String(m).padStart(2, "0"), label: y + "년 " + m + "월" }
  })

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setAddReceiptFile(file)
      const url = URL.createObjectURL(file)
      setAddReceiptPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } else {
      setAddReceiptFile(null)
      setAddReceiptPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
    e.target.value = ""
  }

  const handleAdd = async () => {
    if (!auth?.store || !auth?.user) return
    const store = addStore || (stores.includes("All") ? stores.find((s) => s !== "All") : stores[0])
    if (!store || store === "All") {
      alert(t("pettyAlertStore") || "매장을 선택하세요.")
      return
    }
    const amt = parseInt(addAmount, 10) || 0
    if (amt <= 0) {
      alert(t("pettyAlertAmount") || "금액을 입력하세요.")
      return
    }
    setAddSaving(true)
    let receiptUrl: string | undefined
    if (addReceiptFile) {
      try {
        receiptUrl = await compressImageForUpload(addReceiptFile)
      } catch (err) {
        console.error("compressImage:", err)
        alert(t("pettySaveFail") || "영수증 이미지 처리 실패")
        setAddSaving(false)
        return
      }
    }
    const res = await addPettyCashTransaction({
      store,
      transDate: addDate,
      transType: addType,
      amount: amt,
      memo: addMemo,
      receiptUrl,
      userName: auth.user,
      userStore: auth.store,
      userRole: auth.role,
    })
    setAddSaving(false)
    if (res.success) {
      setAddAmount("")
      setAddMemo("")
      setAddReceiptFile(null)
      setAddReceiptPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      loadList()
      alert(t("pettySaved") || "저장되었습니다.")
    } else {
      alert(res.message || "등록 실패")
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString()

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100">
            <Banknote className="h-3.5 w-3.5 text-purple-600" />
          </div>
          <CardTitle className="text-base font-semibold">
            {t("pettyCashTitle") || "💵 패티 캐쉬"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="list" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-3">
              <TabsTrigger value="list">{t("pettyTabList") || "📋 내역"}</TabsTrigger>
              <TabsTrigger value="monthly">{t("pettyTabMonthly") || "📊 월별 현황"}</TabsTrigger>
            </TabsList>

            <TabsContent value="list" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={listStore} onValueChange={setListStore}>
                  <SelectTrigger className="h-9 flex-1 text-xs min-w-[80px]">
                    <SelectValue placeholder={t("store")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((st) => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="h-9 flex-1 text-xs w-28" />
                <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="h-9 flex-1 text-xs w-28" />
              </div>
              <Button className="h-10 w-full font-medium" onClick={loadList} disabled={listLoading}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {listLoading ? (t("loading") || "조회중...") : (t("search") || "조회")}
              </Button>
              <div className="rounded-lg border border-border/60 max-h-[240px] overflow-y-auto">
                {listData.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{t("pettyNoData") || "데이터가 없습니다"}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">{t("pettyColDate") || "날짜"}</th>
                        <th className="p-2 text-left">{t("pettyColType") || "유형"}</th>
                        <th className="p-2 text-right">{t("pettyColAmount") || "금액"}</th>
                        <th className="p-2 text-left hidden sm:table-cell">{t("pettyColMemo") || "내용"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listData.map((r) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="p-2">{r.trans_date}</td>
                          <td className="p-2">{typeLabels[r.trans_type] || r.trans_type}</td>
                          <td className={`p-2 text-right ${r.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                            {r.amount >= 0 ? "" : "-"}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="p-2 hidden sm:table-cell truncate max-w-[80px]">{r.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="border-t pt-3 mt-3">
                <p className="text-sm font-medium mb-2">{t("pettyAddTitle") || "등록"}</p>
                <div className="flex flex-col gap-2">
                  <Select value={addStore} onValueChange={setAddStore}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder={t("store")} />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.filter((s) => s !== "All").map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="h-9 text-xs" />
                  <Select value={addType} onValueChange={setAddType}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receive">{typeLabels.receive}</SelectItem>
                      <SelectItem value="expense">{typeLabels.expense}</SelectItem>
                      <SelectItem value="replenish">{typeLabels.replenish}</SelectItem>
                      <SelectItem value="settle">{typeLabels.settle}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder={t("pettyAmountPh") || "금액"} value={addAmount} onChange={(e) => setAddAmount(e.target.value)} className="h-9 text-xs" min={0} />
                  <Input type="text" placeholder={t("pettyMemoPh") || "내용"} value={addMemo} onChange={(e) => setAddMemo(e.target.value)} className="h-9 text-xs" />
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <Camera className="h-3.5 w-3.5" />
                      {t("pettyReceiptPhoto") || "영수증 사진"} <span className="text-muted-foreground">({t("optional") || "선택"})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleReceiptChange}
                        className="block text-xs file:mr-2 file:rounded file:border-0 file:bg-purple-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-purple-700 hover:file:bg-purple-200"
                      />
                      {addReceiptPreview && (
                        <div className="relative shrink-0">
                          <img src={addReceiptPreview} alt="영수증 미리보기" className="h-12 w-12 object-cover rounded border" />
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center"
                            onClick={() => {
                              setAddReceiptFile(null)
                              setAddReceiptPreview((p) => { if (p) URL.revokeObjectURL(p); return null })
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button className="h-10 w-full font-medium bg-purple-600 hover:bg-purple-700" onClick={handleAdd} disabled={addSaving}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {addSaving ? (t("loading") || "저장중...") : (t("btnSave") || "저장")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="monthly" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={monthlyStore} onValueChange={setMonthlyStore}>
                  <SelectTrigger className="h-9 flex-1 text-xs min-w-[80px]">
                    <SelectValue placeholder={t("store")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((st) => (
                      <SelectItem key={st} value={st}>{st}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthlyYm} onValueChange={setMonthlyYm}>
                  <SelectTrigger className="h-9 flex-1 text-xs min-w-[100px]">
                    <SelectValue placeholder={t("pettyYearMonth") || "연월"} />
                  </SelectTrigger>
                  <SelectContent>
                    {monthlyYmOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="h-10 w-full font-medium" onClick={loadMonthly} disabled={monthlyLoading}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {monthlyLoading ? (t("loading") || "조회중...") : (t("search") || "조회")}
              </Button>
              <div className="rounded-lg border border-border/60 max-h-[320px] overflow-x-auto overflow-y-auto">
                {monthlyData.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{t("pettyNoData") || "데이터가 없습니다"}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left">{t("pettyColDate") || "날짜"}</th>
                        <th className="p-2 text-left">{t("store") || "매장"}</th>
                        <th className="p-2 text-left">{t("pettyColType") || "유형"}</th>
                        <th className="p-2 text-right">{t("pettyColAmount") || "금액"}</th>
                        <th className="p-2 text-right font-medium">{t("pettyColBalance") || "잔액"}</th>
                        <th className="p-2 text-left hidden sm:table-cell">{t("pettyColMemo") || "내용"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyData.map((r) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="p-2">{r.trans_date}</td>
                          <td className="p-2">{r.store}</td>
                          <td className="p-2">{typeLabels[r.trans_type] || r.trans_type}</td>
                          <td className={`p-2 text-right ${r.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                            {r.amount >= 0 ? "" : "-"}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="p-2 text-right font-medium">{fmt(r.balance_after ?? 0)}</td>
                          <td className="p-2 hidden sm:table-cell truncate max-w-[80px]">{r.memo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
