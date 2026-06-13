"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { InteriorProject } from "@/lib/api-client"
import { useStoreList } from "@/lib/api-client"

interface InteriorProjectFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: Partial<InteriorProject> | null
  onSave: (data: Partial<InteriorProject> & { code: string; name: string }) => Promise<void>
  t: (key: string) => string
}

const STATUS_OPTIONS = [
  { value: "active", labelKey: "interiorProjStatusActive" },
  { value: "completed", labelKey: "interiorProjStatusCompleted" },
  { value: "hold", labelKey: "interiorProjStatusHold" },
]

export function InteriorProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSave,
  t,
}: InteriorProjectFormDialogProps) {
  const { posStores, formatStoreLabel } = useStoreList()
  const [code, setCode] = React.useState("")
  const [name, setName] = React.useState("")
  const [location, setLocation] = React.useState("")
  const [status, setStatus] = React.useState("active")
  const [budgetTotal, setBudgetTotal] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const isEdit = !!project?.id

  React.useEffect(() => {
    if (open) {
      setCode(project?.code ?? "")
      setName(project?.name ?? "")
      setLocation(project?.location ?? "")
      setStatus(project?.status ?? "active")
      setBudgetTotal(project?.budgetTotal != null ? String(project.budgetTotal) : "")
      setStartDate(project?.startDate ?? "")
      setEndDate(project?.endDate ?? "")
    }
  }, [open, project])

  const handleSave = async () => {
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    if (!trimmedCode || !trimmedName) {
      await appAlert(t("msg_save_fail_detail"))
      return
    }
    setSaving(true)
    try {
      await onSave({
        id: project?.id,
        code: trimmedCode,
        name: trimmedName,
        location: location.trim() || undefined,
        status,
        budgetTotal: budgetTotal ? Number(budgetTotal) : 0,
        startDate: startDate || null,
        endDate: endDate || null,
      })
      onOpenChange(false)
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("edit") : t("add")} — {t("interiorProject")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">{t("interiorProjectCode")}</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="FP-RANGSIT, HUAMARK"
              disabled={isEdit}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("interiorProjectName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CM Future Park Rangsit"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("interiorSelectStore")}</Label>
            <Select
              value={location.trim() ? location : "__none__"}
              onValueChange={(v) => setLocation(v === "__none__" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("interiorSelectStorePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("interiorSelectStorePlaceholder")}</SelectItem>
                {posStores.map((store) => (
                  <SelectItem key={store} value={store}>
                    {formatStoreLabel(store)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("interiorLocation")}</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("interiorLocationPh")}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">{t("interiorBudget")}</Label>
            <Input
              type="number"
              value={budgetTotal}
              onChange={(e) => setBudgetTotal(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">{t("dateFrom")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t("dateTo")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "..." : t("itemsBtnSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
