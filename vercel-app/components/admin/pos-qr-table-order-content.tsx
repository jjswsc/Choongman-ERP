'use client'

import * as React from 'react'
import { QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStoreList } from '@/lib/api-client'
import {
  qrTableAdminAction,
  qrTableAdminGet,
  qrTableAdminSaveSettings,
} from '@/lib/api-client/qr-table'
import { getPosMenus, getPosTableLayout } from '@/lib/api-client'
import type { QrBuffetTier, QrOrderStoreSettings } from '@/lib/qr-table-types'
import { defaultQrOrderStoreSettings } from '@/lib/qr-table-types'
import { useLang } from '@/lib/lang-context'
import { useT, tOr } from '@/lib/i18n'
import { HelpSumHowBlocks } from '@/components/erp/help-sum-how-blocks'
import { QrTablePrintCardsSection } from '@/components/admin/qr-table-print-cards'
import { appAlert } from '@/lib/app-message'
import { hrefToHelpSummaryKey } from '@/lib/admin-help-registry'
import { useAppBrandConfig } from '@/components/app-brand-provider'

function isSchemaMissingError(msg: string): boolean {
  const m = String(msg || '').toLowerCase()
  return (
    m === 'schema_missing' ||
    m.includes('pgrst205') ||
    m.includes('pos_table_qr_tokens') ||
    m.includes('pos_qr_order_store_settings') ||
    m.includes('pos_buffet_tiers') ||
    m.includes('print_logo_url') ||
    m.includes('could not find the table') ||
    (m.includes('could not find the') && m.includes('column'))
  )
}

export function PosQrTableOrderContent() {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((k: string, fb: string) => tOr(t, k, fb), [t])
  const { posStoreOptions } = useStoreList()
  const brand = useAppBrandConfig()
  const [storeCode, setStoreCode] = React.useState('')
  const [settings, setSettings] = React.useState<QrOrderStoreSettings>(defaultQrOrderStoreSettings(''))
  const [tiers, setTiers] = React.useState<QrBuffetTier[]>([])
  const [tokens, setTokens] = React.useState<Array<{ tableName: string; token: string; publicUrl?: string }>>([])
  const [menus, setMenus] = React.useState<Array<{ id: string; name: string; code: string }>>([])
  const [loading, setLoading] = React.useState(false)
  const [tierForm, setTierForm] = React.useState({
    id: 0,
    code: '',
    nameTh: '',
    nameEn: '',
    nameKo: '',
    pricePerPerson: 299,
    sortOrder: 0,
    active: true,
    includedMenuIds: [] as number[],
  })

  React.useEffect(() => {
    if (!storeCode && posStoreOptions?.length) setStoreCode(posStoreOptions[0].code)
  }, [posStoreOptions, storeCode])

  const alertApiError = React.useCallback(
    async (raw: string) => {
      if (isSchemaMissingError(raw)) {
        await appAlert(tr('qrTableSchemaMissing', 'DB 테이블이 아직 없습니다. SQL을 먼저 실행해 주세요.'))
        return
      }
      await appAlert(raw || 'error')
    },
    [tr]
  )

  const reload = React.useCallback(async () => {
    if (!storeCode) return
    setLoading(true)
    try {
      const data = await qrTableAdminGet(storeCode)
      if (!data.success && data.message) {
        await alertApiError(data.message)
        return
      }
      if (data.settings) setSettings(data.settings)
      setTiers(data.tiers || [])
      setTokens(data.tokens || [])
      const menuRes = await getPosMenus({ storeCode, fresh: true })
      const list = Array.isArray(menuRes) ? menuRes : []
      setMenus(
        list.map((m) => ({
          id: String(m.id || ''),
          name: String(m.name || ''),
          code: String(m.code || ''),
        }))
      )
    } catch (e) {
      await alertApiError(e instanceof Error ? e.message : 'load_failed')
    } finally {
      setLoading(false)
    }
  }, [storeCode, alertApiError])

  React.useEffect(() => {
    void reload()
  }, [storeCode]) // eslint-disable-line react-hooks/exhaustive-deps -- storeCode only; avoid reload identity loops

  async function saveSettings() {
    const res = await qrTableAdminSaveSettings({ ...settings, storeCode })
    if (!res.success) {
      await alertApiError(res.message || 'save_failed')
      return
    }
    if (res.settings) setSettings(res.settings)
    await appAlert(tr('qrTableSaved', '저장했습니다.'))
  }

  async function saveTier() {
    const res = await qrTableAdminAction({
      action: 'saveTier',
      storeCode,
      id: tierForm.id || undefined,
      code: tierForm.code,
      nameTh: tierForm.nameTh,
      nameEn: tierForm.nameEn,
      nameKo: tierForm.nameKo,
      pricePerPerson: tierForm.pricePerPerson,
      sortOrder: tierForm.sortOrder,
      active: tierForm.active,
      includedMenuIds: tierForm.includedMenuIds,
    })
    if (!res.success) {
      await alertApiError(res.message || 'tier_save_failed')
      return
    }
    setTierForm({
      id: 0,
      code: '',
      nameTh: '',
      nameEn: '',
      nameKo: '',
      pricePerPerson: 299,
      sortOrder: 0,
      active: true,
      includedMenuIds: [],
    })
    await reload()
  }

  async function generateTokens() {
    try {
      const layout = await getPosTableLayout({ storeCode, forceNetwork: true })
      const tables = (layout?.layout || []) as Array<{ name?: string }>
      const tableNames = tables.map((tb) => String(tb.name || '').trim()).filter(Boolean)
      if (!tableNames.length) {
        await appAlert(tr('qrTableNoTables', '테이블 레이아웃에 테이블이 없습니다.'))
        return
      }
      const res = await qrTableAdminAction({ action: 'generateTokens', storeCode, tableNames })
      if (!res.success) {
        await alertApiError(res.message || 'token_failed')
        return
      }
      setTokens(res.tokens || [])
      await appAlert(tr('qrTableTokensReady', 'QR 토큰을 생성했습니다.'))
    } catch (e) {
      await alertApiError(e instanceof Error ? e.message : 'token_failed')
    }
  }

  function toggleMenu(id: number) {
    setTierForm((prev) => {
      const has = prev.includedMenuIds.includes(id)
      return {
        ...prev,
        includedMenuIds: has ? prev.includedMenuIds.filter((x) => x !== id) : [...prev.includedMenuIds, id],
      }
    })
  }

  const menusCountLabel = (n: number) =>
    tr('qrTableTierMenusCount', '포함 메뉴 {n}개').replace('{n}', String(n))

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <QrCode className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {tr('adminPosQrTableOrder', 'QR 테이블오더')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tr(
                'adminPosQrTableOrderDesc',
                '매장별 QR 오더 ON/OFF, 결제 모드, 가격 티어·포함 메뉴, 테이블 QR 인쇄를 관리합니다.'
              )}
            </p>
          </div>
        </div>

        <HelpSumHowBlocks helpSumKey={hrefToHelpSummaryKey('/admin/pos-qr-table-order')} />

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 sm:flex-none">
            <Label>{tr('store', '매장')}</Label>
            <Select value={storeCode} onValueChange={setStoreCode}>
              <SelectTrigger>
                <SelectValue placeholder={tr('qrTableSelectStore', '매장 선택')} />
              </SelectTrigger>
              <SelectContent>
                {(posStoreOptions || []).map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.label || s.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void reload()} disabled={loading}>
            {tr('refresh', '새로고침')}
          </Button>
        </div>

        <section className="space-y-4 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">{tr('qrTableSettings', '매장 설정')}</h2>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{tr('qrTableEnabled', 'QR 테이블오더 사용')}</span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{tr('qrTableMode', '주문 모드')}</Label>
              <Select
                value={settings.mode}
                onValueChange={(v) => setSettings((s) => ({ ...s, mode: v as QrOrderStoreSettings['mode'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buffet">{tr('qrTableModeBuffet', '티어(뷔페형)')}</SelectItem>
                  <SelectItem value="a_la_carte">{tr('qrTableModeAlaCarte', '일반 메뉴')}</SelectItem>
                  <SelectItem value="both">{tr('qrTableModeBoth', '티어 + 일반')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between gap-3 pt-6 text-sm">
              <span>{tr('qrTableRequireStaffOpen', '직원 세션 오픈 필수')}</span>
              <input
                type="checkbox"
                checked={settings.requireStaffOpen}
                onChange={(e) => setSettings((s) => ({ ...s, requireStaffOpen: e.target.checked }))}
              />
            </label>
            <div>
              <Label>{tr('qrTableEntryPay', '입장가(티어) 결제')}</Label>
              <Select
                value={settings.entryPaymentMode}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, entryPaymentMode: v as QrOrderStoreSettings['entryPaymentMode'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postpay">{tr('qrTablePayPostpay', '후불 (POS)')}</SelectItem>
                  <SelectItem value="prepay">{tr('qrTablePayPrepay', '선결제 (손님 QR)')}</SelectItem>
                  <SelectItem value="guest_choice">{tr('qrTablePayGuestChoice', '손님이 선택')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{tr('qrTableExtrasPay', '별도 메뉴 결제')}</Label>
              <Select
                value={settings.extrasPaymentMode}
                onValueChange={(v) =>
                  setSettings((s) => ({ ...s, extrasPaymentMode: v as QrOrderStoreSettings['extrasPaymentMode'] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="postpay">{tr('qrTablePayPostpay', '후불 (POS)')}</SelectItem>
                  <SelectItem value="prepay">{tr('qrTablePayPrepay', '선결제 (손님 QR)')}</SelectItem>
                  <SelectItem value="guest_choice">{tr('qrTablePayGuestChoice', '손님이 선택')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {tr('qrTablePrintBrand', '인쇄 카드 브랜드')}
            </h3>
            <div>
              <Label>{tr('qrTablePrintLogoUrl', '로고 URL')}</Label>
              <Input
                placeholder="https://…"
                value={settings.printLogoUrl || ''}
                onChange={(e) => setSettings((s) => ({ ...s, printLogoUrl: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{tr('qrTablePrintBrandColor', '브랜드 색')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    className="h-9 w-12 p-1"
                    value={/^#[0-9a-fA-F]{6}$/.test(settings.printBrandColor || '') ? settings.printBrandColor! : '#b45309'}
                    onChange={(e) => setSettings((s) => ({ ...s, printBrandColor: e.target.value }))}
                  />
                  <Input
                    value={settings.printBrandColor || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, printBrandColor: e.target.value }))}
                    placeholder="#b45309"
                  />
                </div>
              </div>
              <div>
                <Label>{tr('qrTablePrintAccentColor', '배경 액센트')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    className="h-9 w-12 p-1"
                    value={/^#[0-9a-fA-F]{6}$/.test(settings.printAccentColor || '') ? settings.printAccentColor! : '#faf7f2'}
                    onChange={(e) => setSettings((s) => ({ ...s, printAccentColor: e.target.value }))}
                  />
                  <Input
                    value={settings.printAccentColor || ''}
                    onChange={(e) => setSettings((s) => ({ ...s, printAccentColor: e.target.value }))}
                    placeholder="#faf7f2"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label>{tr('qrTablePrintBrandLine', '카드 부제 (브랜드 문구)')}</Label>
              <Input
                value={settings.printBrandLine || ''}
                onChange={(e) => setSettings((s) => ({ ...s, printBrandLine: e.target.value }))}
                placeholder={String(brand?.appName || '').trim() || 'Omni'}
              />
            </div>
          </div>
          <Button onClick={() => void saveSettings()}>{tr('save', '저장')}</Button>
        </section>

        <section className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">{tr('qrTableTiers', '가격 티어')}</h2>
          <ul className="space-y-2 text-sm">
            {tiers.map((tier) => (
              <li
                key={tier.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <span>
                  {tier.code} · {tier.nameEn || tier.nameTh || tier.nameKo} · ฿{tier.pricePerPerson} ·{' '}
                  {menusCountLabel((tier.includedMenuIds || []).length)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTierForm({
                      id: tier.id,
                      code: tier.code,
                      nameTh: tier.nameTh,
                      nameEn: tier.nameEn,
                      nameKo: tier.nameKo,
                      pricePerPerson: tier.pricePerPerson,
                      sortOrder: tier.sortOrder,
                      active: tier.active,
                      includedMenuIds: [...(tier.includedMenuIds || [])],
                    })
                  }
                >
                  {tr('edit', '수정')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder={tr('qrTableTierCodePh', '코드 (예: STD)')}
              value={tierForm.code}
              onChange={(e) => setTierForm((f) => ({ ...f, code: e.target.value }))}
            />
            <Input
              type="number"
              placeholder={tr('qrTableTierPricePh', '인당 가격 (฿)')}
              value={tierForm.pricePerPerson}
              onChange={(e) => setTierForm((f) => ({ ...f, pricePerPerson: Number(e.target.value || 0) }))}
            />
            <Input
              placeholder={tr('qrTableTierNameThPh', '이름 (태국어)')}
              value={tierForm.nameTh}
              onChange={(e) => setTierForm((f) => ({ ...f, nameTh: e.target.value }))}
            />
            <Input
              placeholder={tr('qrTableTierNameEnPh', '이름 (영어)')}
              value={tierForm.nameEn}
              onChange={(e) => setTierForm((f) => ({ ...f, nameEn: e.target.value }))}
            />
            <Input
              placeholder={tr('qrTableTierNameKoPh', '이름 (한국어)')}
              value={tierForm.nameKo}
              onChange={(e) => setTierForm((f) => ({ ...f, nameKo: e.target.value }))}
            />
          </div>
          <div className="max-h-56 overflow-auto rounded border p-2">
            <p className="mb-2 text-xs text-muted-foreground">{tr('qrTableIncludedMenus', '포함 메뉴')}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {menus.map((m) => {
                const id = Number(m.id)
                const checked = tierForm.includedMenuIds.includes(id)
                return (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggleMenu(id)} />
                    <span className="truncate">
                      {m.code} {m.name}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
          <Button onClick={() => void saveTier()}>
            {tierForm.id ? tr('update', '수정 저장') : tr('add', '추가')}
          </Button>
        </section>

        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{tr('qrTableTokens', '테이블 QR')}</h2>
            <Button variant="outline" size="sm" onClick={() => void generateTokens()}>
              {tr('qrTableGenerateTokens', '레이아웃 기준 생성')}
            </Button>
          </div>
          {!tokens.length ? (
            <p className="text-sm text-muted-foreground">
              {tr('qrTableTokensEmpty', '아직 QR이 없습니다. 「레이아웃 기준 생성」을 눌러 주세요.')}
            </p>
          ) : (
            <QrTablePrintCardsSection
              storeLabel={posStoreOptions.find((s) => s.code === storeCode)?.label || storeCode}
              brandLine={
                String(settings.printBrandLine || '').trim() ||
                String(brand?.appName || '').trim() ||
                undefined
              }
              logoUrl={String(settings.printLogoUrl || '').trim() || undefined}
              brandColor={String(settings.printBrandColor || '').trim() || undefined}
              accentColor={String(settings.printAccentColor || '').trim() || undefined}
              tokens={tokens}
              labels={{
                title: tr('qrTablePrintTitle', '테이블별 QR 카드 (인쇄·다운로드)'),
                hint: tr(
                  'qrTablePrintHint',
                  '손님용 테이블 카드입니다. PNG 단건 저장, PDF 일괄 저장, 브라우저 인쇄를 지원합니다.'
                ),
                downloadOne: tr('qrTableDownloadPng', 'PNG 다운로드'),
                downloadAllPdf: tr('qrTableDownloadPdf', '전체 PDF'),
                printAll: tr('qrTablePrintAll', '전체 인쇄'),
                preview: tr('qrTableCardPreview', '미리보기'),
                scanTh: tr('qrTableScanTh', 'สแกนเพื่อสั่งอาหาร'),
                scanEn: tr('qrTableScanShortEn', 'Scan to order'),
                popupBlocked: tr('qrTablePopupBlocked', '팝업이 차단되었습니다.'),
              }}
            />
          )}
          {tokens.length > 0 ? (
            <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                {tr('qrTableUrlList', 'URL 목록')}
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                {tokens.map((tok) => (
                  <li key={tok.token}>
                    <span className="font-medium">{tok.tableName}</span>{' '}
                    <a
                      className="break-all text-xs text-primary underline"
                      href={tok.publicUrl || `/t/${tok.token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tok.publicUrl || `/t/${tok.token}`}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  )
}
