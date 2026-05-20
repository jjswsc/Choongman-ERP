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
        <Button type="button" onClick={() => window.print()}>
          {t("purchaseOrderPrint")}
        </Button>
      </div>
      <iframe
        title="wht-certificate"
        srcDoc={html}
        className="w-full border-0"
        style={{ minHeight: "calc(100vh - 52px)" }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print{.no-print{display:none!important}body{background:#fff!important}iframe{position:absolute;left:0;top:0;width:100%;height:100%;min-height:100vh}}`,
        }}
      />
    </div>
  )
}
