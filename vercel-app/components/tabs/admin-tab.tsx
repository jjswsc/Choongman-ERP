"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Megaphone, CalendarCheck, UserCog, Send, Search, Package, Pencil } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminOrders, updateOrderDeliveryStatus, updateOrderCart, type AdminOrderItem } from "@/lib/api-client"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function monthStartStr() {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export function AdminTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const [outboundStart, setOutboundStart] = useState(monthStartStr)
  const [outboundEnd, setOutboundEnd] = useState(todayStr)
  const [outboundList, setOutboundList] = useState<AdminOrderItem[]>([])
  const [outboundLoading, setOutboundLoading] = useState(false)
  const [editModal, setEditModal] = useState<AdminOrderItem | null>(null)
  const [editDeliveryStatus, setEditDeliveryStatus] = useState("")
  const [editCartItems, setEditCartItems] = useState<{ code?: string; name?: string; spec?: string; qty: number; price: number }[]>([])
  const [editSaving, setEditSaving] = useState(false)

  const loadOutboundHistory = () => {
    setOutboundLoading(true)
    getAdminOrders({ startStr: outboundStart, endStr: outboundEnd })
      .then(setOutboundList)
      .catch(() => setOutboundList([]))
      .finally(() => setOutboundLoading(false))
  }

  const translateDeliveryStatus = (d: string) => {
    if (d === "배송중") return t("statusInTransit")
    if (d === "배송완료" || d === "배송 완료") return t("statusDelivered")
    if (d === "일부 배송 완료") return t("statusPartialDelivered")
    return d
  }

  const deliveryStatusBadgeColor = (d: string) => {
    if (d === "배송중") return "bg-[#2563eb] text-white"
    if (d === "배송완료" || d === "배송 완료") return "bg-[#16a34a] text-white"
    if (d === "일부 배송 완료") return "bg-[#d97706] text-white"
    return "bg-muted"
  }

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    const res = await updateOrderDeliveryStatus({ orderId, deliveryStatus: newStatus })
    if (res.success) {
      loadOutboundHistory()
    } else {
      alert(res.message || "변경 실패")
    }
  }

  const openEditModal = (o: AdminOrderItem) => {
    setEditModal(o)
    setEditDeliveryStatus(o.deliveryStatus || "배송중")
    setEditCartItems((o.items || []).map((it) => ({
      code: it.code,
      name: it.name,
      spec: it.spec,
      qty: Number(it.qty) || 0,
      price: Number(it.price) || 0,
    })))
  }

  const openPartialEditModal = (o: AdminOrderItem) => {
    setEditModal(o)
    setEditDeliveryStatus("일부 배송 완료")
    setEditCartItems((o.items || []).map((it) => ({
      code: it.code,
      name: it.name,
      spec: it.spec,
      qty: Number(it.qty) || 0,
      price: Number(it.price) || 0,
    })))
  }

  const updateEditCartQty = (idx: number, qty: number) => {
    const v = Math.max(0, Math.floor(Number(qty)))
    setEditCartItems((prev) => prev.map((it, i) => (i === idx ? { ...it, qty: v } : it)))
  }

  const saveEditModal = async () => {
    if (!editModal) return
    setEditSaving(true)
    const isPartialMode = editDeliveryStatus === "일부 배송 완료"
    if (isPartialMode && editCartItems.length > 0) {
      const updatedCart = editCartItems.filter((it) => it.qty > 0).map((it) => ({
        code: it.code,
        name: it.name,
        spec: it.spec,
        price: it.price,
        qty: it.qty,
      }))
      if (updatedCart.length === 0) {
        alert("품목 수량이 0인 항목만 있습니다. 최소 1개 품목은 필요합니다.")
        setEditSaving(false)
        return
      }
      const res = await updateOrderCart({
        orderId: editModal.orderId,
        updatedCart,
        deliveryStatus: "일부 배송 완료",
      })
      setEditSaving(false)
      if (res.success) {
        setEditModal(null)
        loadOutboundHistory()
      } else {
        alert(res.message || "저장 실패")
      }
    } else {
      const res = await updateOrderDeliveryStatus({
        orderId: editModal.orderId,
        deliveryStatus: editDeliveryStatus,
      })
      setEditSaving(false)
      if (res.success) {
        setEditModal(null)
        loadOutboundHistory()
      } else {
        alert(res.message || "저장 실패")
      }
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Send Notice */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Megaphone className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">공지사항 발송</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-title" className="text-xs text-muted-foreground">제목</Label>
            <Input id="notice-title" placeholder="제목" className="h-10" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notice-content" className="text-xs text-muted-foreground">내용</Label>
            <Textarea id="notice-content" placeholder="내용" className="min-h-[100px] resize-none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">대상 매장</Label>
            <Select defaultValue="all">
              <SelectTrigger className="h-10">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="gangnam">강남점</SelectItem>
                <SelectItem value="hongdae">홍대점</SelectItem>
                <SelectItem value="sinchon">신촌점</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">대상</Label>
            <Select defaultValue="all">
              <SelectTrigger className="h-10">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="manager">매니저</SelectItem>
                <SelectItem value="staff">직원</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="mt-1 h-11 w-full font-semibold">
            <Send className="mr-2 h-4 w-4" />
            공지 발송하기
          </Button>
        </CardContent>
      </Card>

      {/* Leave Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <CalendarCheck className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">연차 승인</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Select defaultValue="all">
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="gangnam">강남점</SelectItem>
                <SelectItem value="hongdae">홍대점</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="pending">
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="approved">승인</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">김직원</p>
                <p className="text-xs text-muted-foreground">2026-02-15 ~ 2026-02-16</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-7 px-3 text-xs font-medium">승인</Button>
                <Button variant="outline" size="sm" className="h-7 px-3 text-xs font-medium">반려</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Approval */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <UserCog className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">근태 승인</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
            <Input type="date" defaultValue="2026-02-12" className="h-9 flex-1 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Select defaultValue="all">
              <SelectTrigger className="h-9 flex-1 text-xs">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="gangnam">강남점</SelectItem>
                <SelectItem value="hongdae">홍대점</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="pending">
              <SelectTrigger className="h-9 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="approved">승인</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="h-10 w-full font-medium">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            조회
          </Button>
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <UserCog className="mx-auto h-8 w-8 text-muted-foreground/30" />
            <p className="mt-2 text-xs text-muted-foreground">승인 대기 항목이 없습니다</p>
          </div>
        </CardContent>
      </Card>

      {/* 출고 관리 - 내역 조회 */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("outboundManage")} · {t("outboundHistory")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={outboundStart} onChange={(e) => setOutboundStart(e.target.value)} className="h-9 flex-1 min-w-0 max-w-[130px] text-xs" />
            <span className="text-xs text-muted-foreground">~</span>
            <Input type="date" value={outboundEnd} onChange={(e) => setOutboundEnd(e.target.value)} className="h-9 flex-1 min-w-0 max-w-[130px] text-xs" />
            <Button className="h-9 font-medium" onClick={loadOutboundHistory} disabled={outboundLoading}>
              <Search className="mr-1.5 h-3.5 w-3.5" />
              {t("search")}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {outboundLoading ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("loading")}</p>
            ) : outboundList.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">조회 기간에 주문이 없습니다</p>
            ) : (
              outboundList
                .filter((o) => o.status === "Approved")
                .map((o) => (
                  <div key={o.orderId} className="rounded-lg border border-border/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{o.date}</p>
                        <p className="text-xs text-muted-foreground">{o.store} · {o.summary}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs">{o.status}</Badge>
                        <Badge className={`text-xs ${deliveryStatusBadgeColor(o.deliveryStatus)}`}>
                          {translateDeliveryStatus(o.deliveryStatus)}
                        </Badge>
                        <span className="text-sm font-semibold text-primary">{o.total} ฿</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select value={o.deliveryStatus || "배송중"} onValueChange={(v) => handleStatusChange(o.orderId, v)}>
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="배송중">{t("statusInTransit")}</SelectItem>
                          <SelectItem value="배송완료">{t("statusDelivered")}</SelectItem>
                          <SelectItem value="일부 배송 완료">{t("statusPartialDelivered")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        className="h-8 gap-1 bg-[#d97706] text-xs hover:bg-[#d97706]/90"
                        onClick={() => openPartialEditModal(o)}
                      >
                        {t("statusPartialDelivered")} → {t("editOrder")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openEditModal(o)}>
                        <Pencil className="h-3 w-3" />
                        {t("editOrder")}
                      </Button>
                    </div>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 출고 입력 수정 모달 */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditModal(null)}>
          <div className="w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 font-semibold">{t("editOrder")} · #{editModal.orderId}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{editModal.store} · {editModal.summary}</p>
            <div className="mb-4">
              <Label className="text-xs text-muted-foreground">배송 상태</Label>
              <Select value={editDeliveryStatus} onValueChange={setEditDeliveryStatus}>
                <SelectTrigger className="mt-1 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="배송중">{t("statusInTransit")}</SelectItem>
                  <SelectItem value="배송완료">{t("statusDelivered")}</SelectItem>
                  <SelectItem value="일부 배송 완료">{t("statusPartialDelivered")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editDeliveryStatus === "일부 배송 완료" && (
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground">{t("editCartQuantityLabel")}</Label>
                <div className="mt-2 space-y-2 rounded-lg border border-border p-3">
                  {editCartItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{it.name ?? "-"}</span>
                      <span className="shrink-0 text-muted-foreground">×</span>
                      <Input
                        type="number"
                        min={0}
                        value={it.qty}
                        onChange={(e) => updateEditCartQty(idx, Number(e.target.value))}
                        className="h-8 w-16 text-center text-xs"
                      />
                      <span className="shrink-0 text-xs text-muted-foreground">{(it.price * it.qty).toLocaleString()} ฿</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditModal(null)}>{t("cancel")}</Button>
              <Button size="sm" onClick={saveEditModal} disabled={editSaving}>
                {editSaving ? t("loading") : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
