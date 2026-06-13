"use client"

import * as React from "react"
import { Megaphone, Users, Paperclip } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import type { NoticeAttachedFile } from "@/lib/notice-attachments"
import { formatBroadcastTargetSummary } from "@/lib/broadcast-target-selection"
import type { BroadcastTargetRow } from "@/lib/broadcast-notice-target"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  content: string
  recipientCount: number
  targetSummary: BroadcastTargetRow
  files: NoticeAttachedFile[]
  isUrgent: boolean
  scheduledAt?: string
  expiresAt?: string
  onConfirm: () => void
  confirming: boolean
}

export function NoticeSendPreviewDialog({
  open,
  onOpenChange,
  title,
  content,
  recipientCount,
  targetSummary,
  files,
  isUrgent,
  scheduledAt,
  expiresAt,
  onConfirm,
  confirming,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)

  const summary = formatBroadcastTargetSummary(targetSummary, {
    all: t("noticeFilterAll"),
    office: t("hrPolicyTargetPresetOffice"),
    stores: t("hrPolicyTargetPresetStores"),
    individuals: t("adminTargetIndividuals"),
    countSuffix: t("adminRecipientsCountSuffix"),
    permissionPrefix: t("adminTargetPermissionGroups"),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" />
            {t("noticePreviewSendTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3 text-sm overflow-auto min-h-0">
          {isUrgent && (
            <span className="inline-flex rounded-md bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">
              {t("noticeUrgentBadge")}
            </span>
          )}
          <p className="font-bold text-foreground">{title || "—"}</p>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {content || t("noticeEmptyContent")}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            <span>
              {t("noticePreviewRecipientCount")}:{" "}
              <strong className="text-foreground tabular-nums">{recipientCount}</strong>
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{summary}</p>
          {scheduledAt && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400">
              {t("noticeScheduledAtLabel")}: {scheduledAt}
            </p>
          )}
          {expiresAt && (
            <p className="text-[11px] text-muted-foreground">
              {t("noticeExpiresAtLabel")}: {expiresAt}
            </p>
          )}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {files.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px]"
                >
                  <Paperclip className="h-3 w-3" />
                  {f.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={confirming || recipientCount === 0}>
            {confirming ? t("loading") : t("adminSendNoticeBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
