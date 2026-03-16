'use client'

import { useRouter } from 'next/navigation'
import { Receipt, TrendingUp, Wallet } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { useStoreList } from '@/lib/api-client'
import { useOnlineStatus } from '@/lib/offline/network'
import { cn } from '@/lib/utils'
import { isManagerOrFranchiseeRole, isOfficeRole } from '@/lib/permissions'

const TILES = [
  {
    id: 'receipts',
    icon: Receipt,
    labelKey: 'posLocalReceipts',
    path: '/pos/local/receipts',
    requiredRole: () => true,
  },
  {
    id: 'sales',
    icon: TrendingUp,
    labelKey: 'posLocalSales',
    path: '/pos/local/sales',
    requiredRole: () => true,
  },
  {
    id: 'cash',
    icon: Wallet,
    labelKey: 'posLocalCash',
    path: '/pos/local/cash',
    requiredRole: (role: string) => isManagerOrFranchiseeRole(role) || isOfficeRole(role),
  },
] as const

/** 로컬 조회 허브 - 영수증/매출/시재 타일 */
export default function PosLocalHubPage() {
  const router = useRouter()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const online = useOnlineStatus()
  const { stores } = useStoreList()

  const role = auth?.role || ''
  const storeCode = auth?.store || stores[0] || ''

  const visibleTiles = TILES.filter((tile) => tile.requiredRole(role))

  return (
    <div className="space-y-4">
      {!online && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {t('posLocalOfflineNotice')}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {visibleTiles.map((tile) => {
          const Icon = tile.icon
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => router.push(tile.path)}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white p-6',
                'transition hover:border-emerald-400 hover:bg-emerald-50/50 active:scale-[0.98]'
              )}
            >
              <Icon className="h-12 w-12 text-emerald-600" />
              <span className="text-base font-semibold text-slate-800">
                {t(tile.labelKey)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
