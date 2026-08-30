'use client'

import * as React from 'react'
import { Bitcoin, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { appAlert } from '@/lib/app-message'
import {
  getPosCryptoPaymentSettings,
  savePosCryptoPaymentSettings,
} from '@/lib/api-client'
import {
  CRYPTO_ASSET_DEFS,
  CRYPTO_ASSET_KEYS,
  defaultPosCryptoPaymentSettings,
  emptyCryptoAssetsEnabled,
  emptyCryptoWallets,
  validateCryptoWalletAddress,
  type CryptoAssetKey,
  type PosCryptoPaymentSettings,
} from '@/lib/payments/crypto-assets'

export function PosCryptoSettingsCard({
  storeCode,
  t,
}: {
  storeCode: string
  t: (key: string) => string
}) {
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [settings, setSettings] = React.useState<PosCryptoPaymentSettings>(defaultPosCryptoPaymentSettings())

  const load = React.useCallback(async () => {
    const code = String(storeCode || '').trim()
    if (!code) return
    setLoading(true)
    try {
      const data = await getPosCryptoPaymentSettings(code)
      setSettings({
        enabled: data.enabled === true,
        wallets: { ...emptyCryptoWallets(), ...data.wallets },
        assetsEnabled: { ...emptyCryptoAssetsEnabled(), ...data.assetsEnabled },
        rateSource: data.rateSource === 'coingecko' ? 'coingecko' : 'manual',
        explorerKeys: data.explorerKeys || { etherscan: false, trongrid: false },
      })
    } catch {
      setSettings(defaultPosCryptoPaymentSettings())
    } finally {
      setLoading(false)
    }
  }, [storeCode])

  React.useEffect(() => {
    void load()
  }, [load])

  const tr = (key: string, fallback: string) => t(key) || fallback

  const save = async () => {
    const code = String(storeCode || '').trim()
    if (!code) return
    setSaving(true)
    try {
      const res = await savePosCryptoPaymentSettings({
        storeCode: code,
        enabled: settings.enabled,
        wallets: settings.wallets,
        assetsEnabled: settings.assetsEnabled,
        rateSource: settings.rateSource,
      })
      if (!res.success) {
        await appAlert(tr(res.message || 'msg_save_fail_detail', res.message || '저장에 실패했습니다.'))
        return
      }
      await appAlert(tr('itemsAlertSaved', '저장되었습니다.'))
      await load()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const setWallet = (key: CryptoAssetKey, value: string) => {
    setSettings((s) => ({ ...s, wallets: { ...s.wallets, [key]: value } }))
  }
  const setAssetOn = (key: CryptoAssetKey, on: boolean) => {
    setSettings((s) => ({ ...s, assetsEnabled: { ...s.assetsEnabled, [key]: on } }))
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bitcoin className="h-4 w-4" />
          {tr('posPaymentCrypto', '암호화폐')}
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving || loading || !storeCode}>
          <Save className="h-4 w-4" />
          {saving ? '...' : tr('itemsBtnSave', '저장')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {tr(
          'posCryptoSettingsHint',
          '기본은 꺼져 있습니다. 켠 매장만 POS에 암호화폐 탭이 보입니다. 입금 주소만 넣으세요. 개인키는 넣지 마세요. 입금 감시는 손님이 암호화폐 결제를 시작할 때만 동작합니다.'
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={settings.enabled ? 'default' : 'outline'}
          onClick={() => setSettings((s) => ({ ...s, enabled: true }))}
        >
          {tr('posCryptoMasterOn', '사용')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={!settings.enabled ? 'default' : 'outline'}
          onClick={() => setSettings((s) => ({ ...s, enabled: false }))}
        >
          {tr('posCryptoMasterOff', '사용 안 함')}
        </Button>
      </div>
      {settings.enabled ? (
        <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={settings.rateSource === 'coingecko' ? 'default' : 'outline'}
          onClick={() => setSettings((s) => ({ ...s, rateSource: 'coingecko' }))}
        >
          {tr('posCryptoRateAuto', '환율 자동')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={settings.rateSource === 'manual' ? 'default' : 'outline'}
          onClick={() => setSettings((s) => ({ ...s, rateSource: 'manual' }))}
        >
          {tr('posCryptoRateManual', '환율 수동')}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {tr('posCryptoExplorerKeys', '탐색기 키')} — Etherscan {settings.explorerKeys.etherscan ? 'ON' : 'OFF'} ·
        TronGrid {settings.explorerKeys.trongrid ? 'ON' : 'OFF'}
      </p>
      <p className="text-[11px] text-amber-700 dark:text-amber-400">
        {tr('posCryptoFeeWarn', 'ETH·BTC는 수수료가 식사 금액보다 클 수 있습니다. 보통은 USDT(TRC20)만 켜세요.')}
      </p>
      <div className="space-y-2">
        {CRYPTO_ASSET_KEYS.map((key) => {
          const def = CRYPTO_ASSET_DEFS[key]
          const addr = settings.wallets[key] || ''
          const check = addr ? validateCryptoWalletAddress(key, addr) : { ok: true, errorKey: undefined }
          return (
            <div key={key} className="rounded-lg border px-3 py-2 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {def.asset} · {def.networkLabel}
                </p>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={settings.assetsEnabled[key] ? 'default' : 'outline'}
                    className="h-7"
                    onClick={() => setAssetOn(key, true)}
                  >
                    ON
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!settings.assetsEnabled[key] ? 'default' : 'outline'}
                    className="h-7"
                    onClick={() => setAssetOn(key, false)}
                  >
                    OFF
                  </Button>
                </div>
              </div>
              <Input
                value={addr}
                onChange={(e) => setWallet(key, e.target.value)}
                placeholder={tr('posCryptoWalletPh', '입금 주소')}
                className="h-9 font-mono text-xs"
              />
              {addr && !check.ok ? (
                <p className="text-[11px] text-destructive">
                  {tr(check.errorKey || 'posCryptoWalletInvalid', '주소 형식이 이 네트워크와 맞지 않습니다.')}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
        </>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {tr('posCryptoSettingsMore', '사용을 켜야 코인·주소가 보입니다. 끄면 POS에도 암호화폐가 안 나옵니다.')}
        </p>
      )}
    </div>
  )
}
