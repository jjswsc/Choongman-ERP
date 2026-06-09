"use client"

import * as React from "react"
import QRCode from "qrcode"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/api-client"
import {
  checkAttendanceQrDevice,
  getAttendanceQrDisplay,
  registerAttendanceQrDevice,
} from "@/lib/api-client"
import { canRegisterAttendanceQrDevice, canPickAttendanceQrStoreFilter } from "@/lib/permissions"
import {
  buildAttendanceQrClientHint,
  getOrCreateAttendanceQrDeviceToken,
  readAttendanceQrStoreCode,
  writeAttendanceQrStoreCode,
} from "@/lib/attendance-qr-device-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { appAlert } from "@/lib/app-message"
import { localizeApiMessage } from "@/lib/translate-api-message"
import Link from "next/link"

type KioskMode = "loading" | "register" | "display"

export function AttendanceQrKiosk() {
  const { auth, initialized } = useAuth()
  const { lang } = useLang()
  /** 미로그인 키오스크(태국 현장) — 등록·안내 화면은 영어 고정, 로그인 후에는 사용자 언어 */
  const kioskLang = auth?.user ? lang : "en"
  const t = useT(kioskLang)
  const { posStores, formatStoreLabel } = useStoreList()

  const [mode, setMode] = React.useState<KioskMode>("loading")
  const [deviceToken] = React.useState(() => getOrCreateAttendanceQrDeviceToken())
  const [storeCode, setStoreCode] = React.useState("")
  const [displayLabel, setDisplayLabel] = React.useState("")
  const [registering, setRegistering] = React.useState(false)
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const [statusLine, setStatusLine] = React.useState("")
  const [registeredLabel, setRegisteredLabel] = React.useState<string | null>(null)

  const canRegister = canRegisterAttendanceQrDevice(auth?.role || "")
  const canPickStore = canPickAttendanceQrStoreFilter(auth?.role || "", auth?.store || "")

  React.useEffect(() => {
    if (!initialized) return
    const savedStore = readAttendanceQrStoreCode()
    const initialStore =
      savedStore ||
      (canPickStore ? "" : String(auth?.store || "").trim())
    setStoreCode(initialStore)
  }, [initialized, auth?.store, canPickStore])

  const refreshQr = React.useCallback(async () => {
    const store = String(storeCode || readAttendanceQrStoreCode()).trim()
    const token = String(deviceToken || "").trim()
    if (!store || !token) return false

    const res = await getAttendanceQrDisplay({ storeCode: store, deviceToken: token })
    if (!res.success || !res.qrPayload) {
      setStatusLine(
        localizeApiMessage(res.message, t, t("attendanceQrDisplayFail"), kioskLang)
      )
      return false
    }
    const url = await QRCode.toDataURL(res.qrPayload, {
      margin: 2,
      width: 480,
      errorCorrectionLevel: "M",
    })
    setQrDataUrl(url)
    setRegisteredLabel(res.displayLabel ?? null)
    setStatusLine("")
    return true
  }, [deviceToken, storeCode, t, kioskLang])

  React.useEffect(() => {
    if (!initialized || !deviceToken) return
    let cancelled = false
    ;(async () => {
      const store = String(storeCode || readAttendanceQrStoreCode()).trim()
      if (!store) {
        if (!cancelled) setMode(canRegister ? "register" : "register")
        return
      }
      const check = await checkAttendanceQrDevice({ storeCode: store, deviceToken })
      if (cancelled) return
      if (check.registered) {
        writeAttendanceQrStoreCode(store)
        setMode("display")
        await refreshQr()
      } else {
        setMode("register")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialized, deviceToken, storeCode, canRegister, refreshQr])

  React.useEffect(() => {
    if (mode !== "display") return
    const tick = () => {
      void refreshQr()
    }
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => window.clearInterval(id)
  }, [mode, refreshQr])

  React.useEffect(() => {
    if (mode !== "display") return
    const wake = () => {
      if (document.visibilityState === "visible") void refreshQr()
    }
    document.addEventListener("visibilitychange", wake)
    return () => document.removeEventListener("visibilitychange", wake)
  }, [mode, refreshQr])

  async function handleRegister() {
    const store = String(storeCode || "").trim()
    if (!store) {
      await appAlert(t("attendanceQrPickStore") || "매장을 선택해 주세요.")
      return
    }
    if (!canRegister) {
      await appAlert(
        t("attendanceQrRegisterLoginHint") ||
          "Director, Supervisor 또는 해당 매장 Manager가 로그인한 뒤 등록해 주세요."
      )
      return
    }
    setRegistering(true)
    try {
      const res = await registerAttendanceQrDevice({
        storeCode: store,
        deviceToken,
        displayLabel: displayLabel.trim() || undefined,
        clientHint: buildAttendanceQrClientHint(),
      })
      if (!res.success) {
        await appAlert(
          localizeApiMessage(res.message, t, t("attendanceQrRegisterFail"), kioskLang)
        )
        return
      }
      writeAttendanceQrStoreCode(store)
      setMode("display")
      await refreshQr()
    } finally {
      setRegistering(false)
    }
  }

  if (!initialized || mode === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    )
  }

  if (mode === "register") {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
          <div>
            <h1 className="text-xl font-semibold">
              {t("attendanceQrKioskTitle") || "출퇴근 QR 단말"}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {t("attendanceQrKioskRegisterDesc") ||
                "이 기기를 매장 출퇴근 QR 표시용으로 1회 등록합니다. 등록 후에는 로그인 없이 QR만 표시됩니다."}
            </p>
          </div>

          {canPickStore ? (
            <div className="space-y-2">
              <Label className="text-slate-200">{t("store") || "매장"}</Label>
              <Select value={storeCode || undefined} onValueChange={setStoreCode}>
                <SelectTrigger className="bg-slate-800 text-white">
                  <SelectValue placeholder={t("attendanceQrPickStore") || "매장 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {posStores.map((code) => (
                    <SelectItem key={code} value={code}>
                      {formatStoreLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
              {t("store") || "매장"}: {formatStoreLabel(storeCode || auth?.store || "")}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-slate-200">
              {t("attendanceQrDeviceLabel") || "표시 이름 (선택)"}
            </Label>
            <Input
              className="bg-slate-800 text-white"
              value={displayLabel}
              onChange={(e) => setDisplayLabel(e.target.value)}
              placeholder={t("attendanceQrDeviceLabelPh") || "예: 카운터 QR"}
              maxLength={80}
            />
          </div>

          {canRegister ? (
            <Button
              className="w-full"
              disabled={registering || !storeCode}
              onClick={() => void handleRegister()}
            >
              {registering
                ? "…"
                : t("attendanceQrRegisterDevice") || "이 기기를 QR 단말로 등록"}
            </Button>
          ) : (
            <div className="space-y-3 text-sm text-amber-200">
              <p>
                {t("attendanceQrRegisterLoginHint") ||
                  "Director, Supervisor 또는 해당 매장 Manager가 로그인한 뒤 등록해 주세요."}
              </p>
              <Button asChild variant="secondary" className="w-full">
                <Link href="/pos/login">{t("qrFooterPosLogin") || "POS 로그인"}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-6">
      <div className="text-center">
        <p className="text-lg font-semibold text-slate-900">
          {t("attendanceQrScanTitle") || "출퇴근 QR 스캔"}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {formatStoreLabel(storeCode)}
          {registeredLabel ? ` · ${registeredLabel}` : ""}
        </p>
      </div>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="Attendance QR" className="h-[min(72vw,480px)] w-[min(72vw,480px)]" />
        ) : (
          <div className="flex h-[min(72vw,480px)] w-[min(72vw,480px)] items-center justify-center text-sm text-slate-500">
            …
          </div>
        )}
      </div>
      {statusLine ? <p className="mt-4 text-center text-sm text-red-600">{statusLine}</p> : null}
      <p className="mt-6 max-w-sm text-center text-xs text-slate-400">
        {t("attendanceQrKioskFootnote") ||
          "QR 코드는 랜덤하게 변경됩니다. 이 화면을 매장에 고정해 두세요."}
      </p>
    </div>
  )
}
