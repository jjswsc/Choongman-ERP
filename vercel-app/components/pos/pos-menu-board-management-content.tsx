'use client'

import * as React from 'react'
import { Plus, Pencil, Eye, Trash2 } from 'lucide-react'
import { useStoreList } from '@/lib/api-client'
import {
  getPosMenuBoards,
  savePosMenuBoard,
  deletePosMenuBoard,
  type PosMenuBoardConfig,
} from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

const TYPE_OPTIONS = [
  { value: 'dine_in', label: 'Dine in' },
  { value: 'delivery', label: 'Deli' },
  { value: 'table_order', label: 'Table order' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'kiosk', label: 'Kiosk' },
] as const

type BoardType = (typeof TYPE_OPTIONS)[number]['value']

const DEFAULT_FORM: Omit<PosMenuBoardConfig, 'id' | 'createdAt' | 'updatedAt'> = {
  storeCode: '',
  boardType: 'dine_in',
  boardName: '',
  groupGridCols: 5,
  groupGridRows: 2,
  menuGridCols: 5,
  menuGridRows: 5,
  resolutionWidth: 1024,
  resolutionHeight: 768,
  groupCount: 0,
  menuCount: 0,
  isActive: true,
}

const toNum = (v: string, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function PosMenuBoardManagementContent({ storeCode }: { storeCode?: string | null }) {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const [rows, setRows] = React.useState<PosMenuBoardConfig[]>([])
  const [loading, setLoading] = React.useState(false)
  const [queryStore, setQueryStore] = React.useState<string>('all')
  const [queryType, setQueryType] = React.useState<string>('all')
  const [queryKeyword, setQueryKeyword] = React.useState('')
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewTarget, setPreviewTarget] = React.useState<PosMenuBoardConfig | null>(null)
  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [form, setForm] = React.useState(DEFAULT_FORM)

  const load = React.useCallback(() => {
    setLoading(true)
    getPosMenuBoards({
      storeCode: queryStore !== 'all' ? queryStore : undefined,
      boardType: queryType !== 'all' ? (queryType as BoardType) : undefined,
    })
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [queryStore, queryType])

  React.useEffect(() => {
    if (storeCode) setQueryStore(storeCode)
  }, [storeCode])

  React.useEffect(() => {
    load()
  }, [load])

  const filtered = React.useMemo(() => {
    const keyword = queryKeyword.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((r) =>
      [r.storeCode, r.boardName, r.boardType, `${r.resolutionWidth}x${r.resolutionHeight}`]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    )
  }, [rows, queryKeyword])

  const typeLabel = (v: string) => TYPE_OPTIONS.find((o) => o.value === v)?.label || v

  const openNew = () => {
    setEditingId(null)
    setForm({
      ...DEFAULT_FORM,
      storeCode: queryStore !== 'all' ? queryStore : (storeCode || stores[0] || ''),
    })
    setDialogOpen(true)
  }

  const openEdit = (row: PosMenuBoardConfig) => {
    setEditingId(row.id)
    setForm({
      storeCode: row.storeCode,
      boardType: row.boardType,
      boardName: row.boardName,
      groupGridCols: row.groupGridCols,
      groupGridRows: row.groupGridRows,
      menuGridCols: row.menuGridCols,
      menuGridRows: row.menuGridRows,
      resolutionWidth: row.resolutionWidth,
      resolutionHeight: row.resolutionHeight,
      groupCount: row.groupCount,
      menuCount: row.menuCount,
      isActive: row.isActive,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.storeCode.trim()) {
      alert('매장을 선택해 주세요.')
      return
    }
    if (!form.boardName.trim()) {
      alert('메뉴판 이름을 입력해 주세요.')
      return
    }
    const res = await savePosMenuBoard({
      id: editingId || undefined,
      storeCode: form.storeCode.trim(),
      boardType: form.boardType,
      boardName: form.boardName.trim(),
      groupGridCols: form.groupGridCols,
      groupGridRows: form.groupGridRows,
      menuGridCols: form.menuGridCols,
      menuGridRows: form.menuGridRows,
      resolutionWidth: form.resolutionWidth,
      resolutionHeight: form.resolutionHeight,
      groupCount: form.groupCount,
      menuCount: form.menuCount,
      isActive: form.isActive,
    })
    if (!res?.success) {
      alert(res?.message || '저장 실패')
      return
    }
    setDialogOpen(false)
    load()
  }

  const handleDelete = async (row: PosMenuBoardConfig) => {
    if (!confirm(`삭제하시겠습니까?\n${row.boardName}`)) return
    const res = await deletePosMenuBoard({ id: row.id })
    if (!res?.success) {
      alert(res?.message || '삭제 실패')
      return
    }
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">{t('posMenuTabMenuBoard') || '메뉴판 관리'}</h3>
          <p className="text-xs text-muted-foreground">
            타입/해상도별로 메뉴판 구성을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={load}>
            {t('btn_query') || '조회'}
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" />
            {t('new') || '신규'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-3">
          <Select value={queryStore} onValueChange={setQueryStore}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="매장" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('posMenuCategoryAll') || '전체'}</SelectItem>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={queryType} onValueChange={setQueryType}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="타입" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('posMenuCategoryAll') || '전체'}</SelectItem>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={queryKeyword}
            onChange={(e) => setQueryKeyword(e.target.value)}
            placeholder="메뉴판 이름"
            className="h-8 w-56 text-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-left">매장명</th>
                <th className="px-3 py-2 text-left">타입</th>
                <th className="px-3 py-2 text-left">메뉴판 이름</th>
                <th className="px-3 py-2 text-center">그룹 격자</th>
                <th className="px-3 py-2 text-center">메뉴 격자</th>
                <th className="px-3 py-2 text-center">해상도</th>
                <th className="px-3 py-2 text-right">그룹 수</th>
                <th className="px-3 py-2 text-right">목록 수</th>
                <th className="px-3 py-2 text-center">사용</th>
                <th className="px-3 py-2 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">{t('loading')}</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">{t('itemsNoResults') || '데이터가 없습니다.'}</td></tr>
              )}
              {!loading && filtered.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{r.storeCode}</td>
                  <td className="px-3 py-2">{typeLabel(r.boardType)}</td>
                  <td className="px-3 py-2">{r.boardName}</td>
                  <td className="px-3 py-2 text-center">{r.groupGridCols} X {r.groupGridRows}</td>
                  <td className="px-3 py-2 text-center">{r.menuGridCols} X {r.menuGridRows}</td>
                  <td className="px-3 py-2 text-center">{r.resolutionWidth} X {r.resolutionHeight}</td>
                  <td className="px-3 py-2 text-right">{r.groupCount}</td>
                  <td className="px-3 py-2 text-right">{r.menuCount}</td>
                  <td className="px-3 py-2 text-center">{r.isActive ? 'Y' : 'N'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(r)} title="편집">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { setPreviewTarget(r); setPreviewOpen(true) }} title="미리보기">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r)} title="삭제">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? '메뉴판 수정' : '메뉴판 신규'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">매장명</label>
              <Select value={form.storeCode} onValueChange={(v) => setForm((p) => ({ ...p, storeCode: v }))}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">타입</label>
              <Select value={form.boardType} onValueChange={(v) => setForm((p) => ({ ...p, boardType: v as BoardType }))}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium">메뉴판 이름</label>
              <Input className="mt-1 h-9 text-xs" value={form.boardName} onChange={(e) => setForm((p) => ({ ...p, boardName: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium">그룹 격자 (열 x 행)</label>
              <div className="mt-1 flex gap-2">
                <Input className="h-9 text-xs" type="number" value={form.groupGridCols} onChange={(e) => setForm((p) => ({ ...p, groupGridCols: toNum(e.target.value, p.groupGridCols) }))} />
                <Input className="h-9 text-xs" type="number" value={form.groupGridRows} onChange={(e) => setForm((p) => ({ ...p, groupGridRows: toNum(e.target.value, p.groupGridRows) }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">메뉴 격자 (열 x 행)</label>
              <div className="mt-1 flex gap-2">
                <Input className="h-9 text-xs" type="number" value={form.menuGridCols} onChange={(e) => setForm((p) => ({ ...p, menuGridCols: toNum(e.target.value, p.menuGridCols) }))} />
                <Input className="h-9 text-xs" type="number" value={form.menuGridRows} onChange={(e) => setForm((p) => ({ ...p, menuGridRows: toNum(e.target.value, p.menuGridRows) }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">해상도 (가로 x 세로)</label>
              <div className="mt-1 flex gap-2">
                <Input className="h-9 text-xs" type="number" value={form.resolutionWidth} onChange={(e) => setForm((p) => ({ ...p, resolutionWidth: toNum(e.target.value, p.resolutionWidth) }))} />
                <Input className="h-9 text-xs" type="number" value={form.resolutionHeight} onChange={(e) => setForm((p) => ({ ...p, resolutionHeight: toNum(e.target.value, p.resolutionHeight) }))} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">개수 (그룹 / 목록)</label>
              <div className="mt-1 flex gap-2">
                <Input className="h-9 text-xs" type="number" value={form.groupCount} onChange={(e) => setForm((p) => ({ ...p, groupCount: toNum(e.target.value, p.groupCount) }))} />
                <Input className="h-9 text-xs" type="number" value={form.menuCount} onChange={(e) => setForm((p) => ({ ...p, menuCount: toNum(e.target.value, p.menuCount) }))} />
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>저장</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>메뉴판 미리보기</DialogTitle>
          </DialogHeader>
          {previewTarget && (
            <div className="space-y-2 text-sm">
              <div><b>매장</b>: {previewTarget.storeCode}</div>
              <div><b>타입</b>: {typeLabel(previewTarget.boardType)}</div>
              <div><b>메뉴판 이름</b>: {previewTarget.boardName}</div>
              <div><b>해상도</b>: {previewTarget.resolutionWidth} x {previewTarget.resolutionHeight}</div>
              <div className="rounded border bg-muted/20 p-3 text-xs text-muted-foreground">
                그룹 격자 {previewTarget.groupGridCols} x {previewTarget.groupGridRows}, 메뉴 격자 {previewTarget.menuGridCols} x {previewTarget.menuGridRows}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
