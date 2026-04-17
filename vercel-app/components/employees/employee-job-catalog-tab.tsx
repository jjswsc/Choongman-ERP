"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getEmployeeJobCatalog, saveEmployeeJobCatalog } from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"

export function EmployeeJobCatalogTab({
  t,
  onSaved,
}: {
  t: (k: string) => string
  onSaved?: () => void
}) {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [canEdit, setCanEdit] = React.useState(false)
  const [jobs, setJobs] = React.useState<string[]>([])
  const [inUseOutside, setInUseOutside] = React.useState<string[]>([])
  const [addText, setAddText] = React.useState("")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getEmployeeJobCatalog()
      setJobs(res.catalog || [])
      setInUseOutside(res.jobsInUseOutsideCatalog || [])
      setCanEdit(!!res.canEdit)
    } catch (e) {
      console.error(e)
      setJobs([])
      setInUseOutside([])
      setCanEdit(false)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const addJob = () => {
    const s = addText.trim().slice(0, 80)
    if (!s) return
    if (jobs.some((j) => j.toLowerCase() === s.toLowerCase())) {
      setAddText("")
      return
    }
    setJobs((prev) => [...prev, s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })))
    setAddText("")
  }

  const removeAt = (idx: number) => {
    setJobs((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const res = await saveEmployeeJobCatalog(jobs)
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_saved"))
        await load()
        onSaved?.()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      }
    } catch (e) {
      console.error(e)
      await appAlert(t("msg_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {t("loading")}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("emp_job_catalog_title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("emp_job_catalog_desc")}</p>
      </div>

      <ul className="rounded-lg border border-border divide-y divide-border bg-card">
        {jobs.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t("emp_result_empty")}</li>
        ) : (
          jobs.map((j, idx) => (
            <li key={`${j}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm font-medium">{j}</span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  title={t("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t("emp_job_catalog_add")}</label>
            <Input
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addJob()
                }
              }}
              placeholder="HR, Interior, …"
              className="h-9"
            />
          </div>
          <Button type="button" variant="secondary" size="sm" className="h-9" onClick={addJob}>
            <Plus className="h-4 w-4 mr-1" />
            {t("btn_add")}
          </Button>
        </div>
      ) : null}

      {inUseOutside.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <p className="font-medium">{t("emp_job_catalog_in_use_title")}</p>
          <p className="mt-1 text-amber-800/90 dark:text-amber-200/90">{t("emp_job_catalog_in_use_desc")}</p>
          <ul className="mt-2 list-disc pl-4">
            {inUseOutside.map((j) => (
              <li key={j}>{j}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {canEdit ? (
        <Button type="button" className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={saving || jobs.length === 0}>
          {saving ? t("loading") : t("emp_save")}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">{t("emp_job_catalog_readonly")}</p>
      )}
    </div>
  )
}
