"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { compressImageForUpload } from "@/lib/utils"
import { Image, Upload, Download } from "lucide-react"
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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { BANK_OPTIONS, BANK_OTHER } from "@/lib/bank-options"
import { EMPLOYEE_NAME_TITLE_CANONICAL } from "@/lib/employee-display-name"

const SAL_TYPE_OPTIONS = ["Monthly", "Hourly", "Part-time"] as const
const ROLE_OPTIONS = ["Staff", "Manager", "Franchisee", "Officer", "Director"]
const GRADE_OPTIONS = ["", "S", "A", "B", "C", "F"]

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
  /** 급여 계산 시 SSO 공제 제외 (미가입 등) */
  ssoExempt: boolean
  address: string
  bankName: string
  accountNumber: string
  positionAllowance: number
  riskAllowance: number
  attendanceAllowance: number
  grade: string
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
  address: "",
  bankName: "",
  accountNumber: "",
  positionAllowance: 0,
  riskAllowance: 0,
  attendanceAllowance: 500,
  grade: "",
  photo: "",
  extraStores: [],
}

interface EmployeeFormProps {
  form: EmployeeFormData
  onChange: (form: EmployeeFormData) => void
  stores: string[]
  /** 직무 옵션 (Supabase employees.job 기준). 없으면 기본 4종 + Logistic */
  jobOptions?: string[]
  onSave: () => void
  onNew: () => void
  saving?: boolean
  /** 매장 매니저일 때 true — 권한(role) 수정 불가 */
  roleDisabled?: boolean
  /** false면 Officer·Director는 선택 불가(단, 이미 해당 역할인 직원은 유지·하향만 가능) */
  canAssignOfficerDirectorRoles?: boolean
  /** 시스템 설정: 가맹점주 복수 매장 사용 */
  franchiseeMultiEnabled?: boolean
  /** 본사 등 추가 매장 편집 가능 */
  canEditFranchiseeExtraStores?: boolean
  /** 추가 매장 체크박스 후보(전체 매장 목록) */
  allStoresForFranchiseePick?: string[]
  /** 대표 매장 포함 최대 매장 수 */
  franchiseeMultiMaxStores?: number
}

const DEFAULT_JOB_OPTIONS = ["Service", "Kitchen", "Officer", "Director", "Logistic"]

export function EmployeeForm({
  form,
  onChange,
  stores,
  jobOptions = DEFAULT_JOB_OPTIONS,
  onSave,
  onNew,
  saving = false,
  roleDisabled = false,
  canAssignOfficerDirectorRoles = false,
  franchiseeMultiEnabled = false,
  canEditFranchiseeExtraStores = false,
  allStoresForFranchiseePick = [],
  franchiseeMultiMaxStores = 5,
}: EmployeeFormProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const idCardInputRef = React.useRef<HTMLInputElement>(null)
  const photoInputRef = React.useRef<HTMLInputElement>(null)
  const update = (k: keyof EmployeeFormData, v: string | number | boolean) => {
    onChange({ ...form, [k]: v })
  }

  const roleLower = String(form.role || "").toLowerCase()
  const roleSelectValue = React.useMemo(() => {
    const cur = String(form.role || "Staff").trim()
    return ROLE_OPTIONS.find((r) => r.toLowerCase() === cur.toLowerCase()) || cur
  }, [form.role])

  const roleOptionsForSelect = React.useMemo(() => {
    if (canAssignOfficerDirectorRoles) return [...ROLE_OPTIONS]
    const cur = String(form.role || "Staff").trim()
    const curLo = cur.toLowerCase()
    const elevated = curLo === "officer" || curLo === "director"
    const base = ROLE_OPTIONS.filter((r) => {
      const lo = r.toLowerCase()
      return lo !== "officer" && lo !== "director"
    })
    if (!elevated) return base
    const canonical = ROLE_OPTIONS.find((r) => r.toLowerCase() === curLo) || cur
    if (base.some((r) => r.toLowerCase() === curLo)) return base
    return [...base, canonical]
  }, [canAssignOfficerDirectorRoles, form.role])
  const showFranchiseeExtras =
    canEditFranchiseeExtraStores &&
    franchiseeMultiEnabled &&
    (roleLower.includes("franchisee") || form.role.includes("가맹") || form.role.includes("점주"))

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
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex justify-between items-center border-b pb-2 mb-3">
        <h3 className="text-sm font-bold">{t("emp_form_title")}</h3>
        <Button variant="outline" size="sm" onClick={onNew}>
          {t("emp_new")}
        </Button>
      </div>

      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 flex flex-wrap items-center gap-2 mb-1">
        <span className="text-xs font-semibold whitespace-nowrap">{t("emp_label_employee_code")}</span>
        {form.row > 0 && String(form.employeeCode || "").trim() ? (
          <span className="text-xs font-mono font-semibold tabular-nums tracking-wide">{String(form.employeeCode).trim()}</span>
        ) : form.row > 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("emp_employee_code_auto_note")}</span>
        )}
      </div>

      <Accordion type="multiple" defaultValue={["basic", "id", "accounting"]} className="space-y-1">
        {/* 기본 정보 */}
        <AccordionItem value="basic" className="border rounded-lg px-3 data-[state=open]:border-primary/30">
          <AccordionTrigger className="text-xs font-semibold hover:no-underline py-3">
            {t("emp_section_basic")}
          </AccordionTrigger>
          <AccordionContent className="pb-3">
      <div className="grid grid-cols-2 gap-3">
        {/* 왼쪽: 라벨 위·칸 아래 / 매장 → 호칙|닉네임 2열 → 이름 / 오른쪽: 사진 */}
        <div className="col-span-2 flex gap-3 items-stretch">
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <label className="text-xs font-semibold block mb-1">{t("emp_label_store")}</label>
              <Select value={form.store || "__none__"} onValueChange={(v) => update("store", v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue placeholder={t("emp_label_store")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">-</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="text-xs font-semibold block mb-1">{t("emp_label_nick_title")}</label>
                <Select
                  value={form.nameTitle || "__none__"}
                  onValueChange={(v) => update("nameTitle", v === "__none__" ? "" : v)}
                >
                  <SelectTrigger className="h-8 text-xs w-full">
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
              </div>
              <div className="min-w-0">
                <label className="text-xs font-semibold block mb-1">{t("emp_label_nickname")}</label>
                <Input
                  value={form.nick}
                  onChange={(e) => update("nick", e.target.value)}
                  className="h-8 text-xs w-full"
                  placeholder={t("emp_label_nickname")}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">{t("emp_label_name")}</label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="h-8 text-xs w-full"
                placeholder={t("emp_label_name")}
              />
            </div>
          </div>
          <div className="flex w-[7.25rem] shrink-0 flex-col self-stretch min-h-0">
            <label className="text-xs font-semibold text-left block mb-1 shrink-0">{t("emp_photo")}</label>
            <div className="min-h-0 flex-1 flex flex-col">
              <div className="min-h-[5rem] flex-1 w-full overflow-hidden rounded-md border border-input bg-muted flex items-center justify-center">
                {form.photo ? (
                  <img
                    src={form.photo}
                    alt=""
                    className="h-full w-full min-h-0 object-cover"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </div>
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
            <div className="mt-2 flex shrink-0 flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[10px] px-1.5 w-full"
                onClick={() => photoInputRef.current?.click()}
              >
                <Upload className="h-3 w-3 mr-0.5 shrink-0" />
                {t("emp_id_card_upload")}
              </Button>
              {form.photo ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] px-1.5 text-destructive w-full"
                  onClick={() => update("photo", "")}
                >
                  {t("delete")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_job")}</label>
          <Select value={form.job || jobOptions[0]} onValueChange={(v) => update("job", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {jobOptions.map((j) => (
                <SelectItem key={j} value={j}>{j}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_phone")}</label>
          <Input
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_email")}</label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_birth")}</label>
          <Input
            type="date"
            value={form.birth}
            onChange={(e) => update("birth", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_nation")}</label>
          <Input
            value={form.nation}
            onChange={(e) => update("nation", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_join_date")}</label>
          <Input
            type="date"
            value={form.join}
            onChange={(e) => update("join", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_leave_date")}</label>
          <Input
            type="date"
            value={form.resign}
            onChange={(e) => update("resign", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">PIN</label>
          <Input
            type="password"
            value={form.pw}
            onChange={(e) => update("pw", e.target.value)}
            className="h-8 text-xs"
            placeholder="Password"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_role")}</label>
          <Select
            value={roleSelectValue}
            onValueChange={(v) => update("role", v)}
            disabled={roleDisabled}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptionsForSelect.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showFranchiseeExtras && (
          <div className="col-span-2 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <label className="text-xs font-semibold block">{t("emp_franchisee_extra_stores")}</label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {allStoresForFranchiseePick
                .filter((st) => String(st || "").trim() && String(st).trim() !== String(form.store || "").trim())
                .map((st) => (
                  <label key={st} className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={form.extraStores.includes(st)}
                      onCheckedChange={() => toggleExtraStore(st)}
                    />
                    <span>{st}</span>
                  </label>
                ))}
            </div>
          </div>
        )}
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_grade")}</label>
          <Select value={form.grade || "__none__"} onValueChange={(v) => update("grade", v === "__none__" ? "" : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-</SelectItem>
              {GRADE_OPTIONS.filter(Boolean).map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
          </div>
          </AccordionContent>
        </AccordionItem>

        {/* ID·신분증 */}
        <AccordionItem value="id" className="border rounded-lg px-3 data-[state=open]:border-primary/30">
          <AccordionTrigger className="text-xs font-semibold hover:no-underline py-3">
            {t("emp_section_id_card")}
          </AccordionTrigger>
          <AccordionContent className="pb-3">
      <div className="flex gap-4 items-start">
            {/* 왼쪽: ID 카드 사진 + 업로드 버튼 */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <label className="text-xs font-semibold block mb-1 self-start">{t("emp_id_card")}</label>
              <div className="w-28 rounded border border-input bg-muted overflow-hidden">
                {form.idCardPhoto ? (
                  <div className="relative group">
                    <img
                      src={form.idCardPhoto}
                      alt="ID Card"
                      className="w-full h-24 object-contain bg-muted cursor-pointer"
                      onClick={() => window.open(form.idCardPhoto, "_blank")}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => window.open(form.idCardPhoto, "_blank")}
                      >
                        <Image className="h-3 w-3 mr-1" />
                        {t("emp_id_card_view")}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => {
                          if (form.idCardPhoto.startsWith("data:")) {
                            fetch(form.idCardPhoto)
                              .then((r) => r.blob())
                              .then((blob) => {
                                const url = URL.createObjectURL(blob)
                                const a = document.createElement("a")
                                a.href = url
                                a.download = `id_card_${(form.name || "photo").replace(/[/\\?*:"|]/g, "_")}.png`
                                a.click()
                                URL.revokeObjectURL(url)
                              })
                          } else {
                            window.open(form.idCardPhoto, "_blank")
                          }
                        }}
                      >
                        <Download className="h-3 w-3 mr-1" />
                        {t("emp_id_card_download")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-24 flex items-center justify-center text-muted-foreground text-[10px]">
                    —
                  </div>
                )}
              </div>
              <input
                ref={idCardInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (!file) return
                  try {
                    const dataUrl = await compressImageForUpload(file, 1024, 0.7)
                    update("idCardPhoto", dataUrl)
                  } catch {
                    await appAlert(t("msg_upload_fail"))
                  }
                }}
              />
              <div className="flex gap-1 mt-1.5 w-full justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[10px] px-2"
                  onClick={() => idCardInputRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  {t("emp_id_card_upload")}
                </Button>
                {form.idCardPhoto && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] text-destructive px-2"
                    onClick={() => update("idCardPhoto", "")}
                  >
                    {t("delete")}
                  </Button>
                )}
              </div>
            </div>
            {/* 오른쪽: ID번호, Tax ID, SSO 한 줄 정렬 */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1">{t("emp_id_number")}</label>
                <Input
                  value={form.idNumber}
                  onChange={(e) => update("idNumber", e.target.value)}
                  className="h-8 text-xs"
                  placeholder={t("emp_id_number")}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">{t("emp_tax_id")}</label>
                <Input
                  value={form.taxId}
                  onChange={(e) => update("taxId", e.target.value)}
                  className="h-8 text-xs"
                  placeholder={t("emp_tax_id")}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">{t("emp_sso_number")}</label>
                <Input
                  value={form.ssoNumber}
                  onChange={(e) => update("ssoNumber", e.target.value)}
                  className="h-8 text-xs"
                  placeholder={t("emp_sso_number")}
                />
              </div>
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="emp-sso-exempt"
                  checked={form.ssoExempt}
                  onCheckedChange={(c) => update("ssoExempt", c === true)}
                  className="mt-0.5"
                />
                <label htmlFor="emp-sso-exempt" className="text-xs leading-snug cursor-pointer">
                  <span className="font-semibold block">{t("emp_sso_exempt_label")}</span>
                  <span className="text-muted-foreground">{t("emp_sso_exempt_hint")}</span>
                </label>
              </div>
            </div>
          </div>
          </AccordionContent>
        </AccordionItem>

        {/* 회계·급여 */}
        <AccordionItem value="accounting" className="border rounded-lg px-3 data-[state=open]:border-primary/30">
          <AccordionTrigger className="text-xs font-semibold hover:no-underline py-3">
            {t("emp_section_accounting")}
          </AccordionTrigger>
          <AccordionContent className="pb-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_sal_type")}</label>
          <Select value={form.salType} onValueChange={(v) => update("salType", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAL_TYPE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "Monthly" ? t("emp_sal_monthly") : s === "Hourly" ? t("emp_sal_hourly") : t("emp_sal_parttime")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_sal_amt")}</label>
          <Input
            type="number"
            value={form.salAmt || ""}
            onChange={(e) => update("salAmt", e.target.value ? Number(e.target.value) : 0)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_bank_name")}</label>
          <Select
            value={BANK_OPTIONS.includes(form.bankName) ? form.bankName : (form.bankName ? BANK_OTHER : "__none__")}
            onValueChange={(v) => update("bankName", v === BANK_OTHER || v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={t("emp_bank_name")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-</SelectItem>
              {BANK_OPTIONS.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
              <SelectItem value={BANK_OTHER}>{t("emp_bank_other")}</SelectItem>
            </SelectContent>
          </Select>
          {!BANK_OPTIONS.includes(form.bankName) && (
            <Input
              value={form.bankName}
              onChange={(e) => update("bankName", e.target.value)}
              className="h-8 text-xs mt-1.5"
              placeholder={t("emp_bank_name")}
            />
          )}
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_account_number")}</label>
          <Input
            value={form.accountNumber}
            onChange={(e) => update("accountNumber", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-semibold block mb-1">{t("emp_address")}</label>
          <Input
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_position_allowance")}</label>
          <Input
            type="number"
            min={0}
            value={form.positionAllowance || ""}
            onChange={(e) => update("positionAllowance", e.target.value ? Number(e.target.value) : 0)}
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">{t("emp_position_allowance_hint")}</p>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_risk_allowance")}</label>
          <Input
            type="number"
            min={0}
            value={form.riskAllowance || ""}
            onChange={(e) => update("riskAllowance", e.target.value ? Number(e.target.value) : 0)}
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">{t("emp_risk_allowance_hint")}</p>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_attendance_allowance")}</label>
          <Input
            type="number"
            min={0}
            value={form.attendanceAllowance || ""}
            onChange={(e) =>
              update("attendanceAllowance", e.target.value ? Number(e.target.value) : 0)
            }
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">{t("emp_attendance_allowance_hint")}</p>
        </div>
          </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button className="w-full mt-4" onClick={onSave} disabled={saving || !form.name}>
        {saving ? t("loading") : "💾 " + t("emp_save")}
      </Button>
    </div>
  )
}

export { emptyForm }
