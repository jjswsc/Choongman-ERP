/**
 * 직원 앱 급여명세서 HTML → PDF (jspdf + html2canvas)
 * corporate-tax-pdf와 동일 패턴.
 */

function sanitizeFilenamePart(s: string): string {
  return (
    String(s || "")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 80) || "payslip"
  )
}

/** 명세서 HTML(전체 document 또는 body 조각)을 A4 PDF로 저장 */
export async function exportPayslipHtmlToPdf(params: {
  html: string
  month: string
  employeeName: string
}): Promise<string> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ])

  const host = document.createElement("div")
  host.style.position = "fixed"
  host.style.left = "-100000px"
  host.style.top = "0"
  host.style.width = "210mm"
  host.style.background = "#fff"
  host.style.padding = "12mm"
  // srcDoc 전체 HTML이면 body만 추출
  const trimmed = String(params.html || "").trim()
  if (/^<!DOCTYPE|^<html/i.test(trimmed)) {
    const parsed = new DOMParser().parseFromString(trimmed, "text/html")
    host.innerHTML = parsed.body?.innerHTML || trimmed
    const styleEls = parsed.querySelectorAll("style")
    styleEls.forEach((el) => {
      const st = document.createElement("style")
      st.textContent = el.textContent
      host.prepend(st)
    })
  } else {
    host.innerHTML = trimmed
  }
  document.body.appendChild(host)

  try {
    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    })
    const imgData = canvas.toDataURL("image/png")
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const margin = 10
    const imgW = pageW - margin * 2
    const imgH = (canvas.height * imgW) / canvas.width
    const usableH = pageH - margin * 2
    let heightLeft = imgH
    let y = margin
    pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
    heightLeft -= usableH
    while (heightLeft > 0.5) {
      y = margin - (imgH - heightLeft)
      pdf.addPage()
      pdf.addImage(imgData, "PNG", margin, y, imgW, imgH)
      heightLeft -= usableH
    }
    const filename = `payslip_${sanitizeFilenamePart(params.month)}_${sanitizeFilenamePart(params.employeeName)}.pdf`
    pdf.save(filename)
    return filename
  } finally {
    document.body.removeChild(host)
  }
}
