"use client"

import * as React from "react"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function CrmImageUploadField({
  accept = "image/*",
  disabled,
  uploading,
  onFile,
  previewUrl,
  alt,
}: {
  accept?: string
  disabled?: boolean
  uploading?: boolean
  onFile: (file: File) => void
  previewUrl?: string
  alt?: string
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const inputRef = React.useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) onFile(file)
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        {uploading ? t("loading") : t("crmMemberAppUpload")}
      </Button>
      {previewUrl ? (
        <img src={previewUrl} alt={alt || ""} className="h-28 w-full rounded-lg border object-cover" />
      ) : null}
    </div>
  )
}
