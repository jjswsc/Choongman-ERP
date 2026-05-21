"use client"

import * as React from "react"
import { Megaphone } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"
import { saveHrPolicy, sendNotice, type HrPolicyRow } from "@/lib/api-client"
import {
  broadcastTargetStateFromRow,
  buildBroadcastTargetPayload,
  emptyBroadcastTargetSelection,
  type BroadcastTargetSelectionState,
} from "@/lib/broadcast-target-selection"
import {
  BroadcastTargetPicker,
  type BroadcastTargetOptionCounts,
} from "@/components/erp/broadcast-target-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  policy: HrPolicyRow | null
  onDeployed: () => void
}

function policyAttachments(
  p: HrPolicyRow
): { name: string; mime: string; url: string }[] | undefined {
  if (!p.attachments) return undefined
  try {
    const a = JSON.parse(String(p.attachments)) as { name?: string; mime?: string; url?: string }[]
    if (!Array.isArray(a)) return undefined
    return a
      .filter((x) => x?.url)
      .map((x) => ({
        name: x.name || "file",
        mime: x.mime || "application/octet-stream",
        url: String(x.url),
      }))
  } catch {
    return undefined
  }
}

export function HrPolicySendDialog({ open, onOpenChange, policy, onDeployed }: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const allLabel = t("noticeFilterAll")

  const [targetSelection, setTargetSelection] = React.useState<BroadcastTargetSelectionState>(
    emptyBroadcastTargetSelection()
  )
  const [optionCounts, setOptionCounts] = React.useState<BroadcastTargetOptionCounts>({
    storeOptionCount: 0,
    positionOptionCount: 0,
    permissionOptionCount: 0,
  })
  const [deploying, setDeploying] = React.useState(false)

  React.useEffect(() => {
    if (!open || !policy) return
    setTargetSelection(broadcastTargetStateFromRow(policy, allLabel))
  }, [open, policy, allLabel])

  const handleDeploy = async () => {
    if (!policy || !auth?.user) return
    const payload = buildBroadcastTargetPayload(targetSelection, {
      storeOptions: optionCounts.storeOptionCount,
      positionOptions: optionCounts.positionOptionCount,
      permissionOptions: optionCounts.permissionOptionCount,
    })

    setDeploying(true)
    try {
      const saveRes = await saveHrPolicy({
        id: policy.id,
        title: String(policy.title || ""),
        content: String(policy.content || ""),
        targetStore: payload.targetStore,
        targetRole: payload.targetRole,
        targetPermissionGroup: payload.targetPermissionGroup || undefined,
        targetRecipients: payload.targetRecipients,
        effectiveAt: policy.effective_at ? String(policy.effective_at).slice(0, 10) : null,
        is_active: true,
        attachments: policyAttachments(policy),
      })
      if (!saveRes.success) {
        await appAlert(translateApiMessage(String(saveRes.message || ""), t) || t("noticeSendFail"))
        return
      }
      const noticeTitle = t("hrPolicyDeployNoticeTitlePrefix") + (policy.title || "")
      const noticeContent = t("hrPolicyDeployNoticeContent")
      const nRes = await sendNotice({
        title: noticeTitle,
        content: noticeContent,
        targetStore: payload.targetStore,
        targetRole: payload.targetRole || "전체",
        targetPermissionGroup: payload.targetPermissionGroup || null,
        targetRecipients: payload.targetRecipients,
        sender: auth.user,
        userStore: auth.store,
        userRole: auth.role,
      })
      if (!nRes.success) {
        await appAlert(translateApiMessage(String(nRes.message || ""), t) || t("noticeSendFail"))
        return
      }
      onOpenChange(false)
      onDeployed()
      await appAlert(t("hrPolicyDeployDone"))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-4xl overflow-y-auto p-0 gap-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base pr-6">{t("hrPolicyDeployDialogTitle")}</DialogTitle>
          {policy && (
            <p className="text-xs text-muted-foreground font-normal line-clamp-2 pt-1">
              {policy.title}
            </p>
          )}
        </DialogHeader>
        <p className="px-4 pt-2 text-xs text-muted-foreground">{t("hrPolicyDeployDialogHint")}</p>
        <div className="p-4">
          <BroadcastTargetPicker
            value={targetSelection}
            onChange={setTargetSelection}
            onOptionCountsChange={setOptionCounts}
            employeeListHeight={120}
          />
        </div>
        <div className="flex justify-end gap-2 border-t bg-muted/30 px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleDeploy()}
            disabled={!policy || deploying}
          >
            <Megaphone className="mr-2 h-4 w-4" />
            {deploying ? t("loading") : t("hrPolicyDeployConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
