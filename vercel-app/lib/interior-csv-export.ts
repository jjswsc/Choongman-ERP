/** 인테리어 목록 CSV 다운로드 (UTF-8 BOM) */

export function downloadInteriorCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => {
    const s = String(v ?? "")
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))]
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
