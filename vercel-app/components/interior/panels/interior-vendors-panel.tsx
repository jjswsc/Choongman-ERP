"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { HandCoins, Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import {
  getInteriorVendorTracks,
  saveInteriorVendorTrack,
  deleteInteriorVendorTrack,
  getInteriorWorkPackages,
  getInteriorVendorDirectory,
  type InteriorVendorTrack,
  type InteriorWorkPackage,
  type InteriorVendorDirectoryEntry,
} from "@/lib/api-client"
const VENDOR_STATUS: { value: string; labelKey: string }[] = [
  { value: "planned", labelKey: "interiorVnPlanned" },
  { value: "ordered", labelKey: "interiorVnOrdered" },
  { value: "paid", labelKey: "interiorVnPaid" },
  { value: "received", labelKey: "interiorVnReceived" },
  { value: "done", labelKey: "interiorVnDone" },
  { value: "delayed", labelKey: "interiorVnDelayed" },
  { value: "cancelled", labelKey: "interiorVnCancelled" },
]

function vendorStatusLabel(t: (k: string) => string, status?: string) {
  const row = VENDOR_STATUS.find((x) => x.value === status)
  return row ? t(row.labelKey) : status || t("interiorVnPlanned")
}

function todayBangkokYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function getDelayReasonKey(item: InteriorVendorTrack, todayYmd: string): "payment" | "material" | "work" | null {
  const status = String(item.status || "")
  if (status === "done" || status === "cancelled") return null

  if (item.paymentDueDate && !item.paymentPaidDate && item.paymentDueDate < todayYmd) {
    return "payment"
  }
  if (item.materialEtaDate && !item.materialReceivedDate && item.materialEtaDate < todayYmd) {
    return "material"
  }
  if (item.workCompletedDate && status !== "done" && item.workCompletedDate < todayYmd) {
    return "work"
  }
  return null
}

function delayLabel(t: (k: string) => string, key: "payment" | "material" | "work") {
  if (key === "payment") return t("interiorDelayPayment")
  if (key === "material") return t("interiorDelayMaterial")
  return t("interiorDelayWork")
}

export function InteriorVendorsPanel({ projectId, embedded = false }: { projectId: string; embedded?: boolean }) {
  const t = useT(useLang().lang)
  const [list, setList] = React.useState<InteriorVendorTrack[]>([])
  const [vendorDirectory, setVendorDirectory] = React.useState<InteriorVendorDirectoryEntry[]>([])
  const [workPackages, setWorkPackages] = React.useState<InteriorWorkPackage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [editing, setEditing] = React.useState<InteriorVendorTrack | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const todayYmd = React.useMemo(() => todayBangkokYmd(), [])

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      getInteriorVendorTracks({ projectId }).catch(() => []),
      getInteriorWorkPackages({ projectId }).catch(() => []),
      getInteriorVendorDirectory().catch(() => []),
    ])
      .then(([tracks, packages, directory]) => {
        setList(tracks || [])
        setWorkPackages((packages || []).filter((x) => !x.isLegacy))
        setVendorDirectory(directory || [])
      })
      .finally(() => setLoading(false))
  }, [projectId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleAdd = () => {
    setEditing({
      projectId: Number(projectId),
      vendorName: "",
      status: "planned",
      amount: 0,
      sortOrder: list.length,
    })
  }

  const handleSave = async () => {
    if (!editing || !editing.vendorName?.trim()) {
      await appAlert(t("interiorVendorNameRequired"))
      return
    }
    if (!String(editing.vendorCode || "").trim()) {
      await appAlert(`${t("posMenuCode")} ${t("required")}`)
      return
    }
    try {
      const res = await saveInteriorVendorTrack({
        ...editing,
        projectId: Number(projectId),
        vendorName: editing.vendorName.trim(),
        vendorCode: String(editing.vendorCode || "").trim(),
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
      const res = await deleteInteriorVendorTrack({ id })
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

  const pickVendorFromDirectory = (entry: InteriorVendorDirectoryEntry) => {
    if (!editing) return
    setEditing({
      ...editing,
      vendorName: entry.name || editing.vendorName,
      vendorCode: entry.code || editing.vendorCode,
    })
  }

  const frequentVendors = React.useMemo(() => {
    return [...vendorDirectory]
      .sort((a, b) => (b.useCount ?? 0) - (a.useCount ?? 0) || String(a.name).localeCompare(String(b.name)))
      .slice(0, 8)
  }, [vendorDirectory])

  const outerClass = embedded
    ? "space-y-4"
    : "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4"

  return (
    <div className={embedded ? "" : "flex-1 overflow-auto"}>
      <div className={outerClass}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <HandCoins className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">{t("interiorVendorTracks")}</h2>
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
                <label className="text-xs text-muted-foreground">{t("interiorVendorName")}</label>
                <Input
                  list="interior-vendor-name-options"
                  value={editing.vendorName || ""}
                  onChange={(e) => setEditing({ ...editing, vendorName: e.target.value })}
                  placeholder={t("interiorVendorNamePh")}
                />
                <datalist id="interior-vendor-name-options">
                  {vendorDirectory.map((v) => (
                    <option key={v.id ?? v.name} value={v.name || ""} />
                  ))}
                </datalist>
                {frequentVendors.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {frequentVendors.map((v) => (
                      <Button
                        key={v.id ?? v.name}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => pickVendorFromDirectory(v)}
                      >
                        {v.name}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("posMenuCode")}</label>
                <Input
                  list="interior-vendor-code-options"
                  value={editing.vendorCode || ""}
                  onChange={(e) => setEditing({ ...editing, vendorCode: e.target.value })}
                  placeholder={t("interiorVendorCodePh")}
                />
                <datalist id="interior-vendor-code-options">
                  {vendorDirectory
                    .filter((v) => v.code)
                    .map((v) => (
                      <option key={v.id ?? v.code} value={v.code || ""} />
                    ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorWorkPackageLink")}</label>
                <Select
                  value={editing.workPackageId ? String(editing.workPackageId) : "__none__"}
                  onValueChange={(value) =>
                    setEditing({ ...editing, workPackageId: value === "__none__" ? null : Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("interiorUnassigned")}</SelectItem>
                    {workPackages.map((wp) => (
                      <SelectItem key={wp.id} value={String(wp.id)}>
                        {wp.title || tr(t, "interiorWpNumber", { n: String(wp.id) })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("status")}</label>
                <Select
                  value={editing.status || "planned"}
                  onValueChange={(value) => setEditing({ ...editing, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VENDOR_STATUS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorSumAmount")}</label>
                <Input
                  type="number"
                  value={editing.amount ?? 0}
                  onChange={(e) => setEditing({ ...editing, amount: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorPaymentDue")}</label>
                <Input
                  type="date"
                  value={editing.paymentDueDate || ""}
                  onChange={(e) => setEditing({ ...editing, paymentDueDate: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorPaymentPaid")}</label>
                <Input
                  type="date"
                  value={editing.paymentPaidDate || ""}
                  onChange={(e) => setEditing({ ...editing, paymentPaidDate: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorMaterialEtaShort")}</label>
                <Input
                  type="date"
                  value={editing.materialEtaDate || ""}
                  onChange={(e) => setEditing({ ...editing, materialEtaDate: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorMaterialReceivedShort")}</label>
                <Input
                  type="date"
                  value={editing.materialReceivedDate || ""}
                  onChange={(e) => setEditing({ ...editing, materialReceivedDate: e.target.value || null })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorWorkCompleted")}</label>
                <Input
                  type="date"
                  value={editing.workCompletedDate || ""}
                  onChange={(e) => setEditing({ ...editing, workCompletedDate: e.target.value || null })}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="text-xs text-muted-foreground">{t("interiorMemo")}</label>
                <Input
                  value={editing.note || ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder={t("interiorVendorNotePh")}
                />
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
            <div className="py-12 text-center text-sm text-muted-foreground">{t("interiorVendorEmpty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("interiorVendorName")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="w-24">{t("interiorDelayFlag")}</TableHead>
                  <TableHead className="w-28">{t("interiorPaymentDue")}</TableHead>
                  <TableHead className="w-28">{t("interiorPaymentPaid")}</TableHead>
                  <TableHead className="w-28">{t("interiorMaterialEtaShort")}</TableHead>
                  <TableHead className="w-28">{t("interiorMaterialReceivedShort")}</TableHead>
                  <TableHead className="w-28">{t("interiorWorkCompleted")}</TableHead>
                  <TableHead className="w-24 text-right">{t("interiorSumAmount")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((item) => {
                  const delayKey = getDelayReasonKey(item, todayYmd)
                  const isDelayed = Boolean(delayKey)
                  return (
                  <TableRow key={item.id} className={isDelayed ? "bg-red-50/60 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-medium">{item.vendorName || "—"}</TableCell>
                    <TableCell className="text-xs">{vendorStatusLabel(t, item.status)}</TableCell>
                    <TableCell className="text-xs">
                      {isDelayed && delayKey ? (
                        <span className="inline-flex rounded px-2 py-0.5 text-[11px] font-medium text-red-600 bg-red-100 dark:bg-red-900/40">
                          {delayLabel(t, delayKey)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("interiorDelayOk")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{item.paymentDueDate || "—"}</TableCell>
                    <TableCell className="text-xs">{item.paymentPaidDate || "—"}</TableCell>
                    <TableCell className="text-xs">{item.materialEtaDate || "—"}</TableCell>
                    <TableCell className="text-xs">{item.materialReceivedDate || "—"}</TableCell>
                    <TableCell className="text-xs">{item.workCompletedDate || "—"}</TableCell>
                    <TableCell className="text-right font-mono">฿{(item.amount ?? 0).toLocaleString()}</TableCell>
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
                )})}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
