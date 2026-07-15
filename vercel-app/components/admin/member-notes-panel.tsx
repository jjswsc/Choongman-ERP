"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/api/fetch"
import { approveReferralViaApi, type Member } from "@/lib/crm-member-api"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type MemberNote = {
  id: number
  note: string
  tags: string[]
  createdBy: string
  createdAt: string
}

/** 선택 회원 운영 메모 · 추천 승인 (기존 360 패널에서 분리) */
export function MemberNotesPanel({ member }: { member: Member | null }) {
  const { lang } = useLang()
  const t = useT(lang)
  const [notes, setNotes] = React.useState<MemberNote[]>([])
  const [noteDraft, setNoteDraft] = React.useState("")
  const [loadingNotes, setLoadingNotes] = React.useState(false)
  const [savingNote, setSavingNote] = React.useState(false)
  const [referring, setReferring] = React.useState(false)

  const loadNotes = React.useCallback(async (memberId: number) => {
    setLoadingNotes(true)
    try {
      const res = await apiFetch(`/api/crm/member-notes?memberId=${memberId}&limit=50`, { cache: "no-store" })
      const data = (await res.json()) as { success?: boolean; rows?: MemberNote[] }
      setNotes(data.rows || [])
    } catch {
      setNotes([])
    } finally {
      setLoadingNotes(false)
    }
  }, [])

  React.useEffect(() => {
    if (member?.id) {
      void loadNotes(member.id)
    } else {
      setNotes([])
      setNoteDraft("")
    }
  }, [member?.id, loadNotes])

  if (!member?.id) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">{t("memberNotesSelectHint")}</CardContent>
      </Card>
    )
  }

  const saveNote = async () => {
    const text = noteDraft.trim()
    if (!text) return
    setSavingNote(true)
    try {
      const res = await apiFetch("/api/crm/member-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id, note: text }),
      })
      const data = (await res.json()) as { success?: boolean }
      if (data.success) {
        setNoteDraft("")
        await loadNotes(member.id)
      }
    } finally {
      setSavingNote(false)
    }
  }

  const runReferralApprove = async () => {
    const referrerId = Number(member.referredByMemberId || 0)
    if (!referrerId) return
    setReferring(true)
    try {
      await approveReferralViaApi({ referrerMemberId: referrerId, referredMemberId: member.id })
    } finally {
      setReferring(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("crmMember360Notes")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder={t("crmMemberNotePlaceholder")}
            rows={2}
            className="min-h-[60px] flex-1"
          />
          <Button className="shrink-0" disabled={savingNote || !noteDraft.trim()} onClick={() => void saveNote()}>
            {savingNote ? t("loading") : t("crmMemberNoteSave")}
          </Button>
        </div>
        {loadingNotes ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("crmMemberNoteEmpty")}</p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border px-3 py-2 text-sm">
                <p>{n.note}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {n.createdAt} · {n.createdBy || "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
        {member.referredByMemberId ? (
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="text-xs text-muted-foreground">{t("crmMember360Referral")}</p>
            <p className="mt-1">
              {t("memberReferredById")}: {member.referredByMemberId}
            </p>
            <Button size="sm" className="mt-2" disabled={referring} onClick={() => void runReferralApprove()}>
              {referring ? t("loading") : t("crmMemberReferralApprove")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
