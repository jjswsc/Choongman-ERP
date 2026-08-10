"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { WHT_CERT_PRINT_STORAGE_KEY } from "@/lib/open-wht-certificate-print"
import {
  buildWhtCertificateBodiesHtml,
  buildWhtCertificateDocumentHtml,
} from "@/lib/wht-certificate-html"
import { WHT_50_TAWI_STYLES } from "@/lib/wht-certificate-50tawi"
import type { WhtCertificateData } from "@/lib/wht-certificate-data"

/** 관리자 셸 안에서 인쇄해도 사이드바·헤더가 끼어들지 않도록 */
const WHT_PRINT_HOST_STYLES = `
@media print {
  .no-print, .print\\:hidden { display: none !important; }
  html, body {
    width: 210mm !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    overflow: visible !important;
  }
  body * { visibility: hidden !important; }
  #wht-certificate-print-root,
  #wht-certificate-print-root * { visibility: visible !important; }
  #wht-certificate-print-root {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
}
@media screen {
  #wht-certificate-print-root {
    padding: 12px;
    background: #cfcfcf;
  }
  #wht-certificate-print-root .wht50-sheet {
    background: #fff;
    box-shadow: 0 1px 8px rgba(0,0,0,.2);
    margin-bottom: 16px;
    height: auto;
    min-height: 285mm;
  }
}
`

export default function WhtCertificatePrintPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [bodiesHtml, setBodiesHtml] = React.useState<string>("")
  const [docHtml, setDocHtml] = React.useState<string>("")
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
      setBodiesHtml(buildWhtCertificateBodiesHtml(filtered))
      setDocHtml(buildWhtCertificateDocumentHtml(filtered, printLang))
    } catch {
      setBodiesHtml("")
      setDocHtml("")
    }
  }, [lang])

  const handlePrint = React.useCallback(() => {
    // 관리자 레이아웃(overflow/transform) 영향 없이 깨끗한 A4 문서로 인쇄
    if (docHtml) {
      const w = window.open("", "_blank")
      if (w) {
        w.document.open()
        w.document.write(docHtml)
        w.document.close()
        w.focus()
        let printed = false
        const trigger = () => {
          if (printed) return
          printed = true
          try {
            w.print()
          } catch {
            /* ignore */
          }
        }
        // 레이아웃·폰트 안정화 후 1회만 인쇄 대화상자
        if (w.document.readyState === "complete") {
          setTimeout(trigger, 400)
        } else {
          w.addEventListener("load", () => setTimeout(trigger, 400), { once: true })
          setTimeout(trigger, 800)
        }
        return
      }
    }
    window.print()
  }, [docHtml])

  if (!bodiesHtml) {
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
      <div
        id="wht-certificate-print-root"
        dangerouslySetInnerHTML={{ __html: bodiesHtml }}
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `${WHT_50_TAWI_STYLES}\n${WHT_PRINT_HOST_STYLES}`,
        }}
      />
    </div>
  )
}
