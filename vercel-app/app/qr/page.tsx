"use client"

import { useCallback, useEffect, useState } from "react"
import QRCode from "qrcode"
import Link from "next/link"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LANG_CODES, type LangCode, isLangCode, useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const QR_LANG_LABELS: Record<LangCode, string> = {
  ko: "🇰🇷 한국어",
  en: "🇺🇸 English",
  th: "🇹🇭 ภาษาไทย",
  mm: "🇲🇲 မြန်မာ",
  la: "🇱🇦 ພາສາລາວ",
  kh: "🇰🇭 ភាសាខ្មែរ",
  vi: "🇻🇳 Tiếng Việt",
  ms: "🇲🇾 Bahasa Melayu",
}

type QrTarget = "mobile" | "admin" | "pos"

const PATHS: Record<QrTarget, string> = {
  mobile: "/login",
  admin: "/admin/login",
  pos: "/pos/login",
}

function targetToFilename(target: QrTarget): string {
  switch (target) {
    case "admin":
      return "cm-erp-qr-admin.png"
    case "pos":
      return "cm-erp-qr-pos.png"
    default:
      return "cm-erp-qr-mobile.png"
  }
}

/** ERP 접속용 QR — 모바일 / 관리자 / POS 로그인 URL 각각 생성 */
export default function QrAccessPage() {
  const { lang, setLang } = useLang()
  const t = useT(lang)
  const [target, setTarget] = useState<QrTarget>("mobile")
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [targetUrl, setTargetUrl] = useState<string>("")
  const [copied, setCopied] = useState(false)

  const regenerate = useCallback((url: string) => {
    if (!url) {
      setDataUrl(null)
      setTargetUrl("")
      return
    }
    setTargetUrl(url)
    QRCode.toDataURL(url, { width: 320, margin: 2 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null))
  }, [])

  useEffect(() => {
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "") || window.location.origin
        : ""
    if (!origin) return
    regenerate(`${origin}${PATHS[target]}`)
  }, [target, regenerate])

  const handleDownload = () => {
    if (!dataUrl) return
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = targetToFilename(target)
    a.click()
  }

  const handleCopyUrl = async () => {
    if (!targetUrl) return
    try {
      await navigator.clipboard.writeText(targetUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const segments: { id: QrTarget; labelKey: string }[] = [
    { id: "mobile", labelKey: "qrSegmentMobile" },
    { id: "admin", labelKey: "qrSegmentAdmin" },
    { id: "pos", labelKey: "qrSegmentPos" },
  ]

  const handleLangChange = (v: string) => {
    if (!isLangCode(v)) return
    setLang(v)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-6">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur">
          <h1 className="mb-2 text-center text-xl font-bold text-white">{t("qrPageTitle")}</h1>
          <div className="mb-4">
            <label className="mb-1.5 block text-center text-xs font-medium text-white/55" htmlFor="qr-lang-select">
              {t("posLanguage")}
            </label>
            <Select value={lang} onValueChange={handleLangChange}>
              <SelectTrigger
                id="qr-lang-select"
                className="border-white/25 bg-white/10 text-white ring-offset-slate-900 focus:ring-orange-500/40 [&>svg]:text-white/70"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/15 bg-slate-900 text-white">
                {LANG_CODES.map((code) => (
                  <SelectItem
                    key={code}
                    value={code}
                    className="focus:bg-white/15 focus:text-white"
                  >
                    {QR_LANG_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mb-4 text-center text-sm text-white/70">{t("qrPageSubtitle")}</p>

          <div className="mb-6 grid grid-cols-3 gap-2">
            {segments.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTarget(id)}
                className={cn(
                  "rounded-xl px-2 py-2.5 text-center text-xs font-semibold transition sm:text-sm",
                  target === id
                    ? "bg-orange-500 text-white shadow-md"
                    : "border border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <p className="mb-4 text-center text-xs text-white/55">{t("qrSegmentHint")}</p>

          {dataUrl ? (
            <>
              <div className="mb-6 flex justify-center">
                <div className="rounded-xl border-4 border-white bg-white p-3 shadow-lg">
                  <img
                    src={dataUrl}
                    alt={t("qrPageTitle")}
                    width={280}
                    height={280}
                    className="block"
                  />
                </div>
              </div>
              <p className="mb-4 break-all text-center text-xs text-white/60">{targetUrl}</p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full rounded-xl bg-orange-500 px-4 py-3 font-medium text-white transition hover:bg-orange-600"
                >
                  {t("qrDownloadPng")}
                </button>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/20"
                >
                  {copied ? t("qrCopied") : t("qrCopyUrl")}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              <p className="text-sm text-white/60">{t("qrGenerating")}</p>
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-sm">
          <Link href="/login" className="text-white/60 underline hover:text-white/80">
            {t("qrFooterMobileLogin")}
          </Link>
          <span className="text-white/30" aria-hidden>
            |
          </span>
          <Link href="/admin/login" className="text-white/60 underline hover:text-white/80">
            {t("qrFooterAdminLogin")}
          </Link>
          <span className="text-white/30" aria-hidden>
            |
          </span>
          <Link href="/pos/login" className="text-white/60 underline hover:text-white/80">
            {t("qrFooterPosLogin")}
          </Link>
        </div>
      </div>
    </div>
  )
}
