'use client'

import { cn } from '@/lib/utils'
import type { Table } from '@/lib/pos-types'
import { Clock, Users } from 'lucide-react'

interface TableGridProps {
  tables: Table[]
  gridCols: number
  gridRows: number
  selectedTableId?: string | null
  onTableSelect?: (tableId: string) => void
}

export function TableGrid({
  tables,
  gridCols,
  gridRows,
  selectedTableId,
  onTableSelect
}: TableGridProps) {
  const getTableTime = (table: Table) => {
    if (!table.isOccupied || !table.order) return null
    const minutes = Math.floor((Date.now() - new Date(table.order.createdAt).getTime()) / 60000)
    return `${minutes}분`
  }

  return (
    <div className="relative w-full h-full min-h-[400px] bg-card rounded-lg border border-border p-4">
      <div
        className="relative w-full h-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: '8px',
          minHeight: `${gridRows * 80}px`
        }}
      >
        {/* Grid background */}
        {Array.from({ length: gridRows * gridCols }).map((_, idx) => (
          <div
            key={idx}
            className="border border-dashed border-border/30 rounded-md"
          />
        ))}
      </div>

      {/* Tables overlay */}
      <div
        className="absolute inset-4"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
          gap: '8px'
        }}
      >
        {tables.map(table => {
          const time = getTableTime(table)

          return (
            <button
              key={table.id}
              onClick={() => onTableSelect?.(table.id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 font-medium text-sm transition-all relative',
                table.shape === 'round' ? 'rounded-full' : 'rounded-lg',
                table.isOccupied
                  ? 'bg-primary/15 text-foreground shadow-md'
                  : 'bg-muted/50 text-muted-foreground hover:bg-secondary',
                selectedTableId === table.id && 'ring-2 ring-primary ring-offset-2'
              )}
              style={{
                gridColumn: `${table.x + 1} / span ${table.width}`,
                gridRow: `${table.y + 1} / span ${table.height}`,
                transform: `rotate(${table.rotation}deg)`
              }}
            >
              <span className="text-base font-semibold">{table.name}</span>
              <div className="flex items-center gap-2 text-xs opacity-80">
                <span className="flex items-center gap-0.5">
                  <Users className="w-3 h-3" />
                  {table.seats}
                </span>
                {time && (
                  <span className="flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    {time}
                  </span>
                )}
              </div>
              {table.isOccupied && table.order && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground rounded-full text-[10px] flex items-center justify-center font-bold">
                  {table.order.items.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
