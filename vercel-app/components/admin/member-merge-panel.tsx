"use client"

import * as React from "react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getMembers, mergeMembers, type Member } from "@/lib/api-client"
import { useT, tr } from "@/lib/i18n"

export const MemberMergePanel = React.memo(function MemberMergePanel({
  targetMember,
  onMerged,
  t,
}: {
  targetMember: Member | null
  onMerged: (member: Member) => void
  t: ReturnType<typeof useT>
}) {
  const [sourceRef, setSourceRef] = React.useState("")
  const [preview, setPreview] = React.useState<Member | null>(null)
  const [previewing, setPreviewing] = React.useState(false)
  const [merging, setMerging] = React.useState(false)

  React.useEffect(() => {
    setSourceRef("")
    setPreview(null)
  }, [targetMember?.id])

  const lookupSource = async () => {
    const q = sourceRef.trim()
    if (!q) {
      await appAlert(t("memberMergeSourceRequired"))
      return
    }
    setPreviewing(true)
    try {
      const rows = await getMembers({ q, limit: 20 })
      const normalized = q.toUpperCase()
      const match =
        rows.find((m) => String(m.memberNo || "").toUpperCase() === normalized) ||
        rows.find((m) => String(m.id) === q.replace(/^M/i, "")) ||
        rows[0]
      if (!match) {
        setPreview(null)
        await appAlert(t("memberMergeSourceNotFound"))
        return
      }
      if (targetMember && match.id === targetMember.id) {
        setPreview(null)
        await appAlert(t("memberMergeSameMember"))
        return
      }
      setPreview(match)
    } finally {
      setPreviewing(false)
    }
  }

  const runMerge = async () => {
    if (!targetMember?.id) {
      await appAlert(t("memberMergeTargetRequired"))
      return
    }
    if (!preview?.id) {
      await appAlert(t("memberMergePreviewFirst"))
      return
    }
    const ok = await appConfirm(
      tr(t, "memberMergeConfirm", {
        target: targetMember.memberNo || String(targetMember.id),
        source: preview.memberNo || String(preview.id),
      })
    )
    if (!ok) return

    setMerging(true)
    try {
      const res = await mergeMembers({
        targetMemberId: targetMember.id,
        sourceMemberId: preview.id,
      })
      if (!res.success) {
        await appAlert(res.message || t("memberMergeFail"))
        return
      }
      const transferStats = res.result?.transferred
      await appAlert(
        tr(t, "memberMergeDone", {
          coupons: String(transferStats?.coupons ?? 0),
          orders: String(transferStats?.orders ?? 0),
          points: String(transferStats?.pointLedgerRows ?? 0),
        })
      )
      setSourceRef("")
      setPreview(null)
      if (res.member) onMerged(res.member)
    } finally {
      setMerging(false)
    }
  }

  if (!targetMember?.id) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("memberMergeTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{t("memberMergeSelectTarget")}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-amber-200/80 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("memberMergeTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t("memberMergeDesc")}</p>
        <div className="rounded-md border bg-background/80 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t("memberMergeKeep")}: </span>
          <span className="font-medium">
            {targetMember.memberNo || `#${targetMember.id}`} · {targetMember.name}
          </span>
        </div>
        <div className="space-y-1.5">
          <Label>{t("memberMergeSourceLabel")}</Label>
          <div className="flex gap-2">
            <Input
              placeholder={t("memberMergeSourcePh")}
              value={sourceRef}
              onChange={(e) => {
                setSourceRef(e.target.value)
                setPreview(null)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void lookupSource()
              }}
            />
            <Button type="button" variant="outline" onClick={() => void lookupSource()} disabled={previewing}>
              {previewing ? t("loading") : t("memberMergeLookup")}
            </Button>
          </div>
        </div>
        {preview ? (
          <div className="rounded-md border border-amber-300/60 bg-background px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("memberMergeAbsorb")}: </span>
            <span className="font-medium">
              {preview.memberNo || `#${preview.id}`} · {preview.name}
              {preview.phone ? ` · ${preview.phone}` : ""}
            </span>
            {preview.status === "inactive" ? (
              <p className="mt-1 text-xs text-destructive">{t("memberMergeSourceInactive")}</p>
            ) : null}
          </div>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          className="w-full"
          disabled={merging || !preview || preview.status === "inactive"}
          onClick={() => void runMerge()}
        >
          {merging ? t("memberMerging") : t("memberMergeRun")}
        </Button>
      </CardContent>
    </Card>
  )
})
