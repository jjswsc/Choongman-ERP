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
import { buffetTierDisplayName, defaultQrOrderStoreSettings } from '@/lib/qr-table-types'
import { useLang } from '@/lib/lang-context'
import { useT, tOr } from '@/lib/i18n'
import { HelpSumHowBlocks } from '@/components/erp/help-sum-how-blocks'
import { QrTablePrintCardsSection } from '@/components/admin/qr-table-print-cards'
import { appAlert, appConfirm } from '@/lib/app-message'
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

const EMPTY_TIER_FORM = {
  id: 0,
  code: '',
  nameTh: '',
  nameEn: '',
  nameKo: '',
  pricePerPerson: 299,
  sortOrder: 0,
  active: true,
  validFrom: '',
  validTo: '',
  includedMenuIds: [] as number[],
}

function autoTierCode(form: typeof EMPTY_TIER_FORM, existingCodes: string[]): string {
  const typed = String(form.code || '').trim().toUpperCase()
  if (typed) return typed
  const fromName = String(form.nameEn || form.nameTh || form.nameKo || '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 6)
    .toUpperCase()
  let base = fromName || `P${Math.round(form.pricePerPerson) || 0}`
  if (!base) base = 'PKG'
  const taken = new Set(existingCodes.map((c) => c.toUpperCase()))
  if (!taken.has(base)) return base
  for (let i = 2; i < 99; i++) {
    const cand = `${base.slice(0, 4)}${i}`
    if (!taken.has(cand)) return cand
  }
  return `${base}${Date.now().toString(36).slice(-3).toUpperCase()}`
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
  const [menuSearch, setMenuSearch] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [tierForm, setTierForm] = React.useState(EMPTY_TIER_FORM)

  const usesPackage = settings.mode === 'buffet' || settings.mode === 'both'

  const filteredMenus = React.useMemo(() => {
    const q = menuSearch.trim().toLowerCase()
    if (!q) return menus
    return menus.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        String(m.id).includes(q)
    )
  }, [menus, menuSearch])

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

  function resetTierForm() {
    setTierForm(EMPTY_TIER_FORM)
    setMenuSearch('')
    setEditing(false)
  }

  function startNewTier() {
    setTierForm({ ...EMPTY_TIER_FORM, sortOrder: tiers.length })
    setMenuSearch('')
    setEditing(true)
  }

  function startEditTier(tier: QrBuffetTier) {
    setTierForm({
      id: tier.id,
      code: tier.code,
      nameTh: tier.nameTh,
      nameEn: tier.nameEn,
      nameKo: tier.nameKo,
      pricePerPerson: tier.pricePerPerson,
      sortOrder: tier.sortOrder,
      active: tier.active,
      validFrom: String(tier.validFrom || '').slice(0, 10),
      validTo: String(tier.validTo || '').slice(0, 10),
      includedMenuIds: [...(tier.includedMenuIds || [])],
    })
    setMenuSearch('')
    setEditing(true)
  }

  async function saveTier() {
    const displayName = String(tierForm.nameTh || tierForm.nameEn || tierForm.nameKo || '').trim()
    if (!displayName) {
      await appAlert(tr('qrTableTierNameRequired', '패키지 이름을 입력해 주세요.'))
      return
    }
    const code = autoTierCode(
      tierForm,
      tiers.filter((x) => x.id !== tierForm.id).map((x) => x.code)
    )
    const res = await qrTableAdminAction({
      action: 'saveTier',
      storeCode,
      id: tierForm.id || undefined,
      code,
      nameTh: tierForm.nameTh || displayName,
      nameEn: tierForm.nameEn,
      nameKo: tierForm.nameKo,
      pricePerPerson: tierForm.pricePerPerson,
      sortOrder: tierForm.sortOrder,
      active: tierForm.active,
      validFrom: tierForm.validFrom || null,
      validTo: tierForm.validTo || null,
      includedMenuIds: tierForm.includedMenuIds,
    })
    if (!res.success) {
      await alertApiError(res.message || 'tier_save_failed')
      return
    }
    resetTierForm()
    await reload()
    await appAlert(tr('qrTableSaved', '저장했습니다.'))
  }

  async function deleteTier(tier: QrBuffetTier) {
    const ok = await appConfirm(
      tr('qrTableTierDeleteConfirm', '이 패키지를 삭제할까요?').replace(
        '{name}',
        buffetTierDisplayName(tier, lang)
      )
    )
    if (!ok) return
    const res = await qrTableAdminAction({ action: 'deleteTier', storeCode, tierId: tier.id })
    if (!res.success) {
      await alertApiError(res.message || 'tier_delete_failed')
      return
    }
    if (tierForm.id === tier.id) resetTierForm()
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
                '매장별 QR 주문 켜기, 인당 패키지·포함 메뉴, 테이블 QR 인쇄를 관리합니다.'
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

        {/* 1) 기본 설정 */}
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">{tr('qrTableSettings', '매장 설정')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tr('qrTableSettingsHint', '켜고 → 주문 방식 → 결제 시점만 정하면 됩니다.')}
            </p>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm">
            <span className="font-medium">{tr('qrTableEnabled', 'QR 테이블오더 사용')}</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={settings.enabled}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>{tr('qrTableMode', '주문 방식')}</Label>
              <Select
                value={settings.mode}
                onValueChange={(v) => setSettings((s) => ({ ...s, mode: v as QrOrderStoreSettings['mode'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buffet">{tr('qrTableModeBuffet', '인당 패키지')}</SelectItem>
                  <SelectItem value="a_la_carte">{tr('qrTableModeAlaCarte', '메뉴별 주문')}</SelectItem>
                  <SelectItem value="both">{tr('qrTableModeBoth', '패키지 + 메뉴별')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {settings.mode === 'buffet'
                  ? tr('qrTableModeBuffetHint', '손님·POS가 인당 요금제를 고른 뒤, 포함 메뉴는 0฿로 주문합니다.')
                  : settings.mode === 'a_la_carte'
                    ? tr('qrTableModeAlaCarteHint', '패키지 없이 메뉴 가격으로만 주문합니다.')
                    : tr('qrTableModeBothHint', '패키지를 고르거나, 패키지 없이 메뉴만 주문할 수 있습니다.')}
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm sm:mt-6">
              <span>{tr('qrTableRequireStaffOpen', '직원 세션 오픈 필수')}</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={settings.requireStaffOpen}
                onChange={(e) => setSettings((s) => ({ ...s, requireStaffOpen: e.target.checked }))}
              />
            </label>
          </div>

          {usesPackage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>{tr('qrTableEntryPay', '패키지(입장) 결제')}</Label>
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
          ) : (
            <div>
              <Label>{tr('qrTableExtrasPay', '메뉴 결제')}</Label>
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
          )}

          <details className="rounded-md border border-dashed px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              {tr('qrTableAdvanced', '고급 (세션 시간 · 인쇄 브랜드)')}
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <Label>{tr('qrTableMaxOpenMinutes', '세션 최대 시간(분)')}</Label>
                <Input
                  type="number"
                  min={30}
                  max={720}
                  value={settings.maxOpenMinutes}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      maxOpenMinutes: Math.max(30, Math.min(720, Number(e.target.value || 240))),
                    }))
                  }
                />
              </div>
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
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(settings.printBrandColor || '')
                          ? settings.printBrandColor!
                          : '#b45309'
                      }
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
                      value={
                        /^#[0-9a-fA-F]{6}$/.test(settings.printAccentColor || '')
                          ? settings.printAccentColor!
                          : '#faf7f2'
                      }
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
          </details>

          <Button onClick={() => void saveSettings()}>{tr('save', '저장')}</Button>
        </section>

        {/* 2) 인당 패키지 */}
        {usesPackage ? (
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{tr('qrTableTiers', '인당 패키지')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {tr(
                    'qrTableTiersHint',
                    '예: 성인 ฿399 · 어린이 ฿199. 포함 메뉴는 손님 앱에서 0฿로 주문됩니다.'
                  )}
                </p>
              </div>
              {!editing ? (
                <Button size="sm" onClick={startNewTier}>
                  {tr('qrTableTierAdd', '패키지 추가')}
                </Button>
              ) : null}
            </div>

            {!editing ? (
              <ul className="space-y-2">
                {tiers.length === 0 ? (
                  <li className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                    {tr('qrTableTiersEmpty', '아직 패키지가 없습니다. 「패키지 추가」로 만들어 주세요.')}
                  </li>
                ) : (
                  tiers.map((tier) => (
                    <li
                      key={tier.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-3 ${
                        tier.active ? 'bg-background' : 'bg-muted/40 opacity-70'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-semibold">
                            {buffetTierDisplayName(tier, lang)}
                          </span>
                          <span className="text-sm tabular-nums text-foreground">
                            ฿{Number(tier.pricePerPerson).toLocaleString()}
                            <span className="text-xs text-muted-foreground">
                              {tr('qrTablePerPax', '/인')}
                            </span>
                          </span>
                          {!tier.active ? (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {tr('qrTableTierInactive', '비활성')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {menusCountLabel((tier.includedMenuIds || []).length)}
                          {tier.code ? ` · ${tier.code}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => startEditTier(tier)}>
                          {tr('edit', '수정')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void deleteTier(tier)}>
                          {tr('delete', '삭제')}
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {tierForm.id
                      ? tr('qrTableTierEditing', '패키지 수정')
                      : tr('qrTableTierCreating', '새 패키지')}
                  </p>
                  <Button size="sm" variant="ghost" onClick={resetTierForm}>
                    {tr('cancel', '취소')}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>{tr('qrTableTierNamePrimary', '패키지 이름 (태국어 · 손님 앱 기본)')}</Label>
                    <Input
                      placeholder={tr('qrTableTierNameThPh', '예: ผู้ใหญ่ / Adult')}
                      value={tierForm.nameTh}
                      onChange={(e) => setTierForm((f) => ({ ...f, nameTh: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>{tr('qrTableTierPricePh', '인당 가격 (฿)')}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={tierForm.pricePerPerson}
                      onChange={(e) =>
                        setTierForm((f) => ({ ...f, pricePerPerson: Number(e.target.value || 0) }))
                      }
                    />
                  </div>
                  <label className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm sm:mt-6">
                    <span>{tr('qrTableTierActive', '사용')}</span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={tierForm.active}
                      onChange={(e) => setTierForm((f) => ({ ...f, active: e.target.checked }))}
                    />
                  </label>
                </div>

                <details className="rounded-md border bg-background px-3 py-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {tr('qrTableTierMoreNames', '다른 언어 · 코드 · 기간 (선택)')}
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                    <Input
                      placeholder={tr('qrTableTierCodePh', '코드 (비우면 자동)')}
                      value={tierForm.code}
                      onChange={(e) => setTierForm((f) => ({ ...f, code: e.target.value }))}
                    />
                    <div />
                    <div>
                      <Label className="text-xs">{tr('qrTableTierValidFrom', '유효 시작일')}</Label>
                      <Input
                        type="date"
                        value={tierForm.validFrom}
                        onChange={(e) => setTierForm((f) => ({ ...f, validFrom: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{tr('qrTableTierValidTo', '유효 종료일')}</Label>
                      <Input
                        type="date"
                        value={tierForm.validTo}
                        onChange={(e) => setTierForm((f) => ({ ...f, validTo: e.target.value }))}
                      />
                    </div>
                  </div>
                </details>

                <div className="rounded-md border bg-background p-2">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium">{tr('qrTableIncludedMenus', '포함 메뉴')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {tr(
                          'qrTableIncludedMenusHint',
                          '체크한 메뉴는 손님 앱에서 0฿. 이 화면에서만 고르면 됩니다.'
                        )}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {menusCountLabel(tierForm.includedMenuIds.length)}
                    </span>
                  </div>
                  <Input
                    className="mb-2"
                    placeholder={tr('qrTableMenuSearch', '메뉴 검색…')}
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                  />
                  <div className="max-h-56 overflow-auto">
                    <div className="grid gap-1 sm:grid-cols-2">
                      {filteredMenus.length === 0 ? (
                        <p className="col-span-full px-1 py-3 text-sm text-muted-foreground">
                          {menus.length === 0
                            ? tr('qrTableIncludedMenusEmpty', '이 매장에 등록된 메뉴가 없습니다.')
                            : tr('qrTableMenuSearchEmpty', '검색 결과가 없습니다.')}
                        </p>
                      ) : (
                        filteredMenus.map((m) => {
                          const id = Number(m.id)
                          const checked = tierForm.includedMenuIds.includes(id)
                          return (
                            <label
                              key={m.id}
                              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 ${
                                checked ? 'bg-primary/5' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleMenu(id)}
                              />
                              <span className="min-w-0 truncate">
                                <span className="text-muted-foreground">{m.code}</span> {m.name}
                              </span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void saveTier()}>
                    {tierForm.id ? tr('update', '수정 저장') : tr('add', '추가')}
                  </Button>
                  <Button variant="outline" onClick={resetTierForm}>
                    {tr('cancel', '취소')}
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {/* 3) 테이블 QR */}
        <section className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">{tr('qrTableTokens', '테이블 QR')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tr('qrTableTokensHint', '테이블 레이아웃 기준으로 QR을 만든 뒤 인쇄·부착합니다.')}
              </p>
            </div>
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
              formatLabels={{
                format: tr('qrTablePrintFormat', '규격'),
                a6: tr('qrTablePrintFormatA6', 'A6 텐트'),
                square: tr('qrTablePrintFormatSquare', '정사각'),
                sticker: tr('qrTablePrintFormatSticker', '스티커'),
              }}
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
