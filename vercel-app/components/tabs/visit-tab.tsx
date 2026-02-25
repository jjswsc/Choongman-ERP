"use client"

import { useEffect, useState, useCallback } from "react"
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
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const { stores: storeListRaw } = useStoreList()
  useEffect(() => {
    const all = storeListRaw
    const exclude = ["Office", "본사", "office"]
    const stores = all.filter(
      (s) => !exclude.includes(s) && s.toLowerCase() !== "office"
    )
    setStoreList(stores.length > 0 ? stores : all)
  }, [storeListRaw])

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

  const handleVisit = async (type: "방문시작" | "방문종료") => {
    if (!auth?.user) return
    if (type === "방문시작" && !selectedStore) {
      alert(t("visitErrSelectStore"))
      return
    }

    const store = type === "방문시작" ? selectedStore : activeVisit?.storeName || selectedStore
    if (!store) return

    setSubmitting(type)
    try {
      let lat = ""
      let lng = ""
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) => {
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
          })
          lat = String(pos.coords.latitude)
          lng = String(pos.coords.longitude)
        } catch {
          lat = "Unknown"
          lng = "Unknown"
        }
      } else {
        lat = "Unknown"
        lng = "Unknown"
      }

      const forceType = type === "방문시작" ? "강제 방문시작" : "강제 방문종료"
      const useForce =
        lat === "Unknown" || lng === "Unknown"
          ? window.confirm(t("attGpsFailConfirm"))
          : false

      const visitType = useForce ? forceType : type
      const purposeToSend = purpose === "기타" && purposeEtcReason.trim()
        ? `기타: ${purposeEtcReason.trim()}`
        : (purpose || "")
      // 사용자 기기 시간 전송 (서버 지역·지연 대신 실제 방문 시각 기록)
      const clientTimestamp = Date.now()
      const result = await submitStoreVisit({
        userName: auth.user,
        storeName: store,
        type: visitType,
        purpose: purposeToSend,
        lat,
        lng,
        clientTimestamp,
      })

      if (result.success) {
        if (visitType === "방문시작" || visitType === "강제 방문시작") {
          setActiveVisit({ storeName: store, purpose: purposeToSend })
        } else {
          setActiveVisit(null)
        }
        loadStatusAndLog()
      } else {
        alert(translateApiMessage(result.msg, t) || t("msg_save_fail"))
      }
    } catch (e) {
      alert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(null)
    }
  }

  if (!auth?.store) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <MapPin className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">{t("workLogLoginRequired")}</p>
      </div>
    )
  }

  const isOffice =
    auth.store?.toLowerCase() === "office" ||
    auth.store === "본사" ||
    auth.store === "Office" ||
    auth.store === "CM Office"

  if (!isOffice) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <MapPin className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-center text-sm text-muted-foreground">
          {t("visitOfficeOnly") || "본사/Office 로그인 시 매장 방문을 기록할 수 있습니다."}
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
          <CardTitle className="text-base font-semibold">{t("visitTitle") || "매장 방문"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            {t("visitSub") || "현장 지원 및 교육 활동을 기록하세요."}
          </p>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {t("visitStore") || "방문 매장"}
            </label>
            <Select
              value={selectedStore}
              onValueChange={setSelectedStore}
              disabled={!!activeVisit}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("visitStorePlaceholder") || "매장 선택"} />
              </SelectTrigger>
              <SelectContent>
                {storeList.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" />
              {t("visitPurpose") || "방문 목적"}
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
                  {t("visitPurposeEtcLabel") || "기타 사유 (선택)"}
                </label>
                <Input
                  value={purposeEtcReason}
                  onChange={(e) => setPurposeEtcReason(e.target.value)}
                  placeholder={t("visitPurposeEtcPlaceholder") || "사유 입력 (선택)"}
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
              {submitting === "방문시작" ? t("loading") : t("visitStart") || "방문 시작"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 h-9 font-medium"
              onClick={() => handleVisit("방문종료")}
              disabled={!activeVisit || submitting !== null}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              {submitting === "방문종료" ? t("loading") : t("visitEnd") || "방문 종료"}
            </Button>
          </div>

          {activeVisit && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 px-3 py-2.5 text-center text-sm text-primary">
              📍 <strong>[{activeVisit.storeName}]</strong>{" "}
              {t("visitSupporting") || "방문 중"}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <CardTitle className="text-base font-semibold">
            {t("todayVisitLog") || "오늘 방문 기록"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : visitLog.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {t("visitLogEmpty") || "오늘 방문 기록이 없습니다."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto -webkit-overflow-scrolling-touch">
              <table className="w-full min-w-[280px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-2 py-2 text-center font-medium">{t("time") || "시간"}</th>
                    <th className="px-2 py-2 text-center font-medium">{t("store") || "매장"}</th>
                    <th className="px-2 py-2 text-center font-medium">{t("visitType") || "구분"}</th>
                    <th className="px-2 py-2 text-center font-medium">{t("visitDuration") || "체류"}</th>
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
    </div>
  )
}
