"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { AdminEmployeeItem } from "@/lib/api-client"

const JOB_OPTIONS = ["Service", "Kitchen", "Officer", "Director"]
const SAL_TYPE_OPTIONS = ["Monthly", "Hourly"]
const ROLE_OPTIONS = ["Staff", "Manager", "Officer", "Director"]
const GRADE_OPTIONS = ["", "S", "A", "B", "C", "F"]

export interface EmployeeFormData {
  row: number
  store: string
  name: string
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
  annualLeaveDays: number
  bankName: string
  accountNumber: string
  positionAllowance: number
  riskAllowance: number
  grade: string
  photo: string
}

const emptyForm: EmployeeFormData = {
  row: 0,
  store: "",
  name: "",
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
  annualLeaveDays: 15,
  bankName: "",
  accountNumber: "",
  positionAllowance: 0,
  riskAllowance: 0,
  grade: "",
  photo: "",
}

interface EmployeeFormProps {
  form: EmployeeFormData
  onChange: (form: EmployeeFormData) => void
  stores: string[]
  onSave: () => void
  onNew: () => void
  saving?: boolean
}

export function EmployeeForm({
  form,
  onChange,
  stores,
  onSave,
  onNew,
  saving = false,
}: EmployeeFormProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const update = (k: keyof EmployeeFormData, v: string | number) => {
    onChange({ ...form, [k]: v })
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-3">
      <div className="flex justify-between items-center border-b pb-2 mb-3">
        <h3 className="text-sm font-bold">{t("emp_form_title")}</h3>
        <Button variant="outline" size="sm" onClick={onNew}>
          {t("emp_new")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* 매장, 이름, 닉네임 + 오른쪽 사진 */}
        <div className="col-span-2 flex gap-4">
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs font-semibold block mb-1">{t("emp_label_store")}</label>
              <Select value={form.store || "__none__"} onValueChange={(v) => update("store", v === "__none__" ? "" : v)}>
                <SelectTrigger className="h-8 text-xs">
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
            <div>
              <label className="text-xs font-semibold block mb-1">{t("emp_label_name")}</label>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                className="h-8 text-xs"
                placeholder={t("emp_label_name")}
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">{t("emp_label_nickname")}</label>
              <Input
                value={form.nick}
                onChange={(e) => update("nick", e.target.value)}
                className="h-8 text-xs"
                placeholder={t("emp_label_nickname")}
              />
            </div>
          </div>
          <div className="flex-shrink-0 w-24 flex flex-col">
            <label className="text-xs font-semibold block mb-1">{t("emp_photo")}</label>
            <div
              className="flex-1 min-h-[calc(3*2rem+2*0.75rem)] rounded border border-input bg-muted overflow-hidden flex items-center justify-center"
              style={{ minHeight: "7.5rem" }}
            >
              {form.photo ? (
                <img
                  src={form.photo}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              ) : (
                <span className="text-[10px] text-muted-foreground">{t("emp_photo_url_ph")}</span>
              )}
            </div>
            <Input
              value={form.photo}
              onChange={(e) => update("photo", e.target.value)}
              className="h-7 mt-1.5 text-[10px]"
              placeholder={t("emp_photo_url_ph")}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_job")}</label>
          <Select value={form.job} onValueChange={(v) => update("job", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_OPTIONS.map((j) => (
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
          <label className="text-xs font-semibold block mb-1">{t("emp_label_sal_type")}</label>
          <Select value={form.salType} onValueChange={(v) => update("salType", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAL_TYPE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_label_amount")}</label>
          <Input
            type="number"
            value={form.salAmt || ""}
            onChange={(e) => update("salAmt", e.target.value ? Number(e.target.value) : 0)}
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
          <Select value={form.role} onValueChange={(v) => update("role", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_annual_leave_days")}</label>
          <Input
            type="number"
            min={0}
            value={form.annualLeaveDays}
            onChange={(e) => update("annualLeaveDays", e.target.value ? Number(e.target.value) : 15)}
            className="h-8 text-xs"
          />
        </div>
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
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_bank_name")}</label>
          <Input
            value={form.bankName}
            onChange={(e) => update("bankName", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1">{t("emp_account_number")}</label>
          <Input
            value={form.accountNumber}
            onChange={(e) => update("accountNumber", e.target.value)}
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
      </div>

      <Button className="w-full mt-4" onClick={onSave} disabled={saving || !form.name}>
        {saving ? t("loading") : "💾 " + t("emp_save")}
      </Button>
    </div>
  )
}

export { emptyForm }
