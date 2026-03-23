"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useParams } from "next/navigation"
import { UtensilsCrossed, Plus, Pencil, Trash2 } from "lucide-react"
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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getInteriorKitchenItems,
  saveInteriorKitchenItem,
  deleteInteriorKitchenItem,
  type InteriorKitchenItem,
} from "@/lib/api-client"

export default function InteriorKitchenPage() {
  const params = useParams()
  const t = useT(useLang().lang)
  const projectId = params.projectId as string
  const [list, setList] = React.useState<InteriorKitchenItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorKitchenItem | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorKitchenItems({ projectId })
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
      itemNameKr: "",
      itemNameEn: "",
      sizeMm: "",
      supplierCode: "",
      zone: "",
      price: 0,
      quantity: 1,
    })
  }

  const handleSave = async () => {
    if (!editing || (!editing.itemNameKr?.trim() && !editing.itemNameEn?.trim())) {
      await appAlert(t("interiorKitchenItemNameRequired") || "품목명(한글 또는 영문)을 입력하세요.")
      return
    }
    try {
      const res = await saveInteriorKitchenItem({
        ...editing,
        projectId: Number(projectId),
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
      const res = await deleteInteriorKitchenItem({ id })
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
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("interiorKitchen") || "주방 설비"}</h2>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("add") || "추가"}
          </Button>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorItemNameKr") || "품목명(한글)"}</label>
                <Input value={editing.itemNameKr || ""} onChange={(e) => setEditing({ ...editing, itemNameKr: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorItemNameEn") || "품목명(영문)"}</label>
                <Input value={editing.itemNameEn || ""} onChange={(e) => setEditing({ ...editing, itemNameEn: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSizeMm") || "규격(mm)"}</label>
                <Input value={editing.sizeMm || ""} onChange={(e) => setEditing({ ...editing, sizeMm: e.target.value })} placeholder="예: 600x800" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorZone") || "구역"}</label>
                <Input value={editing.zone || ""} onChange={(e) => setEditing({ ...editing, zone: e.target.value })} placeholder="예: Cooking" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSupplier") || "공급업체"}</label>
                <Input value={editing.supplierCode || ""} onChange={(e) => setEditing({ ...editing, supplierCode: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("price") || "단가"}</label>
                <Input type="number" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("qty") || "수량"}</label>
                <Input type="number" value={editing.quantity ?? ""} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>{t("save") || "저장"}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel") || "취소"}</Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("loading") || "불러오는 중..."}</div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("msg_click_query") || "주방 설비를 추가해 주세요."}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("interiorItemNameKr") || "품목명(한글)"}</TableHead>
                  <TableHead>{t("interiorItemNameEn") || "품목명(영문)"}</TableHead>
                  <TableHead className="w-24">{t("interiorSizeMm") || "규격"}</TableHead>
                  <TableHead className="w-20">{t("interiorZone") || "구역"}</TableHead>
                  <TableHead className="w-24 text-right">{t("price") || "단가"}</TableHead>
                  <TableHead className="w-16 text-right">{t("qty") || "수량"}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.itemNameKr || "—"}</TableCell>
                    <TableCell>{item.itemNameEn || "—"}</TableCell>
                    <TableCell className="text-xs">{item.sizeMm || "—"}</TableCell>
                    <TableCell className="text-xs">{item.zone || "—"}</TableCell>
                    <TableCell className="text-right font-mono">฿{(item.price ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{item.quantity ?? 1}</TableCell>
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
      </div>
    </div>
  )
}
