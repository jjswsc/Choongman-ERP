"use client"

import * as React from "react"
import { Store, Briefcase, Shield, Users, Megaphone } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"
import {
  getNoticeOptions,
  useStoreList,
  saveHrPolicy,
  sendNotice,
  type HrPolicyRow,
} from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
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
  const { staffByStore } = useStoreList()

  const [stores, setStores] = React.useState<string[]>([])
  const [positions, setPositions] = React.useState<string[]>([])
  const [permissionGroups, setPermissionGroups] = React.useState<string[]>([])
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [selectedPositions, setSelectedPositions] = React.useState<string[]>([])
  const [selectedPermissionGroups, setSelectedPermissionGroups] = React.useState<string[]>([])
  const [selectedRecipients, setSelectedRecipients] = React.useState<string[]>([])
  const [deploying, setDeploying] = React.useState(false)

  React.useEffect(() => {
    if (!auth?.store) return
    const isOffice =
      auth.role === "director" ||
      auth.role === "officer" ||
      auth.role === "accounting" ||
      (auth.role || "").toLowerCase().includes("hr")
    getNoticeOptions().then((r) => {
      const allLabel = t("noticeFilterAll")
      const storeList = isOffice ? (r.stores || []) : [auth.store!]
      setStores([allLabel, ...storeList])
      setPositions([allLabel, ...(r.roles || [])])
      setPermissionGroups([allLabel, ...(r.permissionGroups || [])])
    })
  }, [auth?.store, auth?.role, lang, t])

  const fillFromPolicy = React.useCallback(
    (p: HrPolicyRow) => {
      const allLabel = t("noticeFilterAll")
      const ts = String(p.target_store || "전체").trim()
      if (ts === "전체" || ts === "All" || !ts) {
        setSelectedStores([])
      } else {
        setSelectedStores(ts.split(",").map((s) => s.trim()).filter(Boolean))
      }
      const tr = String(p.target_role || "전체").trim()
      if (tr === "전체" || tr === "All" || !tr) {
        setSelectedPositions([])
      } else {
        setSelectedPositions(tr.split(",").map((s) => s.trim()).filter(Boolean))
      }
      const tp = String(p.target_permission_group || "").trim()
      if (!tp) {
        setSelectedPermissionGroups([])
      } else {
        setSelectedPermissionGroups(tp.split(",").map((s) => s.trim()).filter(Boolean))
      }
      let rec: string[] = []
      if (p.target_recipients) {
        try {
          const j = JSON.parse(String(p.target_recipients)) as unknown
          if (Array.isArray(j)) rec = j.filter((x): x is string => typeof x === "string")
        } catch {
          rec = []
        }
      }
      setSelectedRecipients(rec)
    },
    [t]
  )

  React.useEffect(() => {
    if (!open || !policy) return
    fillFromPolicy(policy)
  }, [open, policy, fillFromPolicy])

  const toggleStore = (store: string) => {
    const allLabel = t("noticeFilterAll")
    if (store === allLabel) {
      setSelectedStores(
        selectedStores.length === stores.length - 1
          ? []
          : stores.filter((s) => s !== allLabel)
      )
      return
    }
    setSelectedStores((prev) =>
      prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]
    )
  }

  const togglePosition = (position: string) => {
    const allLabel = t("noticeFilterAll")
    if (position === allLabel) {
      setSelectedPositions(
        selectedPositions.length === positions.length - 1
          ? []
          : positions.filter((p) => p !== allLabel)
      )
      return
    }
    setSelectedPositions((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position]
    )
  }

  const togglePermissionGroup = (perm: string) => {
    const allLabel = t("noticeFilterAll")
    if (perm === allLabel) {
      setSelectedPermissionGroups(
        selectedPermissionGroups.length === permissionGroups.length - 1
          ? []
          : permissionGroups.filter((p) => p !== allLabel)
      )
      return
    }
    setSelectedPermissionGroups((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

  const toggleRecipient = (store: string, name: string) => {
    const key = `${store}|${name}`
    setSelectedRecipients((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    )
  }

  const allLabel = t("noticeFilterAll")
  const allStoresForStaff = selectedStores.length === 0 || selectedStores.length === stores.length - 1
  const storeNamesForStaff = allStoresForStaff
    ? stores.filter((s) => s !== allLabel)
    : selectedStores
  const allPositionsForStaff =
    selectedPositions.length === 0 || selectedPositions.length === positions.length - 1
  const positionsToMatch = allPositionsForStaff
    ? null
    : new Set(
        selectedPositions
          .filter((p) => p !== allLabel)
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      )
  const allPermissionGroupsForStaff =
    selectedPermissionGroups.length === 0 ||
    selectedPermissionGroups.length === permissionGroups.length - 1
  const permissionGroupsToMatch = allPermissionGroupsForStaff
    ? null
    : new Set(
        selectedPermissionGroups
          .filter((p) => p !== allLabel)
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      )

  const employeeList: { store: string; name: string; nick: string }[] = React.useMemo(() => {
    const list: { store: string; name: string; nick: string }[] = []
    for (const store of storeNamesForStaff) {
      const staff = staffByStore[store] || []
      for (const s of staff) {
        if (!s.name) continue
        if (positionsToMatch && positionsToMatch.size > 0) {
          const empJob = String(s.job || "").trim().toLowerCase()
          if (!empJob || !positionsToMatch.has(empJob)) continue
        }
        if (permissionGroupsToMatch && permissionGroupsToMatch.size > 0) {
          const empRole = String(s.role || "").trim().toLowerCase()
          if (!empRole || !permissionGroupsToMatch.has(empRole)) continue
        }
        list.push({ store, name: s.name, nick: s.nick || s.name })
      }
    }
    return list.sort((a, b) => (a.nick || "").localeCompare(b.nick || ""))
  }, [storeNamesForStaff, staffByStore, positionsToMatch, permissionGroupsToMatch])

  const handleDeploy = async () => {
    if (!policy || !auth?.user) return
    const allStores = selectedStores.length === stores.length - 1
    const allPos = selectedPositions.length === positions.length - 1
    const allPerm = selectedPermissionGroups.length === permissionGroups.length - 1
    const targetStore =
      selectedStores.length === 0 || allStores ? "전체" : selectedStores.join(",")
    const targetRole =
      selectedPositions.length === 0 || allPos ? "전체" : selectedPositions.join(",")
    const targetPermissionGroup =
      selectedPermissionGroups.length === 0 || allPerm ? "" : selectedPermissionGroups.join(",")
    let recKeys = selectedRecipients
    if (recKeys.length === 0 && employeeList.length > 0) {
      recKeys = employeeList.map((e) => `${e.store}|${e.name}`)
    }
    const targetRecipientsList =
      recKeys.length > 0
        ? recKeys.map((k) => {
            const [s, n] = k.split("|")
            return { store: s || "", name: n || "" }
          })
        : undefined

    setDeploying(true)
    try {
      const saveRes = await saveHrPolicy({
        id: policy.id,
        title: String(policy.title || ""),
        content: String(policy.content || ""),
        targetStore,
        targetRole,
        targetPermissionGroup: targetPermissionGroup || undefined,
        targetRecipients: targetRecipientsList,
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
        targetStore,
        targetRole: targetRole || "전체",
        targetPermissionGroup: targetPermissionGroup || null,
        targetRecipients: targetRecipientsList,
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
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <div className="flex flex-col gap-2 min-h-0">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <Store className="h-3.5 w-3.5" />
              {t("store")}
            </label>
            <ScrollArea className="h-[140px] rounded-md border p-1">
              <div className="flex flex-col gap-0.5 pr-2">
                {stores.map((store) => {
                  const isAll = store === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedStores.length === stores.length - 1
                    : selectedStores.includes(store)
                  return (
                    <label
                      key={store}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer",
                        checked ? "bg-primary/10" : "hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStore(store)}
                        className="h-3.5 w-3.5"
                      />
                      {store}
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2 min-h-0">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <Shield className="h-3.5 w-3.5" />
              {t("adminTargetPermissionGroups")}
            </label>
            <ScrollArea className="h-[140px] rounded-md border p-1">
              <div className="flex flex-col gap-0.5 pr-2">
                {permissionGroups.map((perm) => {
                  const isAll = perm === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedPermissionGroups.length === permissionGroups.length - 1
                    : selectedPermissionGroups.includes(perm)
                  return (
                    <label
                      key={perm}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer",
                        checked ? "bg-amber-500/10" : "hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePermissionGroup(perm)}
                        className="h-3.5 w-3.5"
                      />
                      {perm}
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
          <div className="flex flex-col gap-2 min-h-0">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <Briefcase className="h-3.5 w-3.5" />
              {t("noticeTargetDept")}
            </label>
            <ScrollArea className="h-[140px] rounded-md border p-1">
              <div className="flex flex-col gap-0.5 pr-2">
                {positions.map((pos) => {
                  const isAll = pos === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedPositions.length === positions.length - 1
                    : selectedPositions.includes(pos)
                  return (
                    <label
                      key={pos}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer",
                        checked ? "bg-emerald-500/10" : "hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePosition(pos)}
                        className="h-3.5 w-3.5"
                      />
                      {pos}
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
        <div className="px-4 pb-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="h-3.5 w-3.5" />
            {t("adminTargetIndividuals")}
            <span className="text-muted-foreground">
              {selectedRecipients.length}
              {t("adminRecipientsCountSuffix")}
            </span>
          </label>
          <ScrollArea className="mt-1.5 h-[100px] rounded-md border p-2">
            <div className="flex flex-wrap gap-1.5 pr-2">
              {employeeList.length === 0 ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                employeeList.map((emp) => {
                  const key = `${emp.store}|${emp.name}`
                  const checked = selectedRecipients.includes(key)
                  return (
                    <label
                      key={key}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer",
                        checked ? "bg-amber-500/15" : "opacity-80"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRecipient(emp.store, emp.name)}
                        className="h-3 w-3"
                      />
                      {emp.nick}
                    </label>
                  )
                })
              )}
            </div>
          </ScrollArea>
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
