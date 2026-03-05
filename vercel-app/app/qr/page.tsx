"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import Link from "next/link"

/** ERP 접속용 QR 코드 전용 페이지. 저장·인쇄·공유용 */
export default function QrAccessPage() {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [targetUrl, setTargetUrl] = useState<string>("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const origin =
      typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "") || window.location.origin
        : ""
    const base = origin ? `${origin}/login` : ""
    if (!base) return
    setTargetUrl(base)
    QRCode.toDataURL(base, { width: 320, margin: 2 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null))
  }, [])

  const handleDownload = () => {
    if (!dataUrl) return
    const a = document.createElement("a")
    a.href = dataUrl
    a.download = "cm-erp-access-qr.png"
    a.click()
  }

  const handleCopyUrl = async () => {
    if (!targetUrl) return
    try {
      await navigator.clipboard.writeText(targetUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-6">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl backdrop-blur">
          <h1 className="mb-2 text-center text-xl font-bold text-white">
            CM ERP 접속 QR 코드
          </h1>
          <p className="mb-6 text-center text-sm text-white/70">
            스캔하여 모바일에서 바로 접속
          </p>

          {dataUrl ? (
            <>
              <div className="mb-6 flex justify-center">
                <div className="rounded-xl border-4 border-white bg-white p-3 shadow-lg">
                  <img
                    src={dataUrl}
                    alt="ERP 접속 QR"
                    width={280}
                    height={280}
                    className="block"
                  />
                </div>
              </div>
              <p className="mb-4 break-all text-center text-xs text-white/60">
                {targetUrl}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full rounded-xl bg-orange-500 px-4 py-3 font-medium text-white transition hover:bg-orange-600"
                >
                  PNG 이미지로 저장
                </button>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 font-medium text-white transition hover:bg-white/20"
                >
                  {copied ? "복사됨!" : "주소 복사"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
              <p className="text-sm text-white/60">QR 생성 중...</p>
            </div>
          )}
        </div>
        <p className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm text-white/60 underline hover:text-white/80"
          >
            로그인 페이지로
          </Link>
        </p>
      </div>
    </div>
  )
}
