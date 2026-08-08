"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useErpAllowUrlSync, useErpPageActiveRef } from "@/lib/erp-page-visibility"
import {
  Users,
  UserPlus,
  Save,
  RefreshCw,
  Gift,
  CalendarDays,
  Wallet,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { createMember, updateMember, type Member } from "@/lib/api-client"
import { apiFetch } from "@/lib/api/fetch"
import { CrmPageHero } from "@/components/crm/crm-shared-ui"
import { MemberListPanel, type MemberListPanelHandle } from "@/components/admin/member-list-panel"
import { MemberMergePanel } from "@/components/admin/member-merge-panel"
import { MemberNotesPanel } from "@/components/admin/member-notes-panel"
import { MemberPointsOpsPanel } from "@/components/admin/member-points-ops-panel"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

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
  createdAt: string
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
  createdAt: "",
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
    createdAt: toDateTimeLocalInput(m.createdAt || ""),
    status: m.status === "inactive" ? "inactive" : "active",
  }
}

function memberSaveAlertMessage(res: MemberSaveResponse, t: ReturnType<typeof useT>, fallbackKey: string): string {
  if (res.code === "DUPLICATE_PHONE") return t("memberDuplicatePhone")
  return res.message || t(fallbackKey)
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  )
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
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("memberFormTitle")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("memberFormDesc")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <FormSection title={t("memberSectionBasic")}>
          <div className="space-y-1.5">
            <Label>{t("name")} *</Label>
            <Input value={form.name ?? ""} onChange={(e) => onFormChange({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("memberFullName")}</Label>
            <Input value={form.fullName ?? ""} onChange={(e) => onFormChange({ fullName: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{t("birthDate")}</Label>
              <Input type="date" value={form.birthDate ?? ""} onChange={(e) => onFormChange({ birthDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gender")}</Label>
              <Select value={form.gender || "_"} onValueChange={(v) => onFormChange({ gender: v === "_" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("memberGenderPh")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">—</SelectItem>
                  <SelectItem value="M">{t("crmMemberGenderMale")}</SelectItem>
                  <SelectItem value="F">{t("crmMemberGenderFemale")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("memberNationality")}</Label>
            <Input value={form.nationality ?? ""} onChange={(e) => onFormChange({ nationality: e.target.value })} />
          </div>
        </FormSection>

        <FormSection title={t("memberSectionContact")}>
          <div className="space-y-1.5">
            <Label>{t("memberPhone")}</Label>
            <Input value={form.phone ?? ""} onChange={(e) => onFormChange({ phone: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("email")}</Label>
            <Input value={form.email ?? ""} onChange={(e) => onFormChange({ email: e.target.value })} />
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
        </FormSection>

        <FormSection title={t("memberSectionJoin")}>
          <div className="space-y-1.5">
            <Label>{t("memberJoinAt")}</Label>
            <Input
              type="datetime-local"
              value={form.createdAt ?? ""}
              onChange={(e) => onFormChange({ createdAt: e.target.value })}
            />
            {!form.id ? (
              <p className="text-[11px] text-muted-foreground">{t("memberJoinAtNewHint")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>{t("memberJoinChannel")}</Label>
            <Select value={form.joinChannel || "store"} onValueChange={(v) => onFormChange({ joinChannel: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store">{t("crmMemberJoinChannelStore")}</SelectItem>
                <SelectItem value="app">{t("crmMemberJoinChannelApp")}</SelectItem>
                <SelectItem value="line">{t("crmMemberJoinChannelLine")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>{t("memberReferralCode")}</Label>
              <Input value={form.referralCode ?? ""} onChange={(e) => onFormChange({ referralCode: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("memberReferredById")}</Label>
              <Input
                value={form.referredByMemberId ?? ""}
                onChange={(e) => onFormChange({ referredByMemberId: e.target.value })}
              />
            </div>
          </div>
        </FormSection>

        <FormSection title={t("memberSectionStatus")}>
          <div className="space-y-1.5">
            <Label>{t("memberStatus")}</Label>
            <Select
              value={form.status ?? "active"}
              onValueChange={(v) => onFormChange({ status: v === "inactive" ? "inactive" : "active" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("crmMemberStatusActive")}</SelectItem>
                <SelectItem value="inactive">{t("crmMemberStatusInactive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FormSection>

        <div className="flex gap-2 pt-1">
          <Button onClick={onSave} disabled={saving} className="flex-1 sm:flex-none gap-1.5">
            {form.id ? <Save className="size-4" /> : <UserPlus className="size-4" />}
            {saving ? t("saving") : form.id ? t("commonSave") : t("memberRegisterMaster")}
          </Button>
          <Button variant="outline" onClick={onClear} disabled={saving}>
            {t("memberClearSelection")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})

function SelectedMemberBar({
  member,
  detailTab,
  onOpenProfile,
  onOpenPoints,
  t,
}: {
  member: Member
  detailTab: "profile" | "points"
  onOpenProfile: () => void
  onOpenPoints: () => void
  t: ReturnType<typeof useT>
}) {
  const active = member.status !== "inactive"
  return (
    <div className="sticky top-0 z-20 rounded-xl border border-blue-200/70 bg-gradient-to-r from-blue-50/95 to-white/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-blue-50/80">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{member.name || member.phone || `#${member.id}`}</p>
            <Badge variant="outline">{member.tierCode || "—"}</Badge>
            <Badge variant={active ? "default" : "secondary"}>
              {active ? t("crmMemberStatusActive") : t("crmMemberStatusInactive")}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {member.memberNo || "—"}
            {member.phone ? ` · ${member.phone}` : ""}
            {` · ${t("memberPointsBalance")} ${Number(member.pointBalance || 0).toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={detailTab === "profile" ? "default" : "outline"}
            className="h-8"
            onClick={onOpenProfile}
          >
            {t("memberProfileTab")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={detailTab === "points" ? "default" : "outline"}
            className="h-8 gap-1"
            onClick={onOpenPoints}
          >
            <Wallet className="h-3.5 w-3.5" />
            {t("memberPointsTab")}
          </Button>
          <Button asChild type="button" size="sm" variant="outline" className="h-8 gap-1">
            <Link href={`/admin/crm/coupons?tab=issue&memberId=${member.id}`}>
              <Gift className="h-3.5 w-3.5" />
              {t("crmMember360OpenCoupons")}
            </Link>
          </Button>
          <Button asChild type="button" size="sm" variant="outline" className="h-8 gap-1">
            <Link href={`/admin/members/visits?memberId=${member.id}`}>
              <CalendarDays className="h-3.5 w-3.5" />
              {t("crmMember360OpenVisits")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function MembersPage() {
  const searchParams = useSearchParams()
  const allowMembersUrlSync = useErpAllowUrlSync("/admin/members")
  const pageActiveRef = useErpPageActiveRef()
  const { lang } = useLang()
  const t = useT(lang)
  const listRef = React.useRef<MemberListPanelHandle>(null)
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState<MemberForm>({ ...emptyForm })
  const [selectedMember, setSelectedMember] = React.useState<Member | null>(null)
  const [detailTab, setDetailTab] = React.useState<"profile" | "points">(
    searchParams.get("tab") === "points" ? "points" : "profile"
  )
  const [mergeOpen, setMergeOpen] = React.useState(false)

  React.useEffect(() => {
    if (!allowMembersUrlSync) return
    if (searchParams.get("tab") === "points") setDetailTab("points")
  }, [allowMembersUrlSync, searchParams])

  React.useEffect(() => {
    if (!pageActiveRef.current) return
    const id = Number(searchParams.get("memberId") || 0)
    if (!id) return
    void (async () => {
      try {
        const res = await apiFetch(`/api/members/${id}`, { cache: "no-store" })
        const data = (await res.json()) as { success?: boolean; member?: Member }
        if (data.success && data.member) {
          setForm(memberToForm(data.member))
          setSelectedMember(data.member)
          return
        }
      } catch {
        /* fallback */
      }
    })()
  }, [searchParams, pageActiveRef])

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
    setDetailTab("profile")
  }, [])

  const handleNewRegister = React.useCallback(() => {
    handleClearForm()
    setDetailTab("profile")
  }, [handleClearForm])

  const handleMerged = React.useCallback((m: Member) => {
    setForm(memberToForm(m))
    setSelectedMember(m)
    listRef.current?.reload()
  }, [])

  const handlePointsMemberUpdate = React.useCallback((m: Member) => {
    setSelectedMember(m)
    setForm(memberToForm(m))
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
          createdAt: form.createdAt.trim() || undefined,
          status: form.status,
        })
        if (!res.success || !res.member) {
          await appAlert(memberSaveAlertMessage(res, t, "memberDetailSaveFail"))
          return
        }
        setForm(memberToForm(res.member))
        setSelectedMember(res.member)
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
        createdAt: form.createdAt.trim() || undefined,
        status: form.status,
      })
      if (!res.success || !res.member) {
        await appAlert(memberSaveAlertMessage(res, t, "memberUpdateFail"))
        return
      }
      setForm(memberToForm(res.member))
      setSelectedMember(res.member)
      listRef.current?.reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-[90rem] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <CrmPageHero
          icon={Users}
          title={t("memberManagementTitle")}
          description={t("memberManagementSub")}
          gradient="from-blue-50 to-indigo-50"
          border="border-blue-200/60"
          iconClass="bg-blue-500/10 text-blue-600"
          actions={
            <>
              <Button type="button" size="sm" onClick={handleNewRegister} className="gap-1.5">
                <UserPlus className="h-4 w-4" />
                {t("memberNewRegister")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => listRef.current?.reload()}
              >
                <RefreshCw className="h-4 w-4" />
                {t("adminOpsCenterReload")}
              </Button>
            </>
          }
        />

        {selectedMember ? (
          <SelectedMemberBar
            member={selectedMember}
            detailTab={detailTab}
            onOpenProfile={() => setDetailTab("profile")}
            onOpenPoints={() => setDetailTab("points")}
            t={t}
          />
        ) : null}

        {/* xl 미만(POS·태블릿)은 1열로 회원목록·검색이 전체 폭을 쓰게 함 */}
        <div className="grid gap-6 xl:grid-cols-[min(390px,100%)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4 xl:sticky xl:top-0 xl:self-start">
            <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v === "points" ? "points" : "profile")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profile">{t("memberProfileTab")}</TabsTrigger>
                <TabsTrigger value="points">{t("memberPointsTab")}</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="mt-4 space-y-4">
                <MemberFormPanel
                  form={form}
                  onFormChange={handleFormChange}
                  onSave={onSave}
                  onClear={handleClearForm}
                  saving={saving}
                  t={t}
                />
                <MemberNotesPanel member={selectedMember} />
                <Collapsible open={mergeOpen} onOpenChange={setMergeOpen}>
                  <div className="rounded-xl border border-dashed border-amber-300/70 bg-amber-50/30">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                      >
                        <span>{t("memberAdvancedMerge")}</span>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", mergeOpen && "rotate-180")} />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t px-2 pb-2 pt-1">
                        <MemberMergePanel targetMember={selectedMember} onMerged={handleMerged} t={t} />
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              </TabsContent>
              <TabsContent value="points" className="mt-4 space-y-4">
                {selectedMember ? (
                  <MemberPointsOpsPanel member={selectedMember} onMemberPointsChange={handlePointsMemberUpdate} />
                ) : (
                  <Card>
                    <CardContent className="py-8 text-sm text-muted-foreground">{t("memberPointsSelectHint")}</CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="min-w-0">
            <MemberListPanel
              ref={listRef}
              onSelectMember={handleSelectMember}
              selectedMemberId={selectedMember?.id ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
