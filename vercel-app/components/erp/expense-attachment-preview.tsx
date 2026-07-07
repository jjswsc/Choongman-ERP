"use client"

import * as React from "react"
import {
  expenseAttachmentKind,
  isLikelyCorruptedExpensePdfDataUrl,
} from "@/lib/expense-attachment-urls"

function usePdfPreviewSrc(url: string): { src: string | null; corrupted: boolean } {
  const [blobSrc, setBlobSrc] = React.useState<string | null>(null)
  const corrupted = isLikelyCorruptedExpensePdfDataUrl(url)

  React.useEffect(() => {
    if (!url.startsWith("data:application/pdf") || corrupted) {
      setBlobSrc(null)
      return
    }
    let objectUrl: string | null = null
    try {
      const comma = url.indexOf(",")
      if (comma < 0) return
      const b64 = url.slice(comma + 1)
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: "application/pdf" })
      objectUrl = URL.createObjectURL(blob)
      setBlobSrc(objectUrl)
    } catch {
      setBlobSrc(null)
    }
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, corrupted])

  if (corrupted) return { src: null, corrupted: true }
  if (url.startsWith("http://") || url.startsWith("https://")) return { src: url, corrupted: false }
  if (url.startsWith("data:application/pdf")) return { src: blobSrc || url, corrupted: false }
  return { src: url, corrupted: false }
}

function ExpensePdfPreview({
  url,
  title,
  openLabel,
  corruptedLabel,
}: {
  url: string
  title: string
  openLabel: string
  corruptedLabel: string
}) {
  const { src, corrupted } = usePdfPreviewSrc(url)

  if (corrupted || !src) {
    return (
      <div className="rounded-md border border-dashed border-amber-500/50 bg-amber-500/5 p-4 text-sm space-y-2">
        <p className="text-amber-800 dark:text-amber-200">{corruptedLabel}</p>
        {!corrupted ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
            {openLabel}
          </a>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <iframe title={title} src={src} className="h-[min(70vh,520px)] w-full rounded border-0" />
      <a href={src} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
        {openLabel}
      </a>
    </div>
  )
}

export function ExpenseAttachmentPreviewItem({
  url,
  index,
  openFileLabel,
  corruptedPdfLabel,
}: {
  url: string
  index: number
  openFileLabel: string
  corruptedPdfLabel: string
}) {
  const kind = expenseAttachmentKind(url)

  if (kind === "image") {
    return (
      <img src={url} alt="" className="max-h-[70vh] w-auto max-w-full rounded mx-auto" />
    )
  }

  if (kind === "pdf") {
    return (
      <ExpensePdfPreview
        url={url}
        title={`pdf-${index}`}
        openLabel={openFileLabel}
        corruptedLabel={corruptedPdfLabel}
      />
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-primary underline break-all text-sm">
      {openFileLabel} #{index + 1}
    </a>
  )
}
