'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/lang-context'
import { useT, tOr } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Home,
  ArrowLeft,
  Save,
  RefreshCw,
  Square,
  RectangleHorizontal,
  Circle,
  RotateCw,
  Grid3X3,
  X
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Table, Store } from '@/lib/pos-types'

const DEFAULT_STORES: Store[] = [
  {
    id: 'cm-office',
    name: 'CM Office',
    gridCols: 6,
    gridRows: 5,
    tables: [
      { id: 't1', name: '1번', seats: 4, x: 0, y: 0, width: 1, height: 1, shape: 'square', rotation: 0, isOccupied: false },
      { id: 't2', name: '2번', seats: 4, x: 1, y: 0, width: 1, height: 1, shape: 'square', rotation: 0, isOccupied: false },
      { id: 't3', name: '3번', seats: 6, x: 2, y: 0, width: 2, height: 1, shape: 'rectangle', rotation: 0, isOccupied: false }
    ]
  },
  {
    id: 'cm-asoke',
    name: 'CM Asoke',
    gridCols: 6,
    gridRows: 5,
    tables: [
      { id: 't1', name: '1번', seats: 6, x: 0, y: 0, width: 2, height: 1, shape: 'rectangle', rotation: 0, isOccupied: false }
    ]
  }
]

export default function TableSettingsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [stores, setStores] = useState<Store[]>(DEFAULT_STORES)
  const [currentStoreId, setCurrentStoreId] = useState<string>('cm-asoke')
  const [selectedTableId, setSelectedTableId] = useState<string | null>('t1')
  const [draggedTableId, setDraggedTableId] = useState<string | null>(null)

  const currentStore = stores.find(s => s.id === currentStoreId)!
  const selectedTable = currentStore.tables.find(t => t.id === selectedTableId)
  const tableNumberSuffix = tOr(t, 'posTableNumberSuffix', '번')

  const [gridCols, setGridCols] = useState(currentStore.gridCols)
  const [gridRows, setGridRows] = useState(currentStore.gridRows)

  const updateStore = useCallback(
    (updates: Partial<Store>) => {
      setStores(prev => prev.map(store => (store.id === currentStoreId ? { ...store, ...updates } : store)))
    },
    [currentStoreId]
  )

  const updateTable = useCallback(
    (tableId: string, updates: Partial<Table>) => {
      setStores(prev =>
        prev.map(store =>
          store.id === currentStoreId
            ? { ...store, tables: store.tables.map(table => (table.id === tableId ? { ...table, ...updates } : table)) }
            : store
        )
      )
    },
    [currentStoreId]
  )

  const addTable = useCallback(
    (shape: 'square' | 'rectangle' | 'round') => {
      const newId = `t${Date.now()}`
      const newTable: Table = {
        id: newId,
        name: `${currentStore.tables.length + 1}${tableNumberSuffix}`,
        seats: shape === 'rectangle' ? 6 : 4,
        x: 0,
        y: 0,
        width: shape === 'rectangle' ? 2 : 1,
        height: 1,
        shape,
        rotation: 0,
        isOccupied: false
      }

      outer: for (let y = 0; y < currentStore.gridRows; y++) {
        for (let x = 0; x < currentStore.gridCols; x++) {
          const collision = currentStore.tables.some(
            t =>
              x < t.x + t.width &&
              x + newTable.width > t.x &&
              y < t.y + t.height &&
              y + newTable.height > t.y
          )
          if (
            !collision &&
            x + newTable.width <= currentStore.gridCols &&
            y + newTable.height <= currentStore.gridRows
          ) {
            newTable.x = x
            newTable.y = y
            break outer
          }
        }
      }

      updateStore({ tables: [...currentStore.tables, newTable] })
      setSelectedTableId(newId)
    },
    [currentStore, updateStore]
  )

  const removeTable = useCallback(
    (tableId: string) => {
      updateStore({ tables: currentStore.tables.filter(t => t.id !== tableId) })
      if (selectedTableId === tableId) setSelectedTableId(null)
    },
    [currentStore, updateStore, selectedTableId]
  )

  const handleGridApply = () => {
    updateStore({ gridCols, gridRows })
  }

  const handleResetTables = () => {
    updateStore({ tables: [] })
    setSelectedTableId(null)
  }

  const handleAutoName = () => {
    const names = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const renamedTables = currentStore.tables.map((table, idx) => ({
      ...table,
      name: names[idx] ?? `${idx + 1}${tableNumberSuffix}`
    }))
    updateStore({ tables: renamedTables })
  }

  const handleDragStart = (e: React.DragEvent, tableId: string) => {
    setDraggedTableId(tableId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDraggedTableId(null)
  }

  const handleCellDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleCellDrop = (cellX: number, cellY: number) => {
    if (!draggedTableId) return

    const table = currentStore.tables.find(t => t.id === draggedTableId)
    if (!table) return

    if (cellX + table.width > currentStore.gridCols || cellY + table.height > currentStore.gridRows) {
      setDraggedTableId(null)
      return
    }

    const collision = currentStore.tables.some(
      t =>
        t.id !== draggedTableId &&
        cellX < t.x + t.width &&
        cellX + table.width > t.x &&
        cellY < t.y + t.height &&
        cellY + table.height > t.y
    )

    if (!collision) {
      updateTable(draggedTableId, { x: cellX, y: cellY })
    }

    setDraggedTableId(null)
  }

  const handleStoreChange = (storeId: string) => {
    setCurrentStoreId(storeId)
    const store = stores.find(s => s.id === storeId)
    if (store) {
      setGridCols(store.gridCols)
      setGridRows(store.gridRows)
      setSelectedTableId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Home className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/pos">
            <Button variant="ghost" size="sm" className="h-8 gap-1">
              <ArrowLeft className="w-4 h-4" />
              POS
            </Button>
          </Link>
        </div>

        <h1 className="text-lg font-bold text-foreground">{t('posTableLayoutSetting')}</h1>

        <div className="w-24" />
      </header>

      <main className="p-6">
        <Card className="max-w-6xl mx-auto">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-foreground">{t('posTableLayoutCardTitle')}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('posTableLayoutCardSub')}
                </p>
              </div>
              <Button className="bg-primary hover:bg-primary/90">
                <Save className="w-4 h-4 mr-2" />
                {t('posSave')}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <Select value={currentStoreId} onValueChange={handleStoreChange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stores.map(store => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('posRefresh')}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 p-4 bg-secondary/50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{t('posTableGrid')}</span>
                <Select value={gridCols.toString()} onValueChange={v => setGridCols(Number(v))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[4, 5, 6, 7, 8, 10].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{t('posTableGridVert')}</span>
                <Select value={gridRows.toString()} onValueChange={v => setGridRows(Number(v))}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 6, 7, 8].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button variant="outline" size="sm" onClick={handleGridApply}>
                <Grid3X3 className="w-4 h-4 mr-2" />
                {t('apply')}
              </Button>

              <div className="h-6 w-px bg-border" />

              <span className="text-sm font-medium text-foreground">{t('posTableCreate')}</span>
              <Button variant="outline" size="sm" onClick={() => addTable('square')}>
                <Square className="w-4 h-4 mr-1" />
                {t('posTableShapeNormal')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addTable('rectangle')}>
                <RectangleHorizontal className="w-4 h-4 mr-1" />
                {t('posTableShapeLong')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => addTable('round')}>
                <Circle className="w-4 h-4 mr-1" />
                {t('posTableShapeRound')}
              </Button>

              <div className="h-6 w-px bg-border" />

              <Button
                variant="outline"
                size="sm"
                onClick={handleResetTables}
                className="text-destructive hover:text-destructive"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                {t('posTableReset')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleAutoName}>
                ABC
              </Button>
            </div>

            {selectedTable && (
              <div className="flex flex-wrap items-center gap-4 p-4 bg-secondary/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{t('posTableName')}</span>
                  <Input
                    value={selectedTable.name}
                    onChange={e => updateTable(selectedTable.id, { name: e.target.value })}
                    className="w-24"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{t('posTableSeats')}</span>
                  <Select
                    value={selectedTable.seats.toString()}
                    onValueChange={v => updateTable(selectedTable.id, { seats: Number(v) })}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 4, 6, 8, 10, 12].map(n => (
                        <SelectItem key={n} value={n.toString()}>
                          {n}{t('posTableSeatsUnit')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-1 border rounded-md p-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <span className="text-xs">≡</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <span className="text-xs">☰</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <span className="text-xs">≡</span>
                  </Button>
                </div>

                <div className="flex items-center gap-1 border rounded-md p-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <span className="text-xs">⊏</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <span className="text-xs">∥</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <span className="text-xs">⊐</span>
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateTable(selectedTable.id, { rotation: (selectedTable.rotation + 90) % 360 })
                  }
                >
                  <RotateCw className="w-4 h-4 mr-1" />
                  {t('posTableRotate')}
                </Button>
              </div>
            )}

            <div className="relative border border-border rounded-lg overflow-hidden bg-card p-4">
              <div
                className="relative"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${currentStore.gridCols}, 1fr)`,
                  gridTemplateRows: `repeat(${currentStore.gridRows}, 80px)`,
                  gap: '4px'
                }}
              >
                {Array.from({ length: currentStore.gridRows * currentStore.gridCols }).map((_, idx) => {
                  const cellX = idx % currentStore.gridCols
                  const cellY = Math.floor(idx / currentStore.gridCols)

                  return (
                    <div
                      key={idx}
                      className="border border-dashed border-border/50 rounded-md bg-secondary/30"
                      onDragOver={handleCellDragOver}
                      onDrop={() => handleCellDrop(cellX, cellY)}
                    />
                  )
                })}

                {currentStore.tables.map(table => (
                  <div
                    key={table.id}
                    draggable
                    onDragStart={e => handleDragStart(e, table.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedTableId(table.id)}
                    className={cn(
                      'absolute cursor-move flex items-center justify-center font-medium text-sm transition-all',
                      table.shape === 'round' ? 'rounded-full' : 'rounded-lg',
                      selectedTableId === table.id
                        ? 'bg-amber-200 dark:bg-amber-700 ring-2 ring-primary ring-offset-2'
                        : 'bg-amber-100 dark:bg-amber-800/50 hover:ring-2 hover:ring-primary/50',
                      draggedTableId === table.id && 'opacity-50'
                    )}
                    style={{
                      left: `calc(${(table.x / currentStore.gridCols) * 100}% + 4px)`,
                      top: `calc(${(table.y / currentStore.gridRows) * 100}% + 4px)`,
                      width: `calc(${(table.width / currentStore.gridCols) * 100}% - 8px)`,
                      height: `calc(${(table.height / currentStore.gridRows) * 100}% - 8px)`,
                      transform: `rotate(${table.rotation}deg)`
                    }}
                  >
                    <div className="absolute -top-2 left-1/4 w-2 h-2 rounded-full bg-amber-300 dark:bg-amber-600" />
                    <div className="absolute -top-2 right-1/4 w-2 h-2 rounded-full bg-amber-300 dark:bg-amber-600" />
                    <div className="absolute -bottom-2 left-1/4 w-2 h-2 rounded-full bg-amber-300 dark:bg-amber-600" />
                    <div className="absolute -bottom-2 right-1/4 w-2 h-2 rounded-full bg-amber-300 dark:bg-amber-600" />

                    {selectedTableId === table.id && (
                      <>
                        <div className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />
                        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />
                        <div className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />

                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            removeTable(table.id)
                          }}
                          className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs hover:bg-destructive/90"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    )}

                    <span className="text-foreground font-semibold">{table.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {t('posTableDragHint')}
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
