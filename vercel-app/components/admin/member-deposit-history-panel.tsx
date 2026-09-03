'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getPosDepositHistory, type PosDepositHistoryRow } from '@/lib/api-client'
import type { Member } from '@/lib/api-client'
import { useT } from '@/lib/i18n'

const KIND_KEY: Record<string, string> = {
  receive: 'posDepositKindReceive',
  apply: 'posDepositKindApply',
  refund: 'posDepositKindRefund',
  forfeit: 'posDepositKindForfeit',
}

export function MemberDepositHistoryPanel(props: {
  member: Member | null
  t: ReturnType<typeof useT>
}) {
  const { member, t } = props
  const [rows, setRows] = React.useState<PosDepositHistoryRow[]>([])
  const [held, setHeld] = React.useState(0)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const id = Number(member?.id || 0)
    if (!id) {
      setRows([])
      setHeld(0)
      return
    }
    let cancelled = false
    setLoading(true)
    void getPosDepositHistory({ memberId: id, limit: 50 })
      .then((res) => {
        if (cancelled) return
        setRows(res.rows)
        setHeld(res.heldBalance)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [member?.id])

  if (!member) return null

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">{t('memberDepositHistoryTitle') || '선수금 이력'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          {(t('memberDepositHeld') || t('posDepositHeld') || '보유')} {held.toLocaleString()} ฿
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('memberDepositHistoryEmpty') || '선수금 이력이 없습니다.'}
          </p>
        ) : (
          <div className="max-h-48 space-y-1 overflow-auto text-xs">
            {rows.map((row) => (
              <div key={row.id} className="flex justify-between gap-2">
                <span>
                  {(KIND_KEY[row.kind] ? t(KIND_KEY[row.kind] as string) : row.kind) || row.kind}
                  {' · '}
                  {row.orderNo || row.posOrderId}
                  {row.storeCode ? ` · ${row.storeCode}` : ''}
                </span>
                <span className="tabular-nums">{Number(row.amount).toLocaleString()} ฿</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
