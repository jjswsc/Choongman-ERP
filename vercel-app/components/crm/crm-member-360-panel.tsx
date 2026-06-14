"use client"

import * as React from "react"
import Link from "next/link"
import { Gift, UserRound, Wallet, CalendarDays } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import {
  adminTabsContentEmbeddedCn,
  adminTabsListRowCn,
  adminTabsRootEmbeddedCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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

export function CrmMember360Panel({ member }: { member: Member | null }) {
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
        <CardContent className="flex min-h-[200px] items-center justify-center p-6 text-sm text-muted-foreground">
          {t("crmMember360NoSelection")}
        </CardContent>
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
    const referredId = Number(member.referredByMemberId || 0)
    if (!referredId) return
    setReferring(true)
    try {
      await approveReferralViaApi({ referrerMemberId: referredId, referredMemberId: member.id })
    } finally {
      setReferring(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-primary" />
          {t("crmMember360Title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className={adminTabsRootEmbeddedCn}>
          <AdminTabsBarWithHelp withHelp={false} sticky={false}>
            <TabsList className={adminTabsListRowCn}>
              <TabsTrigger value="summary" className={adminTabsTriggerCn}>
                {t("crmMember360Summary")}
              </TabsTrigger>
              <TabsTrigger value="notes" className={adminTabsTriggerCn}>
                {t("crmMember360Notes")}
              </TabsTrigger>
              <TabsTrigger value="links" className={adminTabsTriggerCn}>
                {t("crmMember360Points")}
              </TabsTrigger>
            </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="summary" className={cn(adminTabsContentEmbeddedCn, "space-y-3")}>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("name")}</p>
                <p className="font-medium">{member.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("memberNo")}</p>
                <p className="font-medium">{member.memberNo || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("memberTier")}</p>
                <Badge variant="outline">{member.tierCode || "—"}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("memberPointsBalance")}</p>
                <p className="text-lg font-semibold tabular-nums">{Number(member.pointBalance || 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("memberPhone")}</p>
                <p>{member.phone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("status")}</p>
                <p>{member.status || "—"}</p>
              </div>
            </div>
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
          </TabsContent>

          <TabsContent value="notes" className={cn(adminTabsContentEmbeddedCn, "space-y-3")}>
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
          </TabsContent>

          <TabsContent value="links" className={adminTabsContentEmbeddedCn}>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/members/points?memberId=${member.id}`}>
                  <Wallet className="mr-1.5 h-3.5 w-3.5" />
                  {t("crmMember360OpenPoints")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/members/visits?memberId=${member.id}`}>
                  <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                  {t("crmMember360OpenVisits")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/crm/coupons?tab=issue&memberId=${member.id}`}>
                  <Gift className="mr-1.5 h-3.5 w-3.5" />
                  {t("crmMember360OpenCoupons")}
                </Link>
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
