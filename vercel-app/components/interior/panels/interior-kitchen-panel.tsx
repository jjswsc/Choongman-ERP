"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
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

export function InteriorKitchenPanel({ projectId }: { projectId: string }) {
  const t = useT(useLang().lang)
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
      await appAlert(t("interiorKitchenItemNameRequired"))
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
        await appAlert(t("msg_saved"))
      } else {
        await appAlert(res.message || t("msg_save_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    }
  }

  const handleDelete = async (id: number) => {
    if (!await appConfirm(t("msg_delete_confirm_check_item"))) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorKitchenItem({ id })
      if (res.success) {
        loadData()
        if (editing?.id === id) setEditing(null)
      } else {
        await appAlert(res.message || t("msg_delete_fail"))
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
            <h2 className="text-lg font-semibold">{t("interiorKitchen")}</h2>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorItemNameKr")}</label>
                <Input value={editing.itemNameKr || ""} onChange={(e) => setEditing({ ...editing, itemNameKr: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorItemNameEn")}</label>
                <Input value={editing.itemNameEn || ""} onChange={(e) => setEditing({ ...editing, itemNameEn: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSizeMm")}</label>
                <Input value={editing.sizeMm || ""} onChange={(e) => setEditing({ ...editing, sizeMm: e.target.value })} placeholder={t("interiorKitchenSizePh")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorZone")}</label>
                <Input value={editing.zone || ""} onChange={(e) => setEditing({ ...editing, zone: e.target.value })} placeholder={t("interiorKitchenZonePh")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSupplier")}</label>
                <Input value={editing.supplierCode || ""} onChange={(e) => setEditing({ ...editing, supplierCode: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("price")}</label>
                <Input type="number" value={editing.price ?? ""} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("qty")}</label>
                <Input type="number" value={editing.quantity ?? ""} onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) || 1 })} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>{t("save")}</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            </div>
          </div>
        )}

        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : list.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("interiorKitchenEmptyHint")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("interiorItemNameKr")}</TableHead>
                  <TableHead>{t("interiorItemNameEn")}</TableHead>
                  <TableHead className="w-24">{t("interiorSizeMm")}</TableHead>
                  <TableHead className="w-20">{t("interiorZone")}</TableHead>
                  <TableHead className="w-24 text-right">{t("price")}</TableHead>
                  <TableHead className="w-16 text-right">{t("qty")}</TableHead>
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
