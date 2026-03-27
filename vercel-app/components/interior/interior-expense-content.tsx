"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Plus, Pencil, Trash2, Banknote, Package, CreditCard } from "lucide-react"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getInteriorExpenseItems,
  saveInteriorExpenseItem,
  deleteInteriorExpenseItem,
  payInteriorExpense,
  getBankAccounts,
  getInteriorDirectPurchases,
  saveInteriorDirectPurchase,
  deleteInteriorDirectPurchase,
  type InteriorExpenseItem,
  type InteriorDirectPurchase,
} from "@/lib/api-client"

const EXPENSE_CATEGORIES = ["견적", "인테리어", "M&E", "주방", "에어컨", "기타"]
const DIRECT_CATEGORIES = ["M&E", "Interior", "Kitchen", "Air condition"]

interface InteriorExpenseContentProps {
  projectId: string
  t: (key: string) => string
}

function InteriorExpenseTab({ projectId, t }: { projectId: string; t: (key: string) => string }) {
  const [list, setList] = React.useState<InteriorExpenseItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorExpenseItem | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [paymentItem, setPaymentItem] = React.useState<InteriorExpenseItem | null>(null)
  const [paymentAmount, setPaymentAmount] = React.useState("")
  const [paymentAccountId, setPaymentAccountId] = React.useState("")
  const [paymentDate, setPaymentDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [paymentMemo, setPaymentMemo] = React.useState("")
  const [paying, setPaying] = React.useState(false)
  const [accounts, setAccounts] = React.useState<{ id?: number; name?: string }[]>([])

  React.useEffect(() => {
    getBankAccounts().then((r) => setAccounts(r || [])).catch(() => setAccounts([]))
  }, [])

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorExpenseItems({ projectId })
      .then((r) => setList(r || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [projectId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditing({
      projectId: Number(projectId),
      category: "기타",
      description: "",
      quote: 0,
      paid: 0,
      balance: 0,
      sortOrder: list.length,
    })
  }

  const handleSave = async () => {
    if (!editing || !editing.description?.trim()) {
      await appAlert(t("interiorDescriptionRequired") || "설명을 입력하세요.")
      return
    }
    const balance = (editing.quote ?? 0) - (editing.paid ?? 0)
    try {
      const res = await saveInteriorExpenseItem({
        ...editing,
        projectId: Number(projectId),
        description: editing.description.trim(),
        balance,
      })
      if (res.success) {
        setEditing(null)
        loadData()
        await appAlert(t("msg_saved") || "저장되었습니다.")
      } else {
        await appAlert(res.message || "저장 실패")
      }
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const handlePay = async () => {
    if (!paymentItem?.id) return
    const amt = Number(paymentAmount) || 0
    if (amt <= 0) {
      await appAlert(t("interiorPaymentAmountRequired") || "결제 금액을 입력하세요.")
      return
    }
    const balance = (paymentItem.quote ?? 0) - (paymentItem.paid ?? 0)
    if (amt > balance) {
      await appAlert(t("interiorPaymentExceedsBalance") || "잔액을 초과할 수 없습니다.")
      return
    }
    if (!paymentAccountId) {
      await appAlert(t("interiorPaymentAccountRequired") || "계좌를 선택하세요.")
      return
    }
    setPaying(true)
    try {
      const res = await payInteriorExpense({
        expenseId: paymentItem.id,
        accountId: Number(paymentAccountId),
        transDate: paymentDate,
        amount: amt,
        memo: paymentMemo || undefined,
      })
      if (res.success) {
        setPaymentItem(null)
        setPaymentAmount("")
        setPaymentMemo("")
        loadData()
        await appAlert(t("msg_saved") || "결제가 등록되었습니다.")
      } else {
        await appAlert(res.message || "결제 등록 실패")
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setPaying(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item") || "삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorExpenseItem({ id })
      if (res.success) {
        loadData()
        if (editing?.id === id) setEditing(null)
      } else {
        await appAlert(res.message || "삭제 실패")
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  const totals = React.useMemo(() => {
    let quoteTotal = 0
    let paidTotal = 0
    list.forEach((x) => {
      quoteTotal += x.quote ?? 0
      paidTotal += x.paid ?? 0
    })
    return { quoteTotal, paidTotal, balanceTotal: quoteTotal - paidTotal }
  }, [list])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-muted-foreground">
          {t("interiorQuote") || "견적"} 합계: ฿{totals.quoteTotal.toLocaleString()} | {t("interiorPaid") || "결제"}: ฿{totals.paidTotal.toLocaleString()} | {t("interiorBalance") || "잔액"}: ฿{totals.balanceTotal.toLocaleString()}
        </span>
        <Button size="sm" onClick={handleAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("add") || "추가"}
        </Button>
      </div>

      {editing && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorCategory") || "구분"}</label>
              <Select value={editing.category || "기타"} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">{t("interiorDescription") || "설명"}</label>
              <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="예: 인테리어 공사비" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorVendor") || "거래처"}</label>
              <Input value={editing.vendorCode || ""} onChange={(e) => setEditing({ ...editing, vendorCode: e.target.value })} placeholder="코드" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorQuote") || "견적"}</label>
              <Input type="number" value={editing.quote ?? ""} onChange={(e) => setEditing({ ...editing, quote: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorPaid") || "결제"}</label>
              <Input type="number" value={editing.paid ?? ""} onChange={(e) => setEditing({ ...editing, paid: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>{t("save") || "저장"}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel") || "취소"}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("loading") || "불러오는 중..."}</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("msg_click_query") || "비용 항목을 추가해 주세요."}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t("interiorCategory") || "구분"}</TableHead>
              <TableHead>{t("interiorDescription") || "설명"}</TableHead>
              <TableHead className="w-24">{t("interiorVendor") || "거래처"}</TableHead>
              <TableHead className="w-24 text-right">{t("interiorQuote") || "견적"}</TableHead>
              <TableHead className="w-24 text-right">{t("interiorPaid") || "결제"}</TableHead>
              <TableHead className="w-24 text-right">{t("interiorBalance") || "잔액"}</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-xs">{item.category}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="font-mono text-xs">{item.vendorCode || "—"}</TableCell>
                <TableCell className="text-right font-mono">฿{(item.quote ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">฿{(item.paid ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">฿{((item.quote ?? 0) - (item.paid ?? 0)).toLocaleString()}</TableCell>
                <TableCell>
                  <div className="flex gap-1 items-center">
                    {(item.quote ?? 0) - (item.paid ?? 0) > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-primary" onClick={() => { setPaymentItem(item); setPaymentAmount(String((item.quote ?? 0) - (item.paid ?? 0))) }}>
                        <CreditCard className="h-3.5 w-3.5" />
                        {t("interiorPay") || "결제"}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => item.id && handleDelete(item.id)} disabled={deletingId === item.id}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {paymentItem && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-medium">{t("interiorPay") || "결제"} — {paymentItem.description}</h3>
          <p className="text-xs text-muted-foreground">{t("interiorBalance") || "잔액"}: ฿{((paymentItem.quote ?? 0) - (paymentItem.paid ?? 0)).toLocaleString()}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorPaymentAmount") || "결제 금액"}</label>
              <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorPaymentAccount") || "계좌"}</label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger><SelectValue placeholder={t("interiorSelectAccount") || "계좌 선택"} /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name || `#${a.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("dateFrom") || "결제일"}</label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorMemo") || "메모"}</label>
              <Input value={paymentMemo} onChange={(e) => setPaymentMemo(e.target.value)} placeholder={t("interiorMemoOptional") || "선택"} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePay} disabled={paying}>{paying ? (t("loading") || "처리 중...") : (t("interiorPay") || "결제")}</Button>
            <Button size="sm" variant="outline" onClick={() => { setPaymentItem(null); setPaymentAmount(""); setPaymentMemo(""); }}>{t("cancel") || "취소"}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function InteriorDirectPurchaseTab({ projectId, t }: { projectId: string; t: (key: string) => string }) {
  const [list, setList] = React.useState<InteriorDirectPurchase[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorDirectPurchase | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorDirectPurchases({ projectId })
      .then((r) => setList(r || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [projectId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditing({
      projectId: Number(projectId),
      category: "M&E",
      description: "",
      qty: 1,
      unit: "set",
      price: 0,
      sumAmount: 0,
      status: "pending",
    })
  }

  const recalcSum = (qty: number, price: number) => qty * price

  const handleSave = async () => {
    if (!editing || !editing.description?.trim()) {
      await appAlert(t("interiorDescriptionRequired") || "품목명을 입력하세요.")
      return
    }
    const sumAmount = recalcSum(editing.qty ?? 1, editing.price ?? 0)
    try {
      const res = await saveInteriorDirectPurchase({
        ...editing,
        projectId: Number(projectId),
        description: editing.description.trim(),
        sumAmount,
      })
      if (res.success) {
        setEditing(null)
        loadData()
        await appAlert(t("msg_saved") || "저장되었습니다.")
      } else {
        await appAlert(res.message || "저장 실패")
      }
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item") || "삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorDirectPurchase({ id })
      if (res.success) {
        loadData()
        if (editing?.id === id) setEditing(null)
      } else {
        await appAlert(res.message || "삭제 실패")
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {t("add") || "추가"}
        </Button>
      </div>

      {editing && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorCategory") || "구분"}</label>
              <Select value={editing.category || "M&E"} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DIRECT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">{t("posMenuName") || "품목명"}</label>
              <Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("qty") || "수량"}</label>
              <Input type="number" min={0.01} value={editing.qty ?? ""} onChange={(e) => setEditing({ ...editing, qty: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("unit") || "단위"}</label>
              <Input value={editing.unit || "set"} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} placeholder="set" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("price") || "단가"}</label>
              <Input type="number" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("interiorSupplier") || "공급업체"}</label>
              <Input value={editing.supplierCode || ""} onChange={(e) => setEditing({ ...editing, supplierCode: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave}>{t("save") || "저장"}</Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel") || "취소"}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("loading") || "불러오는 중..."}</div>
      ) : list.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">{t("msg_click_query") || "직매입 품목을 추가해 주세요."}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t("interiorCategory") || "구분"}</TableHead>
              <TableHead>{t("posMenuName") || "품목명"}</TableHead>
              <TableHead className="w-16 text-right">{t("qty") || "수량"}</TableHead>
              <TableHead className="w-16">{t("unit") || "단위"}</TableHead>
              <TableHead className="w-24 text-right">{t("price") || "단가"}</TableHead>
              <TableHead className="w-24 text-right">{t("interiorSumAmount") || "금액"}</TableHead>
              <TableHead className="w-20">{t("status") || "상태"}</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-xs">{item.category}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell className="text-right font-mono">{item.qty ?? 1}</TableCell>
                <TableCell className="text-xs">{item.unit || "set"}</TableCell>
                <TableCell className="text-right font-mono">฿{(item.price ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right font-mono">฿{(item.sumAmount ?? 0).toLocaleString()}</TableCell>
                <TableCell><span className="text-xs rounded px-2 py-0.5 bg-muted">{item.status || "pending"}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => item.id && handleDelete(item.id)} disabled={deletingId === item.id}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export function InteriorExpenseContent({ projectId, t }: InteriorExpenseContentProps) {
  return (
    <Tabs defaultValue="expense" className={adminTabsRootCn}>
      <div className={adminTabsBarCn}>
        <div className={adminTabsScrollCn}>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="expense" className={adminTabsTriggerCn}>
              <Banknote className={adminTabsIconCn} aria-hidden />
              {t("interiorExpenseTab") || "비용"}
            </TabsTrigger>
            <TabsTrigger value="direct" className={adminTabsTriggerCn}>
              <Package className={adminTabsIconCn} aria-hidden />
              {t("interiorDirectPurchase") || "직매입"}
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
      <TabsContent value="expense" className={adminTabsContentCn}>
        <InteriorExpenseTab projectId={projectId} t={t} />
      </TabsContent>
      <TabsContent value="direct" className={adminTabsContentCn}>
        <InteriorDirectPurchaseTab projectId={projectId} t={t} />
      </TabsContent>
    </Tabs>
  )
}
