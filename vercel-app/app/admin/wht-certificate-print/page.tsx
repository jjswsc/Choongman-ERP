"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { WHT_CERT_PRINT_STORAGE_KEY } from "@/lib/open-wht-certificate-print"
import { buildWhtCertificateDocumentHtml } from "@/lib/wht-certificate-html"
import type { WhtCertificateData } from "@/lib/wht-certificate-data"

export default function WhtCertificatePrintPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [html, setHtml] = React.useState<string>("")
  const [count, setCount] = React.useState(0)
  const frameRef = React.useRef<HTMLIFrameElement | null>(null)

  React.useEffect(() => {
    try {
      const raw = sessionStorage.getItem(WHT_CERT_PRINT_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { items?: WhtCertificateData[]; lang?: string }
      const items = Array.isArray(parsed.items) ? parsed.items : []
      const printLang = parsed.lang || lang || "ko"
      const filtered = items.filter((d) => d.whtAmount > 0)
      setCount(filtered.length)
      setHtml(buildWhtCertificateDocumentHtml(items, printLang))
    } catch {
      setHtml("")
    }
  }, [lang])

  const resizeFrame = React.useCallback(() => {
    const frame = frameRef.current
    if (!frame) return
    try {
      const doc = frame.contentDocument
      if (!doc?.body) return
      const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 800)
      frame.style.height = `${h + 24}px`
    } catch {
      /* ignore cross-origin */
    }
  }, [])

  const handlePrint = React.useCallback(() => {
    const frame = frameRef.current
    const win = frame?.contentWindow
    if (win) {
      // iframe 내부에서 인쇄해야 양식 전체가 나옴 (부모 window.print는 iframe이 잘림)
      win.focus()
      win.print()
      return
    }
    window.print()
  }, [])

  if (!html) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <p>{t("whtCertPrintEmpty")}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="no-print sticky top-0 z-50 flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
        <span className="text-sm text-muted-foreground">
          {count > 0 ? t("whtCertPrintCount").replace("{n}", String(count)) : ""}
        </span>
        <Button type="button" onClick={handlePrint}>
          {t("purchaseOrderPrint")}
        </Button>
      </div>
      <iframe
        ref={frameRef}
        title="wht-certificate"
        srcDoc={html}
        className="w-full border-0 bg-white"
        style={{ minHeight: "calc(100vh - 52px)", display: "block" }}
        onLoad={resizeFrame}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print{.no-print{display:none!important}}`,
        }}
      />
    </div>
  )
}
