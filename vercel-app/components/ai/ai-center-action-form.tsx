"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import type { AiActionType } from "@/lib/ai-center-client"
import { AiCenterStoreSelect, AI_CENTER_ALL_STORE } from "@/components/ai/ai-center-shared"

export type AiActionFormValues = Record<string, unknown>

type Props = {
  t: (k: string) => string
  actionType: AiActionType
  values: AiActionFormValues
  onChange: (next: AiActionFormValues) => void
  stores: string[]
  canSelectAllStore: boolean
  showAdvancedJson: boolean
  payloadText: string
  onPayloadTextChange: (v: string) => void
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

export function buildActionPayloadFromForm(actionType: AiActionType, values: AiActionFormValues): Record<string, unknown> {
  switch (actionType) {
    case "create_notice_draft":
    case "create_weather_campaign_draft":
      return {
        title: String(values.title || "").trim(),
        content: String(values.content || "").trim(),
        targetStore: String(values.targetStore || AI_CENTER_ALL_STORE).trim() || AI_CENTER_ALL_STORE,
      }
    case "create_followup_task":
    case "create_shift_adjustment_draft":
      return {
        taskTitle: String(values.taskTitle || "").trim(),
        description: String(values.description || "").trim(),
        owner: String(values.owner || "").trim(),
        storeScope: String(values.storeScope || AI_CENTER_ALL_STORE).trim() || AI_CENTER_ALL_STORE,
        dueDate: String(values.dueDate || "").trim(),
      }
    case "update_followup_task_status":
      return {
        taskId: Number(values.taskId || 0),
        status: String(values.status || "in_progress"),
      }
    case "save_accounting_workflow_status":
      return {
        yearMonth: String(values.yearMonth || "").trim(),
        filingType: String(values.filingType || "vat").trim(),
        status: String(values.status || "in_progress").trim(),
        storeScope: String(values.storeScope || AI_CENTER_ALL_STORE).trim() || AI_CENTER_ALL_STORE,
        note: String(values.note || "").trim(),
        owner: String(values.owner || "").trim(),
      }
    default:
      return values
  }
}

export function defaultActionFormValues(
  actionType: AiActionType,
  t: (k: string) => string
): AiActionFormValues {
  switch (actionType) {
    case "create_notice_draft":
      return {
        title: t("aiCenterSampleNoticeTitle"),
        content: t("aiCenterSampleNoticeContent"),
        targetStore: AI_CENTER_ALL_STORE,
      }
    case "create_weather_campaign_draft":
      return {
        title: t("aiCenterSampleWeatherTitle"),
        content: t("aiCenterSampleWeatherContent"),
        targetStore: AI_CENTER_ALL_STORE,
      }
    case "create_followup_task":
      return {
        taskTitle: t("aiCenterSampleTaskTitle"),
        description: t("aiCenterSampleTaskDesc"),
        owner: "",
        storeScope: AI_CENTER_ALL_STORE,
        dueDate: "",
      }
    case "create_shift_adjustment_draft":
      return {
        taskTitle: t("aiCenterSampleShiftTitle"),
        description: t("aiCenterSampleShiftDesc"),
        owner: "",
        storeScope: AI_CENTER_ALL_STORE,
        dueDate: "",
      }
    case "update_followup_task_status":
      return { taskId: 1, status: "in_progress" }
    case "save_accounting_workflow_status":
      return {
        yearMonth: "2026-04",
        filingType: "vat",
        status: "in_progress",
        storeScope: AI_CENTER_ALL_STORE,
        note: t("aiCenterSampleAccountingNote"),
        owner: "",
      }
    default:
      return {}
  }
}

export function AiCenterActionForm({
  t,
  actionType,
  values,
  onChange,
  stores,
  canSelectAllStore,
  showAdvancedJson,
  payloadText,
  onPayloadTextChange,
}: Props) {
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v })

  const storeField = (key: "targetStore" | "storeScope", label: string) => (
    <Field label={label}>
      <AiCenterStoreSelect
        value={String(values[key] || AI_CENTER_ALL_STORE)}
        onChange={(v) => set(key, v)}
        stores={stores}
        canSelectAll={canSelectAllStore}
        allLabel={t("aiCenterPlaceholderAll")}
        className="h-9"
      />
    </Field>
  )

  let formBody: React.ReactNode = null
  if (actionType === "create_notice_draft" || actionType === "create_weather_campaign_draft") {
    formBody = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("aiCenterFormTitle")}>
          <Input value={String(values.title || "")} onChange={(e) => set("title", e.target.value)} />
        </Field>
        {storeField("targetStore", t("stockFilterStore"))}
        <div className="sm:col-span-2">
          <Field label={t("aiCenterFormContent")}>
            <Textarea
              className="min-h-[120px]"
              value={String(values.content || "")}
              onChange={(e) => set("content", e.target.value)}
            />
          </Field>
        </div>
      </div>
    )
  } else if (actionType === "create_followup_task" || actionType === "create_shift_adjustment_draft") {
    formBody = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("aiCenterFormTaskTitle")}>
          <Input value={String(values.taskTitle || "")} onChange={(e) => set("taskTitle", e.target.value)} />
        </Field>
        {storeField("storeScope", t("stockFilterStore"))}
        <Field label={t("aiCenterFormOwner")}>
          <Input value={String(values.owner || "")} onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <Field label={t("aiCenterFormDueDate")}>
          <Input type="date" value={String(values.dueDate || "")} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("aiCenterFormDescription")}>
            <Textarea
              className="min-h-[100px]"
              value={String(values.description || "")}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
        </div>
      </div>
    )
  } else if (actionType === "update_followup_task_status") {
    formBody = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("aiCenterFormTaskId")}>
          <Input
            type="number"
            value={String(values.taskId ?? "")}
            onChange={(e) => set("taskId", Number(e.target.value))}
          />
        </Field>
        <Field label={t("aiCenterFormStatus")}>
          <Select value={String(values.status || "in_progress")} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">{t("aiCenterFormStatusTodo")}</SelectItem>
              <SelectItem value="in_progress">{t("aiCenterFormStatusInProgress")}</SelectItem>
              <SelectItem value="done">{t("aiCenterFormStatusDone")}</SelectItem>
              <SelectItem value="cancelled">{t("aiCenterFormStatusCancelled")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    )
  } else if (actionType === "save_accounting_workflow_status") {
    formBody = (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("aiCenterFormYearMonth")}>
          <Input
            placeholder="YYYY-MM"
            value={String(values.yearMonth || "")}
            onChange={(e) => set("yearMonth", e.target.value)}
          />
        </Field>
        <Field label={t("aiCenterFormFilingType")}>
          <Input value={String(values.filingType || "")} onChange={(e) => set("filingType", e.target.value)} />
        </Field>
        {storeField("storeScope", t("stockFilterStore"))}
        <Field label={t("aiCenterFormStatus")}>
          <Select value={String(values.status || "in_progress")} onValueChange={(v) => set("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">{t("aiCenterFormStatusTodo")}</SelectItem>
              <SelectItem value="in_progress">{t("aiCenterFormStatusInProgress")}</SelectItem>
              <SelectItem value="review">{t("aiCenterFormStatusReview")}</SelectItem>
              <SelectItem value="done">{t("aiCenterFormStatusDone")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("aiCenterFormOwner")}>
          <Input value={String(values.owner || "")} onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("aiCenterFormNote")}>
            <Textarea className="min-h-[80px]" value={String(values.note || "")} onChange={(e) => set("note", e.target.value)} />
          </Field>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {formBody}
      {showAdvancedJson ? (
        <Field label={t("aiCenterPayloadJson")}>
          <Textarea
            className="min-h-[180px] font-mono text-xs"
            value={payloadText}
            onChange={(e) => onPayloadTextChange(e.target.value)}
          />
        </Field>
      ) : null}
    </div>
  )
}
