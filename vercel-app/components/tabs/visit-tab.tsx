"use client"
import { appAlert } from "@/lib/app-message"

import { useEffect, useState, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  useStoreList,
  getTodayMyVisits,
  checkUserVisitStatus,
  submitStoreVisit,
  type TodayVisitItem,
} from "@/lib/api-client"
import { translateVisitType } from "@/lib/visit-i18n"
import { AttendanceQrScannerDialog } from "@/components/attendance/attendance-qr-scanner-dialog"
import { MapPin, Building2, Target, LogIn, LogOut } from "lucide-react"

const VISIT_PURPOSES = [
  { value: "정기점검", labelKey: "visitPurposeInspect" },
  { value: "직원교육", labelKey: "visitPurposeTraining" },
  { value: "긴급지원", labelKey: "visitPurposeUrgent" },
  { value: "매장미팅", labelKey: "visitPurposeMeeting" },
  { value: "물건배송", labelKey: "visitPurposeDelivery" },
  { value: "기타", labelKey: "visitPurposeEtc" },
]

export function VisitTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [storeList, setStoreList] = useState<string[]>([])
  const [selectedStore, setSelectedStore] = useState("")
  const [purpose, setPurpose] = useState("정기점검")
  const [purposeEtcReason, setPurposeEtcReason] = useState("")
  const [activeVisit, setActiveVisit] = useState<{ storeName: string; purpose?: string } | null>(null)
  const [visitLog, setVisitLog] = useState<TodayVisitItem[]>([])
  const [loading] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const pendingVisitTypeRef = useRef<"방문시작" | "방문종료" | null>(null)
  const [qrScanOpen, setQrScanOpen] = useState(false)

  const { stores: storeListRaw } = useStoreList()
  useEffect(() => {
    const all = storeListRaw || []
    const exclude = ["Office", "본사", "office"]
    let stores = all.filter(
      (s) => !exclude.includes(s) && s.toLowerCase() !== "office"
    )
    // 본사(CM Office 등) 로그인 시 CM Office를 방문 대상 목록에 포함 (API에 없을 수 있음)
    const role = String(auth?.role || "").toLowerCase()
    const isOfficeRole = ["director", "secretary", "officer", "ceo", "hr"].some((r) => role.includes(r))
    const isOfficeStore =
      auth?.store === "CM Office" ||
      auth?.store === "Office" ||
      auth?.store === "본사" ||
      auth?.store?.toLowerCase() === "office"
    const canAccessVisit = isOfficeStore || isOfficeRole
    if (canAccessVisit && !stores.includes("CM Office")) {
      stores = ["CM Office", ...stores].filter(Boolean)
    }
    setStoreList(stores.length > 0 ? stores : all)
  }, [storeListRaw, auth?.store, auth?.role])

  useEffect(() => {
    if (storeList.length > 0 && !selectedStore && !activeVisit) {
      setSelectedStore(storeList[0])
    }
  }, [storeList, selectedStore, activeVisit])

  const loadStatusAndLog = useCallback(() => {
    if (!auth?.user) return
    checkUserVisitStatus({ userName: auth.user }).then((res) => {
      if (res.active && res.storeName) {
        setActiveVisit({ storeName: res.storeName, purpose: res.purpose })
        setSelectedStore(res.storeName)
      } else {
        setActiveVisit(null)
      }
    })
    getTodayMyVisits({ userName: auth.user }).then(setVisitLog)
  }, [auth?.user])

  useEffect(() => {
    if (auth?.user) loadStatusAndLog()
  }, [auth?.user, loadStatusAndLog])

  const submitVisitRequest = useCallback(
    async (type: "방문시작" | "방문종료", attendanceQrToken: string) => {
      if (!auth?.user) return
      const store = type === "방문시작" ? selectedStore : activeVisit?.storeName || selectedStore
      if (!store) return

      setSubmitting(type)
      try {
        const purposeToSend =
          purpose === "기타" && purposeEtcReason.trim()
            ? `기타: ${purposeEtcReason.trim()}`
            : purpose || ""
        const result = await submitStoreVisit({
          userName: auth.user,
          storeName: store,
          type,
          purpose: purposeToSend,
          lat: "QR",
          lng: "QR",
          attendanceQrToken,
          clientTimestamp: Date.now(),
        })

        if (result.success) {
          if (type === "방문시작") {
            setActiveVisit({ storeName: store, purpose: purposeToSend })
          } else {
            setActiveVisit(null)
          }
          loadStatusAndLog()
          if (result.msg) {
            await appAlert(translateApiMessage(result.msg, t) || result.msg)
          }
        } else {
          await appAlert(translateApiMessage(result.msg, t) || t("msg_save_fail"))
        }
      } catch (e) {
        await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
      } finally {
        setSubmitting(null)
      }
    },
    [
      activeVisit?.storeName,
      auth?.user,
      loadStatusAndLog,
      purpose,
      purposeEtcReason,
      selectedStore,
      t,
    ]
  )

  const handleVisit = async (type: "방문시작" | "방문종료") => {
    if (!auth?.user) return
    if (type === "방문시작" && !selectedStore) {
      await appAlert(t("visitErrSelectStore"))
      return
    }

    const store = type === "방문시작" ? selectedStore : activeVisit?.storeName || selectedStore
    if (!store) return

    pendingVisitTypeRef.current = type
    setQrScanOpen(true)
  }

  const handleVisitQrScan = (raw: string) => {
    const type = pendingVisitTypeRef.current
    pendingVisitTypeRef.current = null
    if (!type) return
    void submitVisitRequest(type, raw)
  }

  if (!auth?.store) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <MapPin className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">{t("workLogLoginRequired")}</p>
      </div>
    )
  }

  const role = String(auth.role || "").toLowerCase()
  const isOfficeRole = ["director", "secretary", "officer", "ceo", "hr"].some((r) => role.includes(r))
  const isOfficeStore =
    auth.store?.toLowerCase() === "office" ||
    auth.store === "본사" ||
    auth.store === "Office" ||
    auth.store === "CM Office"
  const canAccessVisit = isOfficeStore || isOfficeRole

  if (!canAccessVisit) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <MapPin className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">
          {t("visitOfficeOnly") || "You can log store visits when signed in as Office/HQ."}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <MapPin className="h-3.5 w-3.5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">{t("visitTitle") || "Store Visit"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {t("visitQrHelp") || t("visitSub")}
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {t("visitStore") || "Store"}
            </label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              disabled={!!activeVisit}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!selectedStore && (
                <option value="" disabled>
                  {t("visitStorePlaceholder") || "Select Store"}
                </option>
              )}
              {storeList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              {t("visitPurpose") || "Visit Purpose"}
            </label>
            <Select value={purpose} onValueChange={(v) => { setPurpose(v); if (v !== "기타") setPurposeEtcReason("") }} disabled={!!activeVisit}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={4}>
                {VISIT_PURPOSES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey) || opt.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {purpose === "기타" && (
              <div className="mt-2 flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("visitPurposeEtcLabel") || "Other Reason (Optional)"}
                </label>
                <Input
                  value={purposeEtcReason}
                  onChange={(e) => setPurposeEtcReason(e.target.value)}
                  placeholder={t("visitPurposeEtcPlaceholder") || "Enter reason (optional)"}
                  className="h-9 text-sm min-h-[2.25rem]"
                  disabled={!!activeVisit}
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-9 font-medium"
              onClick={() => handleVisit("방문시작")}
              disabled={!!activeVisit || submitting !== null}
            >
              <LogIn className="mr-1.5 h-3.5 w-3.5" />
              {submitting === "방문시작" ? t("loading") : t("visitStart") || "Start Visit"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 h-9 font-medium"
              onClick={() => handleVisit("방문종료")}
              disabled={!activeVisit || submitting !== null}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              {submitting === "방문종료" ? t("loading") : t("visitEnd") || "End Visit"}
            </Button>
          </div>

          {activeVisit && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 px-3 py-2.5 text-center text-sm text-primary">
              📍 <strong>[{activeVisit.storeName}]</strong>{" "}
              {t("visitSupporting") || "Visiting"}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <CardTitle className="text-base font-semibold">
            {t("todayVisitLog") || "Today's Visit Log"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : visitLog.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {t("visitLogEmpty") || "No visit records today."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full min-w-[280px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-2 py-2 text-center font-medium">{t("time") || "Time"}</th>
                    <th className="px-2 py-2 text-center font-medium">{t("store") || "Store"}</th>
                    <th className="px-2 py-2 text-center font-medium">{t("visitType") || "Type"}</th>
                    <th className="px-2 py-2 text-center font-medium">{t("visitDuration") || "Duration"}</th>
                  </tr>
                </thead>
                <tbody>
                  {visitLog.map((r, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-1.5 text-center">{r.time}</td>
                      <td className="px-2 py-1.5 text-center font-medium">{r.store || "-"}</td>
                      <td className="px-2 py-1.5 text-center">{translateVisitType(r.type, t)}</td>
                      <td className="px-2 py-1.5 text-center">
                        {r.duration > 0 ? `${r.duration}${t("att_min_unit")}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AttendanceQrScannerDialog
        open={qrScanOpen}
        onOpenChange={(open) => {
          setQrScanOpen(open)
          if (!open) pendingVisitTypeRef.current = null
        }}
        onScan={handleVisitQrScan}
        titleKey="visitQrScanTitle"
        hintKey="visitQrScanHint"
      />
    </div>
  )
}
