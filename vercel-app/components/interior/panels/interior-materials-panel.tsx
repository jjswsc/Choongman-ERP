"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import Image from "next/image"
import { PackageSearch, Plus, Pencil, Trash2 } from "lucide-react"
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
  getInteriorMaterialSpecs,
  saveInteriorMaterialSpec,
  deleteInteriorMaterialSpec,
  uploadInteriorFile,
  type InteriorMaterialSpec,
} from "@/lib/api-client"

export function InteriorMaterialsPanel({ projectId }: { projectId: string }) {
  const t = useT(useLang().lang)
  const [list, setList] = React.useState<InteriorMaterialSpec[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorMaterialSpec | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [uploadingImage, setUploadingImage] = React.useState(false)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorMaterialSpecs({ projectId })
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
      materialCode: "",
      materialName: "",
      spec: "",
      supplier: "",
      unit: "EA",
      unitCost: 0,
      imageUrl: "",
      location: "",
      note: "",
      sortOrder: list.length,
    })
  }

  const handleSave = async () => {
    if (!editing || !editing.materialName?.trim()) {
      await appAlert(t("interiorMaterialNameRequired"))
      return
    }
    try {
      const res = await saveInteriorMaterialSpec({
        ...editing,
        projectId: Number(projectId),
        materialName: editing.materialName.trim(),
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
      const res = await deleteInteriorMaterialSpec({ id })
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

  const handleUploadImage = async (file?: File | null) => {
    if (!file || !editing) return
    setUploadingImage(true)
    try {
      const res = await uploadInteriorFile({
        projectId: Number(projectId),
        fileType: "material-image",
        file,
      })
      if (res.success && res.url) {
        setEditing({ ...editing, imageUrl: res.url })
        await appAlert(t("interiorImageUploadOk"))
      } else {
        await appAlert(res.message || t("msg_upload_fail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <PackageSearch className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("interiorMaterialsPageTitle")}</h2>
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
                <label className="text-xs text-muted-foreground">{t("interiorMaterialCode")}</label>
                <Input value={editing.materialCode || ""} onChange={(e) => setEditing({ ...editing, materialCode: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorMaterialNameLabel")}</label>
                <Input value={editing.materialName || ""} onChange={(e) => setEditing({ ...editing, materialName: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("spec")}</label>
                <Input value={editing.spec || ""} onChange={(e) => setEditing({ ...editing, spec: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSupplier")}</label>
                <Input value={editing.supplier || ""} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorUnitLabel")}</label>
                <Input value={editing.unit || ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorUnitCost")}</label>
                <Input type="number" value={editing.unitCost ?? 0} onChange={(e) => setEditing({ ...editing, unitCost: Number(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorStorageUseLocation")}</label>
                <Input value={editing.location || ""} onChange={(e) => setEditing({ ...editing, location: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorImageUrlLabel")}</label>
                <Input value={editing.imageUrl || ""} onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorImageFileUploadLabel")}</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleUploadImage(e.target.files?.[0] || null)}
                  disabled={uploadingImage}
                />
                {uploadingImage ? <div className="mt-1 text-xs text-muted-foreground">{t("interiorUploadingShort")}</div> : null}
              </div>
              {editing.imageUrl ? (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">{t("interiorImagePreview")}</div>
                  <Image src={editing.imageUrl} alt={editing.materialName || "material"} width={96} height={96} className="h-24 w-24 rounded border object-cover" unoptimized />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorMemo")}</label>
                <Input value={editing.note || ""} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
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
            <div className="py-12 text-center text-sm text-muted-foreground">{t("interiorMaterialsEmpty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("interiorColImage")}</TableHead>
                  <TableHead>{t("posMenuCode")}</TableHead>
                  <TableHead>{t("interiorMaterialNameLabel")}</TableHead>
                  <TableHead>{t("spec")}</TableHead>
                  <TableHead>{t("interiorSupplier")}</TableHead>
                  <TableHead className="w-20">{t("interiorUnitLabel")}</TableHead>
                  <TableHead className="w-24 text-right">{t("interiorUnitCost")}</TableHead>
                  <TableHead className="w-24">{t("interiorLocation")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.materialName || "material"} width={40} height={40} className="h-10 w-10 rounded border object-cover" unoptimized />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.materialCode || "—"}</TableCell>
                    <TableCell className="font-medium">{item.materialName}</TableCell>
                    <TableCell className="text-xs">{item.spec || "—"}</TableCell>
                    <TableCell className="text-xs">{item.supplier || "—"}</TableCell>
                    <TableCell className="text-xs">{item.unit || "—"}</TableCell>
                    <TableCell className="text-right font-mono">฿{(item.unitCost ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{item.location || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => item.id && handleDelete(item.id)}
                          disabled={deletingId === item.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
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
