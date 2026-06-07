"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createMember, updateMember, type Member } from "@/lib/api-client"
import { CrmSubnav } from "@/components/erp/crm-subnav"
import { MemberListPanel, type MemberListPanelHandle } from "@/components/admin/member-list-panel"
import { MemberMergePanel } from "@/components/admin/member-merge-panel"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type MemberForm = {
  id?: number
  name: string
  fullName: string
  birthDate: string
  gender: string
  nationality: string
  joinChannel: string
  referralCode: string
  referredByMemberId: string
  phone: string
  email: string
  consentMarketing: boolean
  consentPrivacy: boolean
  consentAt: string
  status: "active" | "inactive"
}

type MemberSaveResponse = { success?: boolean; code?: string; message?: string; member?: Member }

const emptyForm: MemberForm = {
  name: "",
  fullName: "",
  birthDate: "",
  gender: "",
  nationality: "",
  joinChannel: "store",
  referralCode: "",
  referredByMemberId: "",
  phone: "",
  email: "",
  consentMarketing: false,
  consentPrivacy: false,
  consentAt: "",
  status: "active",
}

function toDateInput(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function toDateTimeLocalInput(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function memberToForm(m: Member): MemberForm {
  return {
    id: m.id,
    name: String(m.name || ""),
    fullName: m.fullName || "",
    birthDate: toDateInput(m.birthDate || ""),
    gender: m.gender || "",
    nationality: m.nationality || "",
    joinChannel: m.joinChannel || "store",
    referralCode: m.referralCode || "",
    referredByMemberId: String(m.referredByMemberId || ""),
    phone: m.phone || "",
    email: m.email || "",
    consentMarketing: Boolean(m.consentMarketing),
    consentPrivacy: Boolean(m.consentPrivacy),
    consentAt: toDateTimeLocalInput(m.consentAt || ""),
    status: m.status === "inactive" ? "inactive" : "active",
  }
}

function memberSaveAlertMessage(res: MemberSaveResponse, t: ReturnType<typeof useT>, fallbackKey: string): string {
  if (res.code === "DUPLICATE_PHONE") return t("memberDuplicatePhone")
  return res.message || t(fallbackKey)
}

const MemberFormPanel = React.memo(function MemberFormPanel({
  form,
  onFormChange,
  onSave,
  onClear,
  saving,
  t,
}: {
  form: MemberForm
  onFormChange: (patch: Partial<MemberForm>) => void
  onSave: () => void
  onClear: () => void
  saving: boolean
  t: ReturnType<typeof useT>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("memberFormTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("memberFormDesc")}</p>
        <div className="space-y-1.5">
          <Label>{t("name")} *</Label>
          <Input value={form.name ?? ""} onChange={(e) => onFormChange({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("memberFullName")}</Label>
          <Input value={form.fullName ?? ""} onChange={(e) => onFormChange({ fullName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("memberPhone")}</Label>
          <Input value={form.phone ?? ""} onChange={(e) => onFormChange({ phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>{t("email")}</Label>
          <Input value={form.email ?? ""} onChange={(e) => onFormChange({ email: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t("birthDate")}</Label>
            <Input type="date" value={form.birthDate ?? ""} onChange={(e) => onFormChange({ birthDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gender")}</Label>
            <Input placeholder={t("memberGenderPh")} value={form.gender ?? ""} onChange={(e) => onFormChange({ gender: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t("memberNationality")}</Label>
            <Input value={form.nationality ?? ""} onChange={(e) => onFormChange({ nationality: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("memberJoinChannel")}</Label>
            <Input value={form.joinChannel ?? ""} onChange={(e) => onFormChange({ joinChannel: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label>{t("memberReferralCode")}</Label>
            <Input value={form.referralCode ?? ""} onChange={(e) => onFormChange({ referralCode: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("memberReferredById")}</Label>
            <Input value={form.referredByMemberId ?? ""} onChange={(e) => onFormChange({ referredByMemberId: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.consentMarketing}
              onChange={(e) => onFormChange({ consentMarketing: e.target.checked })}
            />
            {t("memberConsentMarketing")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.consentPrivacy}
              onChange={(e) => onFormChange({ consentPrivacy: e.target.checked })}
            />
            {t("memberConsentPrivacy")}
          </label>
        </div>
        <div className="space-y-1.5">
          <Label>{t("memberConsentAt")}</Label>
          <Input
            type="datetime-local"
            value={form.consentAt ?? ""}
            onChange={(e) => onFormChange({ consentAt: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("memberStatus")}</Label>
          <Input
            value={form.status ?? "active"}
            onChange={(e) => onFormChange({ status: e.target.value === "inactive" ? "inactive" : "active" })}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={onSave} disabled={saving}>
            {saving ? t("saving") : form.id ? t("commonSave") : t("memberRegisterMaster")}
          </Button>
          <Button variant="outline" onClick={onClear}>
            {t("memberClearSelection")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})

export default function MembersPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const listRef = React.useRef<MemberListPanelHandle>(null)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<MemberForm>({ ...emptyForm })
  const [selectedMember, setSelectedMember] = React.useState<Member | null>(null)

  const handleFormChange = React.useCallback((patch: Partial<MemberForm>) => {
    setForm((p) => ({ ...p, ...patch }))
  }, [])

  const handleSelectMember = React.useCallback((m: Member) => {
    setForm(memberToForm(m))
    setSelectedMember(m)
  }, [])

  const handleClearForm = React.useCallback(() => {
    setForm({ ...emptyForm })
    setSelectedMember(null)
  }, [])

  const handleMerged = React.useCallback((m: Member) => {
    setForm(memberToForm(m))
    setSelectedMember(m)
    listRef.current?.reload()
  }, [])

  const onSave = async () => {
    const name = form.name.trim()
    if (!name) {
      await appAlert(t("memberNameRequired"))
      return
    }
    setSaving(true)
    try {
      if (!form.id) {
        const created = await createMember({
          name,
          phone: form.phone.trim(),
          email: form.email.trim(),
          birthDate: form.birthDate.trim(),
          gender: form.gender.trim(),
          nationality: form.nationality.trim(),
          joinChannel: form.joinChannel.trim(),
          referralCode: form.referralCode.trim(),
          referredByMemberId: Number(form.referredByMemberId || 0) || undefined,
          source: "app",
        })
        if (!created.success || !created.member) {
          await appAlert(memberSaveAlertMessage(created, t, "memberCreateFail"))
          return
        }
        const newId = created.member.id
        const res = await updateMember({
          id: newId,
          name,
          fullName: form.fullName.trim(),
          birthDate: form.birthDate.trim(),
          gender: form.gender.trim(),
          nationality: form.nationality.trim(),
          joinChannel: form.joinChannel.trim(),
          referralCode: form.referralCode.trim(),
          referredByMemberId: Number(form.referredByMemberId || 0) || undefined,
          phone: form.phone.trim(),
          email: form.email.trim(),
          consentMarketing: form.consentMarketing,
          consentPrivacy: form.consentPrivacy,
          consentAt: form.consentAt.trim(),
          status: form.status,
        })
        if (!res.success || !res.member) {
          await appAlert(memberSaveAlertMessage(res, t, "memberDetailSaveFail"))
          return
        }
        setForm({ ...emptyForm })
        setSelectedMember(null)
        listRef.current?.reload()
        return
      }
      const res = await updateMember({
        id: form.id,
        name,
        fullName: form.fullName.trim(),
        birthDate: form.birthDate.trim(),
        gender: form.gender.trim(),
        nationality: form.nationality.trim(),
        joinChannel: form.joinChannel.trim(),
        referralCode: form.referralCode.trim(),
        referredByMemberId: Number(form.referredByMemberId || 0) || undefined,
        phone: form.phone.trim(),
        email: form.email.trim(),
        consentMarketing: form.consentMarketing,
        consentPrivacy: form.consentPrivacy,
        consentAt: form.consentAt.trim(),
        status: form.status,
      })
      if (!res.success || !res.member) {
        await appAlert(memberSaveAlertMessage(res, t, "memberUpdateFail"))
        return
      }
      setForm({ ...emptyForm })
      setSelectedMember(null)
      listRef.current?.reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("memberManagementTitle")}</h1>
            <p className="text-xs text-muted-foreground">{t("memberManagementSub")}</p>
          </div>
        </div>
        <CrmSubnav />

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-0 lg:self-start space-y-4">
            <MemberFormPanel
              form={form}
              onFormChange={handleFormChange}
              onSave={onSave}
              onClear={handleClearForm}
              saving={saving}
              t={t}
            />
            <MemberMergePanel targetMember={selectedMember} onMerged={handleMerged} t={t} />
          </div>

          <MemberListPanel ref={listRef} onSelectMember={handleSelectMember} />
        </div>
      </div>
    </div>
  )
}
