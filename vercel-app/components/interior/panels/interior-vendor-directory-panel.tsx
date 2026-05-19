"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Building2, Plus, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
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
  getInteriorVendorDirectory,
  saveInteriorVendorDirectory,
  deleteInteriorVendorDirectory,
  type InteriorVendorDirectoryEntry,
} from "@/lib/api-client"
import { InteriorVendorSectionTabs } from "@/components/interior/interior-vendor-section-tabs"

function formatBangkokDateTime(iso: string | null | undefined) {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso))
  } catch {
    return iso.slice(0, 16)
  }
}

export function InteriorVendorDirectoryPanel() {
  const t = useT(useLang().lang)
  const [list, setList] = React.useState<InteriorVendorDirectoryEntry[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showInactive, setShowInactive] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [editing, setEditing] = React.useState<InteriorVendorDirectoryEntry | null>(null)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)

  const loadData = React.useCallback(() => {
    setLoading(true)
    getInteriorVendorDirectory({ includeInactive: showInactive })
      .then((rows) => setList(rows || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [showInactive])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((row) => {
      const hay = [
        row.name,
        row.code,
        row.contactName,
        row.phone,
        row.specialty,
        row.memo,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return hay.includes(q)
    })
  }, [list, search])

  const handleAdd = () => {
    setEditing({
      name: "",
      code: "",
      isActive: true,
      sortOrder: list.length,
    })
  }

  const handleSave = async () => {
    if (!editing?.name?.trim()) {
      await appAlert(t("interiorVendorNameRequired"))
      return
    }
    try {
      const res = await saveInteriorVendorDirectory({
        ...editing,
        name: editing.name.trim(),
        code: editing.code?.trim() || "",
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
      const res = await deleteInteriorVendorDirectory({ id })
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
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <InteriorVendorSectionTabs active="directory" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{t("interiorVendorDirectory")}</h2>
              <p className="text-xs text-muted-foreground">{t("interiorVendorDirectoryHint")}</p>
            </div>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            {t("add")}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="max-w-sm h-9"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={showInactive}
              onCheckedChange={(v) => setShowInactive(v === true)}
            />
            {t("interiorVendorDirectoryShowInactive")}
          </label>
        </div>

        {editing && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorVendorName")} *</label>
                <Input
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder={t("interiorVendorNamePh")}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("posMenuCode")}</label>
                <Input
                  value={editing.code || ""}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  placeholder={t("interiorVendorCodePh")}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorVendorContactName")}</label>
                <Input
                  value={editing.contactName || ""}
                  onChange={(e) => setEditing({ ...editing, contactName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("emp_label_phone")}</label>
                <Input
                  value={editing.phone || ""}
                  onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("emp_label_email")}</label>
                <Input
                  value={editing.email || ""}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("emp_address")}</label>
                <Input
                  value={editing.address || ""}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("interiorVendorSpecialty")}</label>
                <Input
                  value={editing.specialty || ""}
                  onChange={(e) => setEditing({ ...editing, specialty: e.target.value })}
                  placeholder={t("interiorVendorSpecialtyPh")}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t("interiorMemo")}</label>
                <Input
                  value={editing.memo || ""}
                  onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Checkbox
                  id="interior-vendor-active"
                  checked={editing.isActive !== false}
                  onCheckedChange={(v) => setEditing({ ...editing, isActive: v === true })}
                />
                <label htmlFor="interior-vendor-active" className="text-xs">
                  {t("interiorVendorDirectoryActive")}
                </label>
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
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">{t("interiorVendorDirectoryEmpty")}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("interiorVendorName")}</TableHead>
                  <TableHead className="w-24">{t("posMenuCode")}</TableHead>
                  <TableHead>{t("interiorVendorSpecialty")}</TableHead>
                  <TableHead>{t("emp_label_phone")}</TableHead>
                  <TableHead className="w-16 text-right">{t("interiorVendorUseCount")}</TableHead>
                  <TableHead className="w-36">{t("interiorVendorLastUsed")}</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((item) => (
                  <TableRow key={item.id} className={item.isActive === false ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{item.name || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{item.code || "—"}</TableCell>
                    <TableCell className="text-xs">{item.specialty || "—"}</TableCell>
                    <TableCell className="text-xs">{item.phone || item.contactName || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{item.useCount ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatBangkokDateTime(item.lastUsedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(item)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
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
