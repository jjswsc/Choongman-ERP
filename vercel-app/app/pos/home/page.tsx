'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LayoutGrid, Settings, Bike, Package, UtensilsCrossed, Store } from 'lucide-react'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export default function PosHomePage() {
  const { lang } = useLang()
  const t = useT(lang)
  const features = [
    { icon: LayoutGrid, labelKey: 'posFeatureTableManage', descKey: 'posFeatureTableManageDesc' },
    { icon: Bike, labelKey: 'posFeatureDelivery', descKey: 'posFeatureDeliveryDesc' },
    { icon: Package, labelKey: 'posFeatureTakeout', descKey: 'posFeatureTakeoutDesc' },
    { icon: Store, labelKey: 'posFeatureMultiStore', descKey: 'posFeatureMultiStoreDesc' }
  ] as const

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">{t('posTableManageSystem')}</h1>
          <p className="text-lg text-muted-foreground">
            {t('posTableManageSub')}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Link href="/pos">
            <Card className="h-full hover:border-primary hover:shadow-lg transition-all cursor-pointer group">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <UtensilsCrossed className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{t('posScreenTitle')}</CardTitle>
                <CardDescription>
                  {t('posScreenDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    <span>{t('posTableStatusRealtime')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bike className="w-4 h-4" />
                    <span>{t('posDeliveryList')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    <span>{t('posTakeoutList')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/pos/table-settings">
            <Card className="h-full hover:border-primary hover:shadow-lg transition-all cursor-pointer group">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <Settings className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{t('posTableSettingsTitle')}</CardTitle>
                <CardDescription>
                  {t('posTableSettingsDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4" />
                    <span>{t('posStoreLayoutManage')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4" />
                    <span>{t('posTableDragDrop')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    <span>{t('posTableAttrSetting')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {features.map((feature, idx) => {
            const Icon = feature.icon
            return (
              <Card key={idx} className="text-center p-4">
                <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold text-sm">{t(feature.labelKey)}</h3>
                <p className="text-xs text-muted-foreground">{t(feature.descKey)}</p>
              </Card>
            )
          })}
        </div>

        <div className="flex justify-center gap-4">
          <Link href="/pos">
            <Button size="lg" className="gap-2">
              <UtensilsCrossed className="w-5 h-5" />
              {t('posStartPos')}
            </Button>
          </Link>
          <Link href="/pos/table-settings">
            <Button size="lg" variant="outline" className="gap-2">
              <Settings className="w-5 h-5" />
              {t('posGoSettings')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
