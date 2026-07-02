"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { CircleHelp, Image as ImageIcon, Upload, Download } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { compressImageForUpload, cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { BANK_OPTIONS, BANK_OTHER } from "@/lib/bank-options"
import { EMPLOYEE_NAME_TITLE_CANONICAL } from "@/lib/employee-display-name"
import { labelForStore } from "@/lib/store-list-keys"
import { getEmployeeJobOptionLabel } from "@/lib/employee-job-catalog"
import { isOfficeStore } from "@/lib/permissions"
import { canViewOfficeEmployeePayroll, type OfficePayrollAuth } from "@/lib/office-payroll-access"
import { IdCardCaptureDialog } from "@/components/employees/id-card-capture-dialog"
import { ID_CARD_ASPECT } from "@/lib/id-card-image"

const SAL_TYPE_OPTIONS = ["Monthly", "Hourly", "Part-time"] as const
const ROLE_OPTIONS = ["Staff", "Manager", "Franchisee", "Officer", "Director"]
const GRADE_OPTIONS = ["", "S", "A", "B", "C", "F"]

/** 급여·수당 입력: 콤마 표시, 저장 값은 정수(바트) */
function parseBahtAmountInput(raw: string): number {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return 0
  const n = Number(digits)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

function formatBahtAmountInput(n: number): string {
  if (n === 0 || !Number.isFinite(n)) return ""
  return Math.trunc(n).toLocaleString("en-US")
}

function gradeBadgeStyle(g: string): string {
  const v = String(g || "-").trim().toUpperCase()
  if (v === "A" || v === "S") return "bg-[#1B5E20] text-white"
  if (v === "B") return "bg-[#0D47A1] text-white"
  if (v === "C") return "bg-[#F57F17] text-[#1a1a1a]"
  if (v === "D") return "bg-[#BF360C] text-white"
  if (v === "F" || v === "E") return "bg-[#3E2723] text-white"
  return "bg-gray-500 text-white"
}

/** 직원 폼 입력 공통 스타일 */
const EMP_FIELD_BASE =
  "h-9 w-full rounded-md border text-sm shadow-sm transition-colors placeholder:text-muted-foreground/60 hover:border-primary/35 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
const fieldInputCn = cn(
  EMP_FIELD_BASE,
  "border-border/80 bg-muted/35 text-foreground focus-visible:bg-background"
)
const fieldAmountCn = cn(
  EMP_FIELD_BASE,
  "border-emerald-200/80 bg-emerald-50/50 font-medium tabular-nums text-foreground focus-visible:bg-emerald-50/80 dark:border-emerald-900/60 dark:bg-emerald-950/25"
)
const fieldDateCn = cn(
  EMP_FIELD_BASE,
  "border-sky-200/80 bg-sky-50/40 text-foreground focus-visible:bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/20"
)
const fieldSensitiveCn = cn(
  EMP_FIELD_BASE,
  "border-amber-200/80 bg-amber-50/40 text-foreground focus-visible:bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20"
)
const sectionBasicCn =
  "rounded-lg border border-sky-200/70 bg-sky-50/30 px-1.5 data-[state=open]:border-sky-400/50 dark:border-sky-900/50 dark:bg-sky-950/15"
const sectionIdCn =
  "rounded-lg border border-amber-200/70 bg-amber-50/30 px-1.5 data-[state=open]:border-amber-400/50 dark:border-amber-900/50 dark:bg-amber-950/15"
const sectionAccountingCn =
  "rounded-lg border border-emerald-200/70 bg-emerald-50/30 px-1.5 data-[state=open]:border-emerald-400/50 dark:border-emerald-900/50 dark:bg-emerald-950/15"

/** 라벨·입력 한 줄 — 라벨 폭·왼쪽 정렬 */
const EMP_FORM_LABEL_WIDTH = "w-[4.5rem]"

function FormField({
  label,
  hint,
  children,
  className,
  variant = "default",
  labelWidth = EMP_FORM_LABEL_WIDTH,
  align = "center",
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
  variant?: "default" | "amount" | "date" | "sensitive"
  /** 라벨 고정 폭 (한 줄 배치) */
  labelWidth?: string
  align?: "center" | "start"
}) {
  const variantBorder =
    variant === "amount"
      ? "border-emerald-300/60 dark:border-emerald-800/50"
      : variant === "date"
        ? "border-sky-300/60 dark:border-sky-800/50"
        : variant === "sensitive"
          ? "border-amber-300/60 dark:border-amber-800/50"
          : "border-border/60"
  return (
    <div
      className={cn(
        "flex gap-1.5 rounded-md border bg-background/60 px-1 py-1 shadow-sm",
        align === "start" ? "items-start" : "items-center",
        variantBorder,
        className
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-start gap-0.5",
          labelWidth,
          align === "start" && "pt-2"
        )}
      >
        <label className="truncate text-left text-sm font-semibold leading-tight text-foreground" title={label}>
          {label}
        </label>
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={hint}
              >
                <CircleHelp className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-left text-sm">
              {hint}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export const EMP_NAME_TITLE_OPTIONS = EMPLOYEE_NAME_TITLE_CANONICAL

export interface EmployeeFormData {
  row: number
  store: string
  name: string
  nameTitle: string
  /** 직원 코드(AA999) */
  employeeCode: string
  nick: string
  phone: string
  job: string
  email: string
  birth: string
  nation: string
  join: string
  resign: string
  salType: string
  salAmt: number
  pw: string
  role: string
  idNumber: string
  idCardPhoto: string
  taxId: string
  ssoNumber: string
  /** 급여 계산 시 SSO 공제 제외 + PND3용 3% 원천세 대상 */
  ssoExempt: boolean
  /** 오피스(본사) 급여 조회·계산·확정 담당 */
  canManageOfficePayroll: boolean
  address: string
  bankName: string
  accountNumber: string
  positionAllowance: number
  riskAllowance: number
  attendanceAllowance: number
  grade: string
  /** 매니저 평가 등급(표시 전용·저장 payload에서 제외) */
  managerGradeDisplay: string
  photo: string
  /** 가맹점주 추가 매장 (대표 store 제외) */
  extraStores: string[]
}

const emptyForm: EmployeeFormData = {
  row: 0,
  store: "",
  name: "",
  nameTitle: "",
  employeeCode: "",
  nick: "",
  phone: "",
  job: "Service",
  email: "",
  birth: "",
  nation: "",
  join: "",
  resign: "",
  salType: "Monthly",
  salAmt: 0,
  pw: "",
  role: "Staff",
  idNumber: "",
  idCardPhoto: "",
  taxId: "",
  ssoNumber: "",
  ssoExempt: false,
  canManageOfficePayroll: false,
  address: "",
  bankName: "",
  accountNumber: "",
  positionAllowance: 0,
  riskAllowance: 0,
  attendanceAllowance: 500,
  grade: "",
  managerGradeDisplay: "",
  photo: "",
  extraStores: [],
}

interface EmployeeFormProps {
  form: EmployeeFormData
  onChange: (form: EmployeeFormData) => void
  stores: string[]
  /** erp_stores 연동 시 매장 Select 표시명 */
  storeLabels?: Record<string, string>
  /** 직무 옵션 (Supabase employees.job 기준). 없으면 기본 4종 + Logistic */
  jobOptions?: string[]
  onSave: () => void
  onNew: () => void
  saving?: boolean
  /** 매장 매니저일 때 true — 권한(role) 수정 불가 */
  roleDisabled?: boolean
  /** false면 Officer 선택 불가(단, 이미 Officer인 직원은 유지·하향만 가능) */
  canAssignOfficerRole?: boolean
  /** false면 Director 선택 불가(단, 이미 Director인 직원은 유지·하향만 가능) */
  canAssignDirectorRole?: boolean
  /** false면 오피스 급여 담당 체크 불가 */
  canAssignOfficePayrollManager?: boolean
  /** 시스템 설정: 가맹점주 복수 매장 사용 */
  franchiseeMultiEnabled?: boolean
  /** 본사 등 추가 매장 편집 가능 */
  canEditFranchiseeExtraStores?: boolean
  /** 추가 매장 체크박스 후보(전체 매장 목록) */
  allStoresForFranchiseePick?: string[]
  /** 대표 매장 포함 최대 매장 수 */
  franchiseeMultiMaxStores?: number
  /** Sheet 등 외부 컨테이너에 넣을 때 — 카드 헤더·테두리 제거 */
  embedded?: boolean
  /** 오피스(본사) 직원 급여·계좌 편집 권한 */
  officePayrollAuth?: OfficePayrollAuth
}

const DEFAULT_JOB_OPTIONS = ["Service", "Kitchen", "Franchise", "Officer", "Director", "Logistic"]

export function EmployeeForm({
  form,
  onChange,
  stores,
  storeLabels = {},
  jobOptions = DEFAULT_JOB_OPTIONS,
  onSave,
  onNew,
  saving = false,
  roleDisabled = false,
  canAssignOfficerRole = false,
  canAssignDirectorRole = false,
  canAssignOfficePayrollManager = false,
  franchiseeMultiEnabled = false,
  canEditFranchiseeExtraStores = false,
  allStoresForFranchiseePick = [],
  franchiseeMultiMaxStores = 5,
  embedded = false,
  officePayrollAuth,
}: EmployeeFormProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const photoInputRef = React.useRef<HTMLInputElement>(null)
  const [idCardCaptureOpen, setIdCardCaptureOpen] = React.useState(false)
  const update = (k: keyof EmployeeFormData, v: string | number | boolean) => {
    onChange({ ...form, [k]: v })
  }

  const roleLower = String(form.role || "").toLowerCase()
  const roleSelectValue = React.useMemo(() => {
    const cur = String(form.role || "Staff").trim()
    return ROLE_OPTIONS.find((r) => r.toLowerCase() === cur.toLowerCase()) || cur
  }, [form.role])

  const roleOptionsForSelect = React.useMemo(() => {
    const base = ROLE_OPTIONS.filter((r) => {
      const lo = r.toLowerCase()
      if (lo === "officer" && !canAssignOfficerRole) return false
      if (lo === "director" && !canAssignDirectorRole) return false
      return true
    })
    const cur = String(form.role || "Staff").trim()
    const curLo = cur.toLowerCase()
    const canonical = ROLE_OPTIONS.find((r) => r.toLowerCase() === curLo) || cur
    if (base.some((r) => r.toLowerCase() === curLo)) return base
    if (curLo === "officer" || curLo === "director") return [...base, canonical]
    return base
  }, [canAssignOfficerRole, canAssignDirectorRole, form.role])
  const showFranchiseeExtras =
    canEditFranchiseeExtraStores &&
    franchiseeMultiEnabled &&
    (roleLower.includes("franchisee") || form.role.includes("가맹") || form.role.includes("점주"))
  const hideOfficePayrollFields =
    !!officePayrollAuth &&
    isOfficeStore(String(form.store || "").trim()) &&
    !canViewOfficeEmployeePayroll(officePayrollAuth, String(form.store || ""))

  const toggleExtraStore = (storeName: string) => {
    const s = String(storeName || "").trim()
    if (!s) return
    const set = new Set(form.extraStores)
    const maxExtra = Math.max(0, franchiseeMultiMaxStores - 1)
    if (set.has(s)) {
      set.delete(s)
    } else {
      if (set.size >= maxExtra) return
      set.add(s)
    }
    onChange({ ...form, extraStores: [...set] })
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={cn(
          "flex flex-col overflow-hidden",
          embedded
            ? "h-full min-h-0"
            : "max-h-[min(85vh,900px)] rounded-xl border bg-card shadow-sm"
        )}
      >
        {!embedded && (
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-sm font-bold">{t("emp_form_title")}</h3>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onNew}>
              {t("emp_new")}
            </Button>
          </div>
        )}

        <div className={cn("flex-1 space-y-2 overflow-y-auto", embedded ? "px-0 py-1" : "px-4 py-3")}>
          <div className="rounded-lg border border-primary/25 bg-primary/5 px-2 py-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold whitespace-nowrap">{t("emp_label_employee_code")}</span>
            {form.row > 0 && String(form.employeeCode || "").trim() ? (
              <span className="text-sm font-mono font-bold tabular-nums tracking-wide text-primary">
                {String(form.employeeCode).trim()}
              </span>
            ) : form.row > 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              <span className="text-sm text-muted-foreground">{t("emp_employee_code_auto_note")}</span>
            )}
          </div>

          <Accordion type="multiple" defaultValue={["basic"]} className="space-y-2">
            <AccordionItem value="basic" className={sectionBasicCn}>
              <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                {t("emp_section_basic")}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-2">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1 space-y-2">
                      <FormField label={t("emp_label_store")}>
                        <Select
                          value={form.store || "__none__"}
                          onValueChange={(v) => update("store", v === "__none__" ? "" : v)}
                        >
                          <SelectTrigger className={fieldInputCn}>
                            <SelectValue placeholder={t("emp_label_store")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">-</SelectItem>
                            {stores.map((s) => (
                              <SelectItem key={s} value={s}>
                                {labelForStore(storeLabels, s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                      <div className="grid grid-cols-1 gap-x-1.5 gap-y-2 sm:grid-cols-2">
                        <FormField label={t("emp_label_nick_title")}>
                          <Select
                            value={form.nameTitle || "__none__"}
                            onValueChange={(v) => update("nameTitle", v === "__none__" ? "" : v)}
                          >
                            <SelectTrigger className={fieldInputCn}>
                              <SelectValue placeholder={t("emp_label_nick_title")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{t("emp_nick_title_none")}</SelectItem>
                              {EMP_NAME_TITLE_OPTIONS.map((x) => (
                                <SelectItem key={x} value={x}>
                                  {x}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                        <FormField label={t("emp_label_nickname")}>
                          <Input
                            value={form.nick}
                            onChange={(e) => update("nick", e.target.value)}
                            className={fieldInputCn}
                            placeholder={t("emp_label_nickname")}
                          />
                        </FormField>
                      </div>
                      <FormField label={t("emp_label_name")}>
                        <Input
                          value={form.name}
                          onChange={(e) => update("name", e.target.value)}
                          className={fieldInputCn}
                          placeholder={t("emp_label_name")}
                        />
                      </FormField>
                      <FormField label={t("emp_label_email")}>
                        <Input
                          type="email"
                          value={form.email}
                          onChange={(e) => update("email", e.target.value)}
                          className={fieldInputCn}
                          placeholder={t("emp_label_email")}
                        />
                      </FormField>
                    </div>
                    <div className="flex w-[10.5rem] shrink-0 flex-col gap-1.5">
                      <label className="text-sm font-semibold">{t("emp_photo")}</label>
                      <div className="flex h-[9rem] w-full items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/40">
                        {form.photo ? (
                          <img
                            src={form.photo}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => (e.currentTarget.style.display = "none")}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ""
                          if (!file) return
                          try {
                            const dataUrl = await compressImageForUpload(file, 800, 0.7)
                            update("photo", dataUrl)
                          } catch {
                            await appAlert(t("msg_upload_fail"))
                          }
                        }}
                      />
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-full px-2 text-xs"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <Upload className="mr-1 h-3.5 w-3.5 shrink-0" />
                          {t("emp_id_card_upload")}
                        </Button>
                        {form.photo ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-full px-2 text-xs text-destructive"
                            onClick={() => update("photo", "")}
                          >
                            {t("delete")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-x-1.5 gap-y-2 sm:grid-cols-2">
                    <FormField label={t("emp_label_job")}>
                      <Select value={form.job || jobOptions[0]} onValueChange={(v) => update("job", v)}>
                        <SelectTrigger className={fieldInputCn}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {jobOptions.map((j) => (
                            <SelectItem key={j} value={j}>
                              {getEmployeeJobOptionLabel(j)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label={t("emp_label_phone")}>
                      <Input
                        value={form.phone}
                        onChange={(e) => update("phone", e.target.value)}
                        className={fieldInputCn}
                      />
                    </FormField>
                    <FormField label={t("emp_label_birth")} variant="date">
                      <Input
                        type="date"
                        value={form.birth}
                        onChange={(e) => update("birth", e.target.value)}
                        className={fieldDateCn}
                      />
                    </FormField>
                    <FormField label={t("emp_label_nation")}>
                      <Input
                        value={form.nation}
                        onChange={(e) => update("nation", e.target.value)}
                        className={fieldInputCn}
                      />
                    </FormField>
                    <FormField label={t("emp_label_join_date")} variant="date">
                      <Input
                        type="date"
                        value={form.join}
                        onChange={(e) => update("join", e.target.value)}
                        className={fieldDateCn}
                      />
                    </FormField>
                    <FormField label={t("emp_label_leave_date")} variant="date">
                      <Input
                        type="date"
                        value={form.resign}
                        onChange={(e) => update("resign", e.target.value)}
                        className={fieldDateCn}
                      />
                    </FormField>
                    <FormField label={t("emp_label_pin")} variant="sensitive">
                      <Input
                        type="password"
                        value={form.pw}
                        onChange={(e) => update("pw", e.target.value)}
                        className={fieldSensitiveCn}
                        placeholder={t("emp_pin_ph")}
                      />
                    </FormField>
                    <FormField label={t("emp_label_role")}>
                      <Select
                        value={roleSelectValue}
                        onValueChange={(v) => update("role", v)}
                        disabled={roleDisabled}
                      >
                        <SelectTrigger className={fieldInputCn}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptionsForSelect.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>

                  {showFranchiseeExtras && (
                    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                      <label className="block text-xs font-semibold">{t("emp_franchisee_extra_stores")}</label>
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {allStoresForFranchiseePick
                          .filter(
                            (st) =>
                              String(st || "").trim() && String(st).trim() !== String(form.store || "").trim()
                          )
                          .map((st) => (
                            <label key={st} className="flex cursor-pointer items-center gap-2 text-xs">
                              <Checkbox
                                checked={form.extraStores.includes(st)}
                                onCheckedChange={() => toggleExtraStore(st)}
                              />
                              <span>{labelForStore(storeLabels, st)}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-x-1.5 gap-y-2 sm:grid-cols-2">
                    <FormField label={t("emp_grade")}>
                      <Select
                        value={form.grade || "__none__"}
                        onValueChange={(v) => update("grade", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className={fieldInputCn}>
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-</SelectItem>
                          {GRADE_OPTIONS.filter(Boolean).map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label={t("emp_label_manager_grade")}>
                      <div
                        className={cn(
                          "flex h-9 items-center justify-center rounded-md border border-border/60 bg-muted/30 px-2 text-sm font-semibold tabular-nums",
                          gradeBadgeStyle(form.managerGradeDisplay)
                        )}
                        title={t("emp_manager_grade_auto_note")}
                      >
                        {String(form.managerGradeDisplay || "").trim() || "-"}
                      </div>
                    </FormField>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="id" className={sectionIdCn}>
              <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                {t("emp_section_id_card")}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[11rem_1fr]">
                  <div className="flex w-full max-w-[11rem] flex-col gap-1.5 sm:max-w-none">
                    <label className="text-sm font-semibold">{t("emp_id_card")}</label>
                    <div
                      className="relative w-full overflow-hidden rounded-lg border-2 border-dashed border-amber-300/50 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20"
                      style={{ aspectRatio: String(ID_CARD_ASPECT) }}
                    >
                      {form.idCardPhoto ? (
                        <div className="group relative h-full w-full">
                          <img
                            src={form.idCardPhoto}
                            alt={t("emp_id_card")}
                            className="h-full w-full cursor-pointer object-contain bg-muted"
                            onClick={() => window.open(form.idCardPhoto, "_blank")}
                          />
                          <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => window.open(form.idCardPhoto, "_blank")}
                            >
                              <ImageIcon className="mr-1 h-3 w-3" aria-hidden />
                              {t("emp_id_card_view")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-full px-2 text-xs"
                        onClick={() => setIdCardCaptureOpen(true)}
                      >
                        <Upload className="mr-1 h-3.5 w-3.5" />
                        {t("emp_id_card_capture_open")}
                      </Button>
                      {form.idCardPhoto ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-full px-2 text-xs text-destructive"
                          onClick={() => update("idCardPhoto", "")}
                        >
                          {t("delete")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <FormField label={t("emp_id_number")} variant="sensitive">
                      <Input
                        value={form.idNumber}
                        onChange={(e) => update("idNumber", e.target.value)}
                        className={fieldSensitiveCn}
                        placeholder={t("emp_id_number")}
                      />
                    </FormField>
                    <FormField label={t("emp_tax_id")} variant="sensitive">
                      <Input
                        value={form.taxId}
                        onChange={(e) => update("taxId", e.target.value)}
                        className={fieldSensitiveCn}
                        placeholder={t("emp_tax_id")}
                      />
                    </FormField>
                    <FormField label={t("emp_sso_number")} variant="sensitive">
                      <Input
                        value={form.ssoNumber}
                        onChange={(e) => update("ssoNumber", e.target.value)}
                        className={fieldSensitiveCn}
                        placeholder={t("emp_sso_number")}
                      />
                    </FormField>
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200/60 bg-amber-50/30 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/15">
                      <Checkbox
                        id="emp-sso-exempt"
                        checked={form.ssoExempt}
                        onCheckedChange={(c) => update("ssoExempt", c === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="emp-sso-exempt" className="cursor-pointer text-sm leading-snug">
                        <span className="block font-semibold">{t("emp_sso_exempt_label")}</span>
                        <span className="text-muted-foreground">{t("emp_sso_exempt_hint")}</span>
                      </label>
                    </div>
                    {canAssignOfficePayrollManager ? (
                      <div className="flex items-start gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/30 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/15 sm:col-span-2">
                        <Checkbox
                          id="emp-office-payroll-mgr"
                          checked={form.canManageOfficePayroll}
                          onCheckedChange={(c) => update("canManageOfficePayroll", c === true)}
                          className="mt-0.5"
                        />
                        <label htmlFor="emp-office-payroll-mgr" className="cursor-pointer text-sm leading-snug">
                          <span className="block font-semibold">{t("emp_can_manage_office_payroll_label")}</span>
                          <span className="text-muted-foreground">{t("emp_can_manage_office_payroll_hint")}</span>
                        </label>
                      </div>
                    ) : null}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="accounting" className={sectionAccountingCn}>
              <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                {t("emp_section_accounting")}
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                {hideOfficePayrollFields ? (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                    {t("emp_office_payroll_hidden_hint")}
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-x-1.5 gap-y-2 sm:grid-cols-2">
                  <FormField label={t("emp_label_sal_type")} variant="amount">
                    <Select value={form.salType} onValueChange={(v) => update("salType", v)}>
                      <SelectTrigger className={fieldAmountCn}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SAL_TYPE_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s === "Monthly"
                              ? t("emp_sal_monthly")
                              : s === "Hourly"
                                ? t("emp_sal_hourly")
                                : t("emp_sal_parttime")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label={t("emp_label_sal_amt")} variant="amount">
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formatBahtAmountInput(form.salAmt)}
                      onChange={(e) => update("salAmt", parseBahtAmountInput(e.target.value))}
                      className={fieldAmountCn}
                    />
                  </FormField>
                  <FormField label={t("emp_bank_name")} variant="amount">
                    <Select
                      value={
                        BANK_OPTIONS.includes(form.bankName)
                          ? form.bankName
                          : form.bankName
                            ? BANK_OTHER
                            : "__none__"
                      }
                      onValueChange={(v) => update("bankName", v === BANK_OTHER || v === "__none__" ? "" : v)}
                    >
                      <SelectTrigger className={fieldAmountCn}>
                        <SelectValue placeholder={t("emp_bank_name")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-</SelectItem>
                        {BANK_OPTIONS.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                        <SelectItem value={BANK_OTHER}>{t("emp_bank_other")}</SelectItem>
                      </SelectContent>
                    </Select>
                    {!BANK_OPTIONS.includes(form.bankName) && (
                      <Input
                        value={form.bankName}
                        onChange={(e) => update("bankName", e.target.value)}
                        className={cn(fieldAmountCn, "mt-1.5")}
                        placeholder={t("emp_bank_name")}
                      />
                    )}
                  </FormField>
                  <FormField label={t("emp_account_number")} variant="amount">
                    <Input
                      value={form.accountNumber}
                      onChange={(e) => update("accountNumber", e.target.value)}
                      className={fieldAmountCn}
                    />
                  </FormField>
                  <FormField label={t("emp_address")} className="col-span-2" variant="amount">
                    <Input
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                      className={fieldInputCn}
                    />
                  </FormField>
                  <FormField label={t("emp_position_allowance")} hint={t("emp_position_allowance_hint")} variant="amount">
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formatBahtAmountInput(form.positionAllowance)}
                      onChange={(e) => update("positionAllowance", parseBahtAmountInput(e.target.value))}
                      className={fieldAmountCn}
                    />
                  </FormField>
                  <FormField label={t("emp_risk_allowance")} hint={t("emp_risk_allowance_hint")} variant="amount">
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formatBahtAmountInput(form.riskAllowance)}
                      onChange={(e) => update("riskAllowance", parseBahtAmountInput(e.target.value))}
                      className={fieldAmountCn}
                    />
                  </FormField>
                  <FormField label={t("emp_attendance_allowance")} hint={t("emp_attendance_allowance_hint")} variant="amount">
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={formatBahtAmountInput(form.attendanceAllowance)}
                      onChange={(e) => update("attendanceAllowance", parseBahtAmountInput(e.target.value))}
                      className={fieldAmountCn}
                    />
                  </FormField>
                </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className={cn("shrink-0 border-t bg-card/95 backdrop-blur-sm", embedded ? "px-0 py-3" : "px-4 py-3")}>
          <Button className="h-10 w-full text-base font-semibold shadow-sm" onClick={onSave} disabled={saving || !form.name}>
            {saving ? t("loading") : "💾 " + t("emp_save")}
          </Button>
        </div>
      </div>
      <IdCardCaptureDialog
        open={idCardCaptureOpen}
        onOpenChange={setIdCardCaptureOpen}
        onCapture={(dataUrl) => update("idCardPhoto", dataUrl)}
      />
    </TooltipProvider>
  )
}

export { emptyForm }
