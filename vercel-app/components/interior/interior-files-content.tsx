"use client"

import * as React from "react"
import { Upload, Trash2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  getInteriorFiles,
  uploadInteriorFile,
  deleteInteriorFile,
  type InteriorProjectFile,
} from "@/lib/api-client"

const FILE_TYPES = [
  { value: "drawing", label: "도면" },
  { value: "quote", label: "견적서" },
]

interface InteriorFilesContentProps {
  projectId: string
  t: (key: string) => string
}

export function InteriorFilesContent({ projectId, t }: InteriorFilesContentProps) {
  const [list, setList] = React.useState<InteriorProjectFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<number | null>(null)
  const [fileType, setFileType] = React.useState("drawing")
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const loadData = React.useCallback(() => {
    if (!projectId) return
    setLoading(true)
    getInteriorFiles({ projectId })
      .then((r) => setList(r || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [projectId])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !projectId) return
    setUploading(true)
    try {
      const res = await uploadInteriorFile({
        projectId,
        fileType,
        file,
      })
      if (res.success) {
        loadData()
        alert(t("msg_saved") || "업로드되었습니다.")
      } else {
        alert(res.message || "업로드 실패")
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t("msg_delete_confirm_check_item") || "삭제하시겠습니까?")) return
    setDeletingId(id)
    try {
      const res = await deleteInteriorFile({ id })
      if (res.success) {
        loadData()
      } else {
        alert(res.message || "삭제 실패")
      }
    } catch (err) {
      alert(String(err))
    } finally {
      setDeletingId(null)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <Select value={fileType} onValueChange={setFileType}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILE_TYPES.map((ft) => (
                <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx"
            onChange={handleUpload}
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" />
            {uploading ? (t("loading") || "업로드 중...") : (t("interiorUpload") || "업로드")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          PDF, PNG, JPG, DOC, XLS 등 (최대 50MB)
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {t("loading") || "불러오는 중..."}
          </div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {t("msg_click_query") || "파일을 업로드해 주세요."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("interiorFileType") || "구분"}</TableHead>
                <TableHead>{t("interiorFileName") || "파일명"}</TableHead>
                <TableHead className="w-20">{t("interiorFileSize") || "크기"}</TableHead>
                <TableHead className="w-40">{t("interiorUploadedAt") || "업로드일"}</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="text-xs rounded px-2 py-0.5 bg-muted">
                      {FILE_TYPES.find((ft) => ft.value === item.fileType)?.label || item.fileType}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{item.fileName}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatSize(item.fileSize ?? 0)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {item.filePath && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1"
                          asChild
                        >
                          <a href={item.filePath} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5" />
                            {t("interiorDownload") || "다운로드"}
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => item.id && handleDelete(item.id)}
                        disabled={deletingId === item.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
