"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Printer, Save, RotateCw, Wallet, Receipt, Building2, Copy, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT, tr as i18nTr } from "@/lib/i18n"
import {
  getPosPrinterSettings,
  getPosMenuCategories,
  getPosMenus,
  savePosPrinterSettings,
  useStoreList,
  type PosMenu,
  type PosPrinterSettings,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole, canAccessPosPrinters } from "@/lib/permissions"
import { cn, escapeHtml } from "@/lib/utils"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import {
  alignKitchenCategoryRouteKeyMap,
  buildKitchenSlipGroupOpts,
  buildKitchenSlipGroups,
  normalizeKitchenRouteMapInput,
  type KitchenRouteValue,
} from "@/lib/pos-kitchen-slip-routing"
import { buildKitchenSlipDocumentHtml, resolveKitchenSlipDesign } from "@/lib/pos-kitchen-slip-html"
import {
  bangkokTodayYmdCompact,
  buildStoredPosOrderNo,
  formatPosOrderNoForPrint,
  normalizeStoreSlugForOrderNo,
} from "@/lib/pos-order-no"
import {
  RECEIPT_AMOUNT_COL_MM,
  RECEIPT_CONTENT_NUDGE_LEFT_MM,
  RECEIPT_GRID_COL_GAP_PX,
  RECEIPT_INNER_INSET_LEFT_MM,
  RECEIPT_INNER_INSET_RIGHT_MM,
  RECEIPT_TRAILING_BOTTOM_MM,
} from "@/lib/pos-receipt-layout"
import { POS_THERMAL_RECEIPT_WIDTH_MM, posThermalReceiptPageSizeRule } from "@/lib/pos-receipt-paper"
import { PosDualMonitorSettingsContent } from "@/components/pos/pos-dual-monitor-settings-content"
import {
  printPosHtmlDocument,
  POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS,
  type PrintPosHtmlDocumentOptions,
} from "@/lib/pos-print-html"
import { resolveEscPosCutOverride } from "@/lib/pos-thermal-escpos-cut"

type PreviewKind = "receipt" | "kitchen"

const POS_PAPER_SIDE_PADDING_MM = 0
const RECEIPT_ASSET_MAX_BYTES = 1024 * 700

const buildCode128BarcodeUrl = (raw: string) => {
  const text = String(raw || "").trim()
  if (!text) return ""
  return `https://quickchart.io/barcode?type=code128&text=${encodeURIComponent(text)}&scale=2&height=38&includetext=true`
}

const getPosPaperBaseCss = (fontFamily: string, fontSizePx: number) => `
  ${posThermalReceiptPageSizeRule()}
  html, body { margin: 0; padding: 0; }
  html { height: auto; }
  body {
    width: ${POS_THERMAL_RECEIPT_WIDTH_MM}mm;
    max-width: ${POS_THERMAL_RECEIPT_WIDTH_MM}mm;
    min-height: auto;
    height: auto;
    box-sizing: border-box;
    font-family: ${fontFamily};
    font-size: ${fontSizePx}px;
    padding: ${POS_PAPER_SIDE_PADDING_MM}mm ${RECEIPT_INNER_INSET_RIGHT_MM}mm ${POS_PAPER_SIDE_PADDING_MM}mm ${RECEIPT_INNER_INSET_LEFT_MM}mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    body { zoom: 1; }
  }
`

function ToggleRow({
  label,
  value,
  onChange,
  t,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  t: (k: string) => string
}) {
  const yesLabel = t("yes")
  const noLabel = t("no")
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "rounded-md border px-3 py-1 text-sm",
            value ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
          )}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "rounded-md border px-3 py-1 text-sm",
            !value ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
          )}
        >
          {noLabel}
        </button>
      </div>
    </div>
  )
}

function KitchenRouteSelectRow({
  label,
  value,
  onChange,
  maxK,
  t,
}: {
  label: string
  value: KitchenRouteValue | undefined
  onChange: (v: KitchenRouteValue | undefined) => void
  maxK: 1 | 2 | 3
  t: (k: string) => string
}) {
  const trLocal = (key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0">
      <span className="min-w-0 flex-1 text-xs text-foreground">{label}</span>
      <Select
        value={String(value == null ? 1 : value)}
        onValueChange={(v) => {
          onChange(Number(v) as KitchenRouteValue)
        }}
      >
        <SelectTrigger className="h-8 w-[148px] shrink-0 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {maxK >= 1 ? <SelectItem value="1">{trLocal("posKitchen1", "주방 1")}</SelectItem> : null}
          <SelectItem value="0">{trLocal("posKitchenSkipPrint", "출력 안함")}</SelectItem>
          {maxK >= 2 ? <SelectItem value="2">{trLocal("posKitchen2", "주방 2")}</SelectItem> : null}
          {maxK >= 3 ? <SelectItem value="3">{trLocal("posKitchen3", "주방 3")}</SelectItem> : null}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function PosPrintersPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((key: string, fallback: string) => {
    const value = t(key)
    return value && value !== key ? value : fallback
  }, [t])
  const bangkokLocaleTag = React.useMemo(() => {
    const m: Record<string, string> = {
      ko: "ko-KR",
      en: "en-GB",
      th: "th-TH",
      mm: "my-MM",
      la: "lo-LA",
      kh: "km-KH",
      vi: "vi-VN",
      ms: "ms-MY",
    }
    return m[lang] || "en-GB"
  }, [lang])
  const formatBangkokDateTime = React.useCallback(
    (d: Date) =>
      new Intl.DateTimeFormat(bangkokLocaleTag, {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(d),
    [bangkokLocaleTag]
  )
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [kitchenMode, setKitchenMode] = React.useState<1 | 2 | 3>(1)
  const [, setMainDeviceTokensPreview] = React.useState<string[]>([])
  /** 영수증 미리보기용 (DB 값, 메뉴 관리 최종가격 탭에서 수정) */
  const [receiptPreviewDelivery, setReceiptPreviewDelivery] = React.useState(0)
  const [receiptPreviewPackaging, setReceiptPreviewPackaging] = React.useState(0)
  const [categories, setCategories] = React.useState<string[]>([])
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [menusList, setMenusList] = React.useState<PosMenu[]>([])
  const [kitchenRouteByMenu, setKitchenRouteByMenu] = React.useState<Record<string, KitchenRouteValue>>(
    {}
  )
  const [kitchenRouteByCategory, setKitchenRouteByCategory] = React.useState<
    Record<string, KitchenRouteValue>
  >({})
  const [kitchenRouteByCategoryMain, setKitchenRouteByCategoryMain] = React.useState<
    Record<string, KitchenRouteValue>
  >({})
  const [menuRouteFilter, setMenuRouteFilter] = React.useState("")
  const [kitchen1Categories, setKitchen1Categories] = React.useState<string[]>([])
  const [kitchen2Categories, setKitchen2Categories] = React.useState<string[]>([])
  const [kitchen3Categories, setKitchen3Categories] = React.useState<string[]>([])
  const [copyDialogOpen, setCopyDialogOpen] = React.useState(false)
  const [copySourceStore, setCopySourceStore] = React.useState("")
  const [copyTabPrinter, setCopyTabPrinter] = React.useState(true)
  const [copyTabReceipt, setCopyTabReceipt] = React.useState(true)
  const [copyTabReceiptDesign, setCopyTabReceiptDesign] = React.useState(true)
  const [copyTabBusiness, setCopyTabBusiness] = React.useState(true)
  const [copyTabDrawer, setCopyTabDrawer] = React.useState(true)
  const [copyTabDualMonitor, setCopyTabDualMonitor] = React.useState(true)
  const [copySaveImmediately, setCopySaveImmediately] = React.useState(false)
  const [copyWorking, setCopyWorking] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const loadRequestSeqRef = React.useRef(0)
  /** loadData 와 분리 — 저장 직후 메뉴/카테고리만 갱신할 때 loadData 시퀀스를 밟지 않음(로딩 플래그·무효화 레이스 방지) */
  const catalogRequestSeqRef = React.useRef(0)
  const [quickTesting, setQuickTesting] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "queued" | "error">(
    "idle"
  )
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null)
  const [previewKind, setPreviewKind] = React.useState<PreviewKind>("receipt")
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("printer")

  const [drawerOpenOption, setDrawerOpenOption] = React.useState<'password_and_reason' | 'reason_only' | 'force'>('reason_only')

  const [logoPrint, setLogoPrint] = React.useState(false)
  const [receiptPrintTiming, setReceiptPrintTiming] = React.useState<'per_payment' | 'final_payment'>('per_payment')
  const [signatureLine, setSignatureLine] = React.useState(false)
  const [receiptBarcode, setReceiptBarcode] = React.useState(false)
  const [itemBarcode, setItemBarcode] = React.useState(false)
  const [qrCodeOption, setQrCodeOption] = React.useState<'yes' | 'no'>('yes')
  const [discountSeparatePrint, setDiscountSeparatePrint] = React.useState(true)
  const [toppingOptionsPrint, setToppingOptionsPrint] = React.useState(false)
  const [autoPrintReceiptOnOrder, setAutoPrintReceiptOnOrder] = React.useState(false)
  const [autoPrintReceiptOnAddOrder, setAutoPrintReceiptOnAddOrder] = React.useState(false)
  const [autoPrintReceiptOnPayment, setAutoPrintReceiptOnPayment] = React.useState(false)
  const [autoPrintKitchenSlipOnOrder, setAutoPrintKitchenSlipOnOrder] = React.useState(false)
  const [autoPrintFinalOrderBeforePayment, setAutoPrintFinalOrderBeforePayment] = React.useState(false)
  const [escPosCutAfterKitchenHtml, setEscPosCutAfterKitchenHtml] = React.useState(true)
  const [escPosCutAfterHallOrderHtml, setEscPosCutAfterHallOrderHtml] = React.useState(false)
  const [escPosCutAfterPaymentReceiptHtml, setEscPosCutAfterPaymentReceiptHtml] = React.useState(false)
  const [receiptBizName, setReceiptBizName] = React.useState("")
  const [receiptBizTaxId, setReceiptBizTaxId] = React.useState("")
  const [receiptBizAbn, setReceiptBizAbn] = React.useState("")
  const [receiptBizOwner, setReceiptBizOwner] = React.useState("")
  const [receiptBizAddress, setReceiptBizAddress] = React.useState("")
  const [receiptBizPhone, setReceiptBizPhone] = React.useState("")
  const [receiptDesignStyle, setReceiptDesignStyle] = React.useState<'badge' | 'simple'>('badge')
  const [receiptLogoSize, setReceiptLogoSize] = React.useState<'sm' | 'md' | 'lg'>('md')
  const [receiptShowTitle, setReceiptShowTitle] = React.useState(true)
  const [receiptShowPaidStamp, setReceiptShowPaidStamp] = React.useState(true)
  const [receiptShowThankYou, setReceiptShowThankYou] = React.useState(true)
  const [receiptShowCustomerCopy, setReceiptShowCustomerCopy] = React.useState(true)
  const [receiptFooterPrimaryText, setReceiptFooterPrimaryText] = React.useState("")
  const [receiptFooterSecondaryText, setReceiptFooterSecondaryText] = React.useState("")
  const [receiptLogoImageUrl, setReceiptLogoImageUrl] = React.useState("")
  const [receiptStampImageUrl, setReceiptStampImageUrl] = React.useState("")
  const [receiptShowStamp, setReceiptShowStamp] = React.useState(true)
  const [receiptStampOnlyTaxInvoice, setReceiptStampOnlyTaxInvoice] = React.useState(true)
  const [receiptMembershipQrImageUrl, setReceiptMembershipQrImageUrl] = React.useState("")
  const [receiptMembershipQrLinkUrl, setReceiptMembershipQrLinkUrl] = React.useState("")
  const [receiptMembershipQrText, setReceiptMembershipQrText] = React.useState("")
  const [receiptShowMembershipQr, setReceiptShowMembershipQr] = React.useState(false)
  const [receiptPrintLang, setReceiptPrintLang] = React.useState<string>("")
  const [kitchenSlipFontScale, setKitchenSlipFontScale] = React.useState<"sm" | "md" | "lg">("md")
  const [kitchenSlipShowLineNotes, setKitchenSlipShowLineNotes] = React.useState(true)
  const [kitchenSlipShowOrderMemo, setKitchenSlipShowOrderMemo] = React.useState(true)

  const canSearchAll = isOfficeRole(auth?.role || "")
  const effectiveStore = String(canSearchAll && storeCode ? storeCode : auth?.store || "").trim()

  const menusFilteredForRoute = React.useMemo(() => {
    const q = menuRouteFilter.trim().toLowerCase()
    const list = [...menusList].sort((a, b) => {
      const c = (a.category || "").localeCompare(b.category || "")
      if (c !== 0) return c
      return (a.name || "").localeCompare(b.name || "")
    })
    if (!q) return list
    return list.filter(
      (m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.code || "").toLowerCase().includes(q) ||
        String(m.id).includes(q)
    )
  }, [menusList, menuRouteFilter])

  const allMenuRouteIds = React.useMemo(
    () => menusList.map((m) => String(m.id || "").trim()).filter(Boolean),
    [menusList]
  )

  const ensureRouteDefaults = React.useCallback(
    (keys: string[], src: Record<string, KitchenRouteValue>) => {
      const next: Record<string, KitchenRouteValue> = {}
      for (const key of keys) {
        const v = src[key]
        next[key] = v === 0 || v === 1 || v === 2 || v === 3 ? v : 1
      }
      return next
    },
    []
  )

  /** 키 목록이 아직 없으면(초기 로딩·API 실패) `ensureRouteDefaults([], …) === {}` 가 되어 DB json 을 싹 지우는 일이 생기지 않게 함 */
  const routeMapForSave = React.useCallback(
    (keys: string[], src: Record<string, KitchenRouteValue>) => {
      if (keys.length > 0) return ensureRouteDefaults(keys, src)
      return src
    },
    [ensureRouteDefaults]
  )

  const readAsDataUrl = React.useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = () => reject(new Error("file_read_failed"))
      reader.readAsDataURL(file)
    })
  }, [tr])

  const handleAssetUpload = React.useCallback(
    async (
      e: React.ChangeEvent<HTMLInputElement>,
      setValue: React.Dispatch<React.SetStateAction<string>>,
      label: string
    ) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      if (!String(file.type || "").startsWith("image/")) {
        await appAlert((t("posReceiptImageOnly") || "{{label}}: 이미지 파일만 업로드할 수 있습니다.").replace("{{label}}", label))
        return
      }
      if (file.size > RECEIPT_ASSET_MAX_BYTES) {
        await appAlert(
          (t("posReceiptImageSizeLimit") ||
            "{{label}}: 이미지가 너무 큽니다. 700KB 이하 파일을 사용해 주세요.").replace(
            "{{label}}",
            label
          )
        )
        return
      }
      try {
        const dataUrl = await readAsDataUrl(file)
        setValue(dataUrl)
      } catch {
        await appAlert(t("posReceiptImageUploadFail") || "이미지 업로드에 실패했습니다.")
      }
    },
    [readAsDataUrl, t]
  )

  const applyFromPosSettings = React.useCallback((settings: PosPrinterSettings) => {
    const km = Math.min(3, Math.max(1, Number(settings.kitchenMode) || 1)) as 1 | 2 | 3
    setKitchenMode(km)
    setKitchen1Categories(
      Array.isArray(settings.kitchen1Categories) ? [...settings.kitchen1Categories] : []
    )
    setKitchen2Categories(
      Array.isArray(settings.kitchen2Categories) ? [...settings.kitchen2Categories] : []
    )
    setKitchen3Categories(
      Array.isArray(settings.kitchen3Categories) ? [...settings.kitchen3Categories] : []
    )
    const mt = Array.isArray(settings.mainDeviceTokens)
      ? settings.mainDeviceTokens.map((x) => String(x || "").trim()).filter(Boolean)
      : []
    const leg =
      settings.mainDeviceToken != null && String(settings.mainDeviceToken).trim()
        ? [String(settings.mainDeviceToken).trim()]
        : []
    setMainDeviceTokensPreview(mt.length > 0 ? mt : leg)
    setReceiptPreviewDelivery(Math.max(0, Number(settings.deliveryFee ?? 0)))
    setReceiptPreviewPackaging(Math.max(0, Number(settings.packagingFee ?? 0)))
    setKitchenRouteByMenu(normalizeKitchenRouteMapInput(settings.kitchenRouteByMenu as unknown))
    setKitchenRouteByCategory(
      alignKitchenCategoryRouteKeyMap(normalizeKitchenRouteMapInput(settings.kitchenRouteByCategory as unknown))
    )
    setKitchenRouteByCategoryMain(
      alignKitchenCategoryRouteKeyMap(normalizeKitchenRouteMapInput(settings.kitchenRouteByCategoryMain as unknown))
    )
    setDrawerOpenOption(
      (["password_and_reason", "reason_only", "force"].includes(settings.drawerOpenOption || "")
        ? settings.drawerOpenOption
        : "reason_only") as "password_and_reason" | "reason_only" | "force"
    )
    setLogoPrint(Boolean(settings.logoPrint))
    setReceiptPrintTiming(settings.receiptPrintTiming === "final_payment" ? "final_payment" : "per_payment")
    setSignatureLine(Boolean(settings.signatureLine))
    setReceiptBarcode(Boolean(settings.receiptBarcode))
    setItemBarcode(Boolean(settings.itemBarcode))
    setQrCodeOption(
      (["yes", "no"].includes(settings.qrCodeOption || "")
        ? settings.qrCodeOption
        : "yes") as "yes" | "no"
    )
    setDiscountSeparatePrint(settings.discountSeparatePrint !== false)
    setToppingOptionsPrint(Boolean(settings.toppingOptionsPrint))
    setAutoPrintReceiptOnOrder(Boolean(settings.autoPrintReceiptOnOrder))
    setAutoPrintReceiptOnAddOrder(Boolean(settings.autoPrintReceiptOnAddOrder))
    setAutoPrintReceiptOnPayment(
      Boolean(settings.autoPrintReceiptOnPayment ?? settings.autoPrintReceiptOnOrder)
    )
    setAutoPrintKitchenSlipOnOrder(Boolean(settings.autoPrintKitchenSlipOnOrder))
    setAutoPrintFinalOrderBeforePayment(Boolean(settings.autoPrintFinalOrderBeforePayment))
    setEscPosCutAfterKitchenHtml(settings.escPosCutAfterKitchenHtml !== false)
    setEscPosCutAfterHallOrderHtml(Boolean(settings.escPosCutAfterHallOrderHtml))
    setEscPosCutAfterPaymentReceiptHtml(Boolean(settings.escPosCutAfterPaymentReceiptHtml))
    setReceiptBizName(String(settings.receiptBizName || ""))
    setReceiptBizTaxId(String(settings.receiptBizTaxId || ""))
    setReceiptBizAbn(String(settings.receiptBizAbn || ""))
    setReceiptBizOwner(String(settings.receiptBizOwner || ""))
    setReceiptBizAddress(String(settings.receiptBizAddress || ""))
    setReceiptBizPhone(String(settings.receiptBizPhone || ""))
    setReceiptDesignStyle(settings.receiptDesignStyle === "simple" ? "simple" : "badge")
    setReceiptLogoSize(
      settings.receiptLogoSize === "sm" ? "sm" : settings.receiptLogoSize === "lg" ? "lg" : "md"
    )
    setReceiptShowTitle(settings.receiptShowTitle !== false)
    setReceiptShowPaidStamp(settings.receiptShowPaidStamp !== false)
    setReceiptShowThankYou(settings.receiptShowThankYou !== false)
    setReceiptShowCustomerCopy(settings.receiptShowCustomerCopy !== false)
    setReceiptFooterPrimaryText(
      String(settings.receiptFooterPrimaryText ?? "").trim() ||
        (settings.receiptShowThankYou !== false ? tr("posReceiptThankYou", "감사합니다") : "")
    )
    setReceiptFooterSecondaryText(
      String(settings.receiptFooterSecondaryText ?? "").trim() ||
        (settings.receiptShowCustomerCopy !== false ? tr("posReceiptCustomerCopy", "고객용") : "")
    )
    setReceiptLogoImageUrl(String(settings.receiptLogoImageUrl ?? "").trim())
    setReceiptStampImageUrl(String(settings.receiptStampImageUrl ?? "").trim())
    setReceiptShowStamp(settings.receiptShowStamp !== false)
    setReceiptStampOnlyTaxInvoice(settings.receiptStampOnlyTaxInvoice !== false)
    setReceiptMembershipQrImageUrl(String(settings.receiptMembershipQrImageUrl ?? "").trim())
    setReceiptMembershipQrLinkUrl(String(settings.receiptMembershipQrLinkUrl ?? "").trim())
    setReceiptMembershipQrText(String(settings.receiptMembershipQrText ?? "").trim())
    setReceiptShowMembershipQr(Boolean(settings.receiptShowMembershipQr))
    setReceiptPrintLang(String(settings.receiptPrintLang ?? "").trim())
    setKitchenSlipFontScale(
      settings.kitchenSlipFontScale === "sm"
        ? "sm"
        : settings.kitchenSlipFontScale === "lg"
          ? "lg"
          : "md"
    )
    setKitchenSlipShowLineNotes(settings.kitchenSlipShowLineNotes !== false)
    setKitchenSlipShowOrderMemo(settings.kitchenSlipShowOrderMemo !== false)
  }, [])

  const loadData = React.useCallback(() => {
    if (!effectiveStore) return
    const requestSeq = ++loadRequestSeqRef.current
    setLoading(true)
    Promise.all([
      getPosPrinterSettings({ storeCode: effectiveStore }),
      getPosMenuCategories(),
      getPosMenus(),
    ])
      .then(([settings, catRes, menus]) => {
        if (requestSeq !== loadRequestSeqRef.current) return
        const cats = catRes.categories
        applyFromPosSettings(settings)
        setCategories(cats || [])
        setMainCategories(Array.isArray(catRes.mainCategories) ? catRes.mainCategories : [])
        setMenusList(Array.isArray(menus) ? menus : [])
      })
      .catch(() => {
        if (requestSeq !== loadRequestSeqRef.current) return
        setCategories([])
      })
      .finally(() => {
        if (requestSeq === loadRequestSeqRef.current) setLoading(false)
      })
  }, [effectiveStore, applyFromPosSettings])

  /** 저장 직후: 주방 설정 state 는 이번 merged 기준(위에서 반영)이므로 getPosPrinterSettings 를 다시 부르지 않는다(늦/빈 응답이 라우팅을 되돌리는 문제 방지). */
  const refreshMenuCatalogOnly = React.useCallback(() => {
    if (!effectiveStore) return
    const requestSeq = ++catalogRequestSeqRef.current
    Promise.all([getPosMenuCategories(), getPosMenus()])
      .then(([catRes, menus]) => {
        if (requestSeq !== catalogRequestSeqRef.current) return
        setCategories(catRes.categories || [])
        setMainCategories(Array.isArray(catRes.mainCategories) ? catRes.mainCategories : [])
        setMenusList(Array.isArray(menus) ? menus : [])
      })
      .catch(() => {
        if (requestSeq !== catalogRequestSeqRef.current) return
        setCategories([])
      })
  }, [effectiveStore])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(stores[0])
    } else if (!canSearchAll && auth?.store) {
      setStoreCode(auth.store)
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  React.useEffect(() => {
    setSaveStatus("idle")
    setLastSavedAt(null)
  }, [effectiveStore])

  const saveStatusUi = React.useMemo(() => {
    if (saveStatus === "saving") {
      return {
        text: tr("posPrinterSaveStatusSaving", "저장 중"),
        cn: "border-blue-200 bg-blue-50 text-blue-700",
      }
    }
    if (saveStatus === "saved") {
      return {
        text: tr("posPrinterSaveStatusSaved", "서버 반영 완료"),
        cn: "border-emerald-200 bg-emerald-50 text-emerald-700",
      }
    }
    if (saveStatus === "queued") {
      return {
        text: tr("posPrinterSaveStatusQueued", "오프라인 대기"),
        cn: "border-amber-200 bg-amber-50 text-amber-700",
      }
    }
    if (saveStatus === "error") {
      return {
        text: tr("posPrinterSaveStatusError", "저장 실패"),
        cn: "border-red-200 bg-red-50 text-red-700",
      }
    }
    return {
      text: tr("posPrinterSaveStatusIdle", "저장 전"),
      cn: "border-border bg-muted/40 text-muted-foreground",
    }
  }, [saveStatus, tr])

  const runPrintTestHtml = React.useCallback(
    (
      fullHtml: string,
      title: string,
      thermal?: Pick<
        PrintPosHtmlDocumentOptions,
        "printRole" | "printReceiptKind" | "kitchenStation" | "escPosCutOverride"
      >
    ) =>
      new Promise<void>((resolve, reject) => {
        printPosHtmlDocument(fullHtml, {
          title,
          printDelayMs: 0,
          fallbackCleanupMs: 120_000,
          focusIframeBeforePrint: false,
          preferSystemPrintDialog: true,
          ...thermal,
          onPrintUnavailable: () => reject(new Error("print_unavailable")),
          onAfterCleanup: () => resolve(),
        })
      }),
    []
  )

  const handleSave = async (): Promise<boolean> => {
    if (!effectiveStore) {
      await appAlert(t("store") || "매장을 선택하세요.")
      return false
    }
    setSaveStatus("saving")
    setSaving(true)
    try {
      const latest = await getPosPrinterSettings({ storeCode: effectiveStore })
      const merged: PosPrinterSettings = {
        ...latest,
        storeCode: effectiveStore,
        kitchenMode,
        kitchen1Categories,
        kitchen2Categories,
        kitchen3Categories,
        kitchenRouteByMenu: routeMapForSave(allMenuRouteIds, kitchenRouteByMenu),
        kitchenRouteByCategory: routeMapForSave(categories, kitchenRouteByCategory),
        kitchenRouteByCategoryMain: routeMapForSave(mainCategories, kitchenRouteByCategoryMain),
        // 레거시 필드: 서버/클라이언트 정책상 비활성(현금 결제 + 수동 강제 열기만 사용)
        cardAutoOpen: false,
        checkAutoOpen: false,
        drawerOpenOption,
        logoPrint,
        receiptPrintTiming,
        signatureLine,
        receiptBarcode,
        itemBarcode,
        qrCodeOption,
        discountSeparatePrint,
        toppingOptionsPrint,
        autoPrintReceiptOnOrder,
        autoPrintReceiptOnAddOrder,
        autoPrintReceiptOnPayment,
        autoPrintKitchenSlipOnOrder,
        autoPrintFinalOrderBeforePayment,
        escPosCutAfterKitchenHtml,
        escPosCutAfterHallOrderHtml,
        escPosCutAfterPaymentReceiptHtml,
        receiptBizName,
        receiptBizTaxId,
        receiptBizAbn,
        receiptBizOwner,
        receiptBizAddress,
        receiptBizPhone,
        receiptDesignStyle,
        receiptLogoSize,
        receiptShowTitle,
        receiptShowPaidStamp,
        receiptShowThankYou: Boolean(receiptFooterPrimaryText.trim()),
        receiptShowCustomerCopy: Boolean(receiptFooterSecondaryText.trim()),
        receiptFooterPrimaryText: receiptFooterPrimaryText.trim(),
        receiptFooterSecondaryText: receiptFooterSecondaryText.trim(),
        receiptLogoImageUrl: receiptLogoImageUrl.trim(),
        receiptStampImageUrl: receiptStampImageUrl.trim(),
        receiptShowStamp,
        receiptStampOnlyTaxInvoice,
        receiptMembershipQrImageUrl: receiptMembershipQrImageUrl.trim(),
        receiptMembershipQrLinkUrl: receiptMembershipQrLinkUrl.trim(),
        receiptMembershipQrText: receiptMembershipQrText.trim(),
        receiptShowMembershipQr,
        receiptPrintLang: receiptPrintLang || undefined,
        kitchenSlipFontScale,
        kitchenSlipShowLineNotes,
        kitchenSlipShowOrderMemo,
      }
      const res = await savePosPrinterSettings(posPrinterSettingsToSaveParams(merged))
      if (res.success) {
        setLastSavedAt(new Date())
        if (res.queued) {
          setSaveStatus("queued")
          await appAlert(
            t("posPrinterSavedQueued") ||
              "저장 요청이 대기 중입니다. 네트워크가 복구되면 서버에 반영됩니다. 지금 새로고침하면 예전 설정이 보일 수 있습니다."
          )
        } else {
          setSaveStatus("saved")
          // 저장 직후 서버/캐시 응답이 한 박자 늦으면 loadData()만으로 주방 라우팅이 이전 값으로 돌아갈 수 있어,
          // 먼저 이번에 보낸 merged 로 주방 관련 state 를 맞춘 뒤 백그라운드로 재조회한다.
          const km = Math.min(3, Math.max(1, Number(merged.kitchenMode) || 1)) as 1 | 2 | 3
          setKitchenMode(km)
          setKitchen1Categories(
            Array.isArray(merged.kitchen1Categories) ? [...merged.kitchen1Categories] : []
          )
          setKitchen2Categories(
            Array.isArray(merged.kitchen2Categories) ? [...merged.kitchen2Categories] : []
          )
          setKitchen3Categories(
            Array.isArray(merged.kitchen3Categories) ? [...merged.kitchen3Categories] : []
          )
          setKitchenRouteByMenu(
            normalizeKitchenRouteMapInput(merged.kitchenRouteByMenu as unknown) as Record<
              string,
              KitchenRouteValue
            >
          )
          setKitchenRouteByCategory(
            normalizeKitchenRouteMapInput(merged.kitchenRouteByCategory as unknown) as Record<
              string,
              KitchenRouteValue
            >
          )
          setKitchenRouteByCategoryMain(
            normalizeKitchenRouteMapInput(merged.kitchenRouteByCategoryMain as unknown) as Record<
              string,
              KitchenRouteValue
            >
          )
          await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
          refreshMenuCatalogOnly()
        }
        return true
      }
      setSaveStatus("error")
      await appAlert(res.message || t("msg_save_fail_detail"))
      return false
    } catch (e) {
      setSaveStatus("error")
      await appAlert(String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleQuickPrintCheck = async () => {
    if (quickTesting) return
    setQuickTesting(true)
    try {
      const hwSettings =
        effectiveStore.length > 0
          ? await getPosPrinterSettings({ storeCode: effectiveStore }).catch(() => null)
          : null

      const slips = kitchenSlipsForPreview
      if (slips.length === 0) {
        await appAlert(t("posKitchenNoItemsToPrint"))
      } else {
        for (let i = 0; i < slips.length; i++) {
          const slip = slips[i]
          const html = buildKitchenSlipHtmlForSlip(slip)
          await runPrintTestHtml(html, slip.label, {
            printRole: "kitchen",
            kitchenStation: slip.station,
            escPosCutOverride: resolveEscPosCutOverride(hwSettings, { printRole: "kitchen" }),
          })
          if (i + 1 < slips.length) {
            await new Promise<void>((r) => setTimeout(() => r(), POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
          }
        }
      }

      const receiptHtml = buildReceiptHtml()
      await runPrintTestHtml(receiptHtml, tr("posHallOrder", "홀 주문서"), {
        printRole: "receipt",
        printReceiptKind: "hall_order",
        escPosCutOverride: resolveEscPosCutOverride(hwSettings, {
          printRole: "receipt",
          printReceiptKind: "hall_order",
        }),
      })
      await runPrintTestHtml(receiptHtml, tr("posReceipt", "영수증"), {
        printRole: "receipt",
        printReceiptKind: "payment",
        escPosCutOverride: resolveEscPosCutOverride(hwSettings, {
          printRole: "receipt",
          printReceiptKind: "payment",
        }),
      })
      await appAlert(
        tr(
          "posPrinterQuickTestDone",
          "원클릭 테스트를 완료했습니다. (주방 → 홀 주문서 → 결제 영수증)"
        )
      )
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    } finally {
      setQuickTesting(false)
    }
  }

  const handleOpenCopyDialog = () => {
    const others = stores.filter((s) => s !== effectiveStore)
    setCopySourceStore(others[0] || "")
    setCopyTabPrinter(true)
    setCopyTabReceipt(true)
    setCopyTabReceiptDesign(true)
    setCopyTabBusiness(true)
    setCopyTabDrawer(true)
    setCopyTabDualMonitor(true)
    setCopySaveImmediately(false)
    setCopyDialogOpen(true)
  }

  const handleCopySettingsApply = async () => {
    if (!effectiveStore) {
      await appAlert(t("store") || "매장을 선택하세요.")
      return
    }
    const src = String(copySourceStore || "").trim()
    if (!src) {
      await appAlert(t("posPrinterCopyPickSource") || "복사할 매장을 선택하세요.")
      return
    }
    if (src === effectiveStore) {
      await appAlert(t("posPrinterCopySameStore") || "같은 매장은 선택할 수 없습니다.")
      return
    }
    if (!copyTabPrinter && !copyTabReceipt && !copyTabReceiptDesign && !copyTabBusiness && !copyTabDrawer && !copyTabDualMonitor) {
      await appAlert(tr("posPrinterCopyPickAtLeastOneTab", "복사할 탭을 하나 이상 선택하세요."))
      return
    }
    setCopyWorking(true)
    try {
      const [source, targetCurrent] = await Promise.all([
        getPosPrinterSettings({ storeCode: src }),
        getPosPrinterSettings({ storeCode: effectiveStore }),
      ])
      const merged: PosPrinterSettings = {
        ...targetCurrent,
        storeCode: effectiveStore,
      }
      const copyKeys = (keys: (keyof PosPrinterSettings)[]) => {
        const m = merged as unknown as Record<string, unknown>
        const s = source as unknown as Record<string, unknown>
        for (const key of keys) {
          m[String(key)] = s[String(key)]
        }
      }
      if (copyTabPrinter) {
        copyKeys([
          "kitchenMode",
          "kitchen1Categories",
          "kitchen2Categories",
          "kitchen3Categories",
          "kitchenRouteByMenu",
          "kitchenRouteByCategory",
          "kitchenRouteByCategoryMain",
        ])
      }
      if (copyTabReceipt) {
        copyKeys([
          "autoPrintKitchenSlipOnOrder",
          "autoPrintFinalOrderBeforePayment",
          "escPosCutAfterKitchenHtml",
          "escPosCutAfterHallOrderHtml",
          "escPosCutAfterPaymentReceiptHtml",
          "autoPrintReceiptOnOrder",
          "autoPrintReceiptOnAddOrder",
          "autoPrintReceiptOnPayment",
          "receiptPrintLang",
          "logoPrint",
          "receiptPrintTiming",
          "signatureLine",
          "receiptBarcode",
          "itemBarcode",
          "qrCodeOption",
          "discountSeparatePrint",
          "toppingOptionsPrint",
        ])
      }
      if (copyTabReceiptDesign) {
        copyKeys([
          "receiptDesignStyle",
          "receiptLogoSize",
          "receiptShowTitle",
          "receiptShowPaidStamp",
          "receiptShowThankYou",
          "receiptShowCustomerCopy",
          "receiptFooterPrimaryText",
          "receiptFooterSecondaryText",
          "receiptLogoImageUrl",
          "receiptStampImageUrl",
          "receiptShowStamp",
          "receiptStampOnlyTaxInvoice",
          "receiptMembershipQrImageUrl",
          "receiptMembershipQrLinkUrl",
          "receiptMembershipQrText",
          "receiptShowMembershipQr",
          "kitchenSlipFontScale",
          "kitchenSlipShowLineNotes",
          "kitchenSlipShowOrderMemo",
        ])
      }
      if (copyTabBusiness) {
        copyKeys([
          "receiptBizName",
          "receiptBizTaxId",
          "receiptBizAbn",
          "receiptBizOwner",
          "receiptBizAddress",
          "receiptBizPhone",
          "deliveryFee",
          "packagingFee",
        ])
      }
      if (copyTabDrawer) {
        copyKeys(["drawerOpenOption"])
      }
      if (copyTabDualMonitor) {
        copyKeys([
          "dualMonitorEnabled",
          "customerDisplayAutoOpen",
          "customerDisplayMonitorPreference",
          "customerDisplayTheme",
          "customerDisplayDefaultState",
          "customerDisplayIdleMessage",
          "customerDisplayIdleMediaType",
          "customerDisplayIdleMediaUrl",
          "customerDisplayPaymentMessage",
          "customerDisplayQrPayload",
          "customerDisplayShowOrderSummary",
          "customerDisplayShowOrderTotal",
        ])
      }
      applyFromPosSettings(merged)
      if (copySaveImmediately) {
        const res = await savePosPrinterSettings(posPrinterSettingsToSaveParams(merged))
        if (res.success) {
          setLastSavedAt(new Date())
          setSaveStatus(res.queued ? "queued" : "saved")
          setCopyDialogOpen(false)
          if (res.queued) {
            await appAlert(
              t("posPrinterSavedQueued") ||
                "저장 요청이 대기 중입니다. 네트워크가 복구되면 서버에 반영됩니다. 지금 새로고침하면 예전 설정이 보일 수 있습니다."
            )
          } else {
            await appAlert(t("posPrinterCopySuccess") || "다른 매장 설정을 복사해 저장했습니다.")
            refreshMenuCatalogOnly()
          }
        } else {
          setSaveStatus("error")
          await appAlert(res.message || t("msg_save_fail_detail"))
        }
      } else {
        setCopyDialogOpen(false)
        await appAlert(
          t("posPrinterCopyApplied") ||
            "원본 매장 설정을 화면에 반영했습니다. 하단 저장으로 DB에 반영하세요."
        )
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setCopyWorking(false)
    }
  }

  const previewData = React.useMemo(() => {
    const items = [
      { name: tr("posPrinterPreviewSampleMenu1", "예시: 후라이드 치킨"), qty: 1, price: 199 },
      { name: tr("posPrinterPreviewSampleMenu2", "예시: 콜라 1.25L"), qty: 1, price: 45 },
    ]
    const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0)
    const delivery = receiptPreviewDelivery
    const packaging = receiptPreviewPackaging
    const discount = 10
    const total = Math.max(0, subtotal - discount + delivery + packaging)
    return {
      orderNo: buildStoredPosOrderNo(
        normalizeStoreSlugForOrderNo(effectiveStore || "ST01"),
        bangkokTodayYmdCompact(),
        12
      ),
      storeCode: effectiveStore || "ST01",
      orderType: t("posOrderTypeTakeout") || "포장",
      tableName: "A-1",
      now: formatBangkokDateTime(new Date()),
      items,
      subtotal,
      discount,
      delivery,
      packaging,
      total,
      memo: tr("posPrinterPreviewSampleMemo", "덜 맵게 부탁드려요. (예시)"),
    }
  }, [
    receiptPreviewDelivery,
    receiptPreviewPackaging,
    effectiveStore,
    t,
    tr,
    formatBangkokDateTime,
  ])

  const kitchenSlipsForPreview = React.useMemo(() => {
    const cats = categories.length > 0 ? categories : ["A", "B"]
    const m1 = cats[0] || "A"
    const m2 = cats[1] || m1
    const items = previewData.items.map((it, i) => ({
      id: `pv${i}`,
      name: it.name,
      qty: it.qty,
      note: i === 0 ? tr("posPrinterPreviewKitchenLineNote", "품목 메모 (예시)") : undefined,
    }))
    const previewMenus: PosMenu[] = items.map((_, i) => ({
      id: `pv${i}`,
      code: "",
      name: previewData.items[i]?.name ?? "",
      category: i % 2 === 0 ? m1 : m2,
      categoryMain: "",
      price: 0,
      imageUrl: "",
      vatIncluded: true,
      isActive: true,
      sortOrder: i,
    }))
    const settingsPreview = {
      kitchenMode,
      kitchen2Categories,
      kitchen3Categories,
      kitchenRouteByMenu,
      kitchenRouteByCategory,
      kitchenRouteByCategoryMain,
    }
    return buildKitchenSlipGroups(
      items,
      buildKitchenSlipGroupOpts(settingsPreview, previewMenus, {
        unified: t("posKitchenOrder") || "주방 주문서",
        kitchen1: `${t("posKitchen1") || "주방 1"}`,
        kitchen2: `${t("posKitchen2") || "주방 2"}`,
        kitchen3: `${t("posKitchen3") || "주방 3"}`,
      })
    )
  }, [
    previewData.items,
    kitchenMode,
    kitchen2Categories,
    kitchen3Categories,
    kitchenRouteByMenu,
    kitchenRouteByCategory,
    kitchenRouteByCategoryMain,
    categories,
    t,
    tr,
  ])

  const buildReceiptHtml = React.useCallback(() => {
    const logoUrl = receiptLogoImageUrl || `${window.location.origin}/company-stamp.png`
    const previewIsTaxInvoice = false
    const footerPrimary =
      receiptFooterPrimaryText.trim() ||
      (receiptShowThankYou ? tr("posReceiptThankYou", "감사합니다") : "")
    const footerSecondary =
      receiptFooterSecondaryText.trim() ||
      (receiptShowCustomerCopy ? tr("posReceiptCustomerCopy", "고객용") : "")
    const qrCaption = receiptMembershipQrText.trim()
    const qrSrc = receiptMembershipQrLinkUrl.trim()
      ? `https://quickchart.io/qr?text=${encodeURIComponent(receiptMembershipQrLinkUrl.trim())}&size=180&margin=1&format=png`
      : receiptMembershipQrImageUrl
    const receiptBarcodeUrl = receiptBarcode ? buildCode128BarcodeUrl(previewData.orderNo) : ""
    const lines = previewData.items
      .map(
        (it, idx) => {
          const itemBarcodeUrl = itemBarcode ? buildCode128BarcodeUrl(`pv${idx}`) : ""
          return `<div class="receipt-row"><span>${it.qty}x ${escapeHtml(it.name)}</span><span>${(
            it.qty * it.price
          ).toLocaleString()}</span></div>${
            itemBarcodeUrl
              ? `<div class="text-center" style="margin: 3px 0 5px 0;"><img src="${escapeHtml(itemBarcodeUrl)}" alt="Item barcode" style="width:100%;max-width:100%;height:auto;object-fit:contain;" /></div>`
              : ""
          }`
        }
      )
      .join("")
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(t("posReceipt") || "영수증")}</title>
          <style>
            ${getPosPaperBaseCss("'Inter', 'Pretendard', 'Noto Sans KR', 'Sukhumvit Set', 'Noto Sans Thai', 'Malgun Gothic', Arial, sans-serif", 12)}
            body { font-weight: 600; line-height: 1.42; letter-spacing: 0; color: #000; padding-top: 0; padding-bottom: ${RECEIPT_TRAILING_BOTTOM_MM}mm; padding-left: ${RECEIPT_INNER_INSET_LEFT_MM}mm; padding-right: ${RECEIPT_INNER_INSET_RIGHT_MM}mm; }
            .receipt-content { width: 100%; max-width: 100%; margin-left: auto; margin-right: auto; box-sizing: border-box; padding: 0; position: relative; left: -${RECEIPT_CONTENT_NUDGE_LEFT_MM}mm; }
            .receipt-brand-badge { display: inline-block; border: 2px solid #111; border-radius: 999px; padding: 4px 12px; font-weight: 700; letter-spacing: 0.08em; }
            .receipt-brand-logo { display: inline-block; width: 120px; height: auto; object-fit: contain; }
            .receipt-brand-logo.sm { width: 84px; }
            .receipt-brand-logo.md { width: 108px; }
            .receipt-brand-logo.lg { width: 132px; }
            .brand { font-size: 14px; font-weight: 700; letter-spacing: 0.06em; }
            .receipt-section-title { text-align: center; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; margin-bottom: 2px; }
            .receipt-sub-title { text-align: center; font-size: 11px; color: #000; }
            .receipt-divider { border-top: 1px dashed #000; margin: 8px 0; }
            .receipt-divider-strong { border-top: 2px solid #111; margin: 8px 0; }
            .receipt-row { display: grid; grid-template-columns: minmax(0, 1fr) ${RECEIPT_AMOUNT_COL_MM}mm; column-gap: ${RECEIPT_GRID_COL_GAP_PX}px; align-items: start; margin: 4px 0; padding-right: 0; box-sizing: border-box; }
            .receipt-row > span:first-child { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-row > span:last-child { white-space: normal; text-align: right; overflow-wrap: anywhere; word-break: break-word; font-size: 10px; line-height: 1.2; }
            .receipt-row.receipt-total > span:last-child, .receipt-total .receipt-row > span:last-child { font-size: 11px; }
            .receipt-meta-row { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 3mm; align-items: start; margin: 3px 0; padding-right: 0.4mm; }
            .receipt-meta-label { min-width: 0; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-meta-value { min-width: 0; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
            .receipt-item-head { display: grid; grid-template-columns: minmax(0, 1fr) ${RECEIPT_AMOUNT_COL_MM}mm; column-gap: ${RECEIPT_GRID_COL_GAP_PX}px; font-size: 11px; font-weight: 700; padding: 0 0 4px 0; border-bottom: 1px solid #111; box-sizing: border-box; }
            .receipt-item-head > span:last-child { font-size: 10px; }
            .receipt-total { margin-top: 8px; padding-top: 4px; font-weight: bold; }
            .receipt-muted { color: #000; }
            .paid-stamp-wrap { text-align: center; margin: 10px 0; }
            .paid-stamp { display: inline-block; border: 1px solid #111; padding: 2px 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; }
            .footer-strong { color: #111; font-weight: 600; }
            .biz-line { margin: 2px 0; font-size: 11px; }
            .biz-strong { color: #111; font-weight: 600; }
            .text-center { text-align: center; }
            .text-xs { font-size: 11px; }
          </style>
        </head>
        <body>
          <div class="receipt-content">
          <div class="text-center">
            <img class="receipt-brand-logo ${receiptLogoSize}" src="${escapeHtml(logoUrl)}" alt="Company logo" />
            <div class="receipt-muted">${escapeHtml(previewData.storeCode)}</div>
          </div>
          <div class="receipt-divider"></div>
          ${
            receiptShowTitle
              ? `<div><div class="receipt-section-title">${escapeHtml(tr("posReceipt", "영수증"))}</div><div class="receipt-sub-title">${escapeHtml(tr("posReceiptSimpleTaxInvoice", "간이 세금계산서"))}</div></div>`
              : ""
          }
          <div class="text-xs">
            <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${escapeHtml(tr("posOrderNo", "주문번호"))}</span><span class="receipt-meta-value">${escapeHtml(formatPosOrderNoForPrint(previewData.orderNo))}</span></div>
            <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${escapeHtml(tr("posTable", "테이블"))}</span><span class="receipt-meta-value">${escapeHtml(previewData.tableName)}</span></div>
            <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${escapeHtml(tr("date", "일시"))}</span><span class="receipt-meta-value">${escapeHtml(previewData.now)}</span></div>
            <div class="receipt-meta-row"><span class="receipt-meta-label receipt-muted">${escapeHtml(tr("posOrderType", "주문 유형"))}</span><span class="receipt-meta-value">${escapeHtml(previewData.orderType)}</span></div>
          </div>
          <div class="receipt-divider"></div>
          ${(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? '<div class="text-xs receipt-muted">' : ""}
          ${receiptBizName ? `<div class="biz-line biz-strong">${escapeHtml(receiptBizName)}</div>` : ""}
          ${receiptBizTaxId ? `<div class="biz-line">${escapeHtml(tr("posTaxIdLabel", "사업자번호"))}: ${escapeHtml(receiptBizTaxId)}</div>` : ""}
          ${receiptBizAbn ? `<div class="biz-line">ABN: ${escapeHtml(receiptBizAbn)}</div>` : ""}
          ${receiptBizOwner ? `<div class="biz-line">${escapeHtml(tr("posOwner", "대표"))}: ${escapeHtml(receiptBizOwner)}</div>` : ""}
          ${receiptBizAddress ? `<div class="biz-line">${escapeHtml(receiptBizAddress)}</div>` : ""}
          ${receiptBizPhone ? `<div class="biz-line">${escapeHtml(tr("posTelLabel", "전화"))}: ${escapeHtml(receiptBizPhone)}</div>` : ""}
          ${(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? "</div>" : ""}
          <div class="receipt-divider-strong"></div>
          <div class="receipt-item-head"><span>${escapeHtml(tr("posMenuName", "품목"))}</span><span>${escapeHtml(tr("amount", "금액"))}</span></div>
          ${lines}
          <div class="receipt-divider"></div>
          <div class="receipt-row"><span>${escapeHtml(t("posSubtotal") || "소계")}</span><span>${previewData.subtotal.toLocaleString()}</span></div>
          <div class="receipt-row"><span>${escapeHtml(t("posDiscount") || "할인")}</span><span>-${previewData.discount.toLocaleString()}</span></div>
          <div class="receipt-row"><span>${escapeHtml(t("posDeliveryFee") || "배달 수수료")}</span><span>+${previewData.delivery.toLocaleString()}</span></div>
          <div class="receipt-row"><span>${escapeHtml(t("posPackagingFee") || "포장 수수료")}</span><span>+${previewData.packaging.toLocaleString()}</span></div>
          <div class="receipt-divider-strong"></div>
          <div class="receipt-total">
            <div class="receipt-row"><span>${escapeHtml(t("posTotal") || "합계")}</span><span>${previewData.total.toLocaleString()}</span></div>
          </div>
          <div class="receipt-divider"></div>
          ${receiptBarcodeUrl ? `<div class="text-center" style="margin: 8px 0;"><img src="${escapeHtml(receiptBarcodeUrl)}" alt="Receipt barcode" style="width:100%;max-width:100%;height:auto;object-fit:contain;" /></div>` : ""}
          ${signatureLine && previewIsTaxInvoice ? `<div style="margin-top: 8px; margin-bottom: 8px; font-size: 11px; color:#000;">${escapeHtml(tr("posSignature", "서명"))}: ____________________</div>` : ""}
          ${receiptShowPaidStamp ? `<div class="paid-stamp-wrap"><span class="paid-stamp">${escapeHtml(tr("posReceiptPaid", "결제완료"))}</span></div>` : ""}
          ${receiptShowMembershipQr && qrSrc ? `<div class="text-center" style="margin: 8px 0;"><img src="${escapeHtml(qrSrc)}" alt="Membership QR" style="width:84px;height:84px;object-fit:contain;" />${qrCaption ? `<div class="text-xs receipt-muted" style="margin-top:2px;">${escapeHtml(qrCaption)}</div>` : ""}</div>` : ""}
          ${receiptShowStamp && receiptStampImageUrl && !receiptStampOnlyTaxInvoice ? `<div class="text-center" style="margin: 8px 0;"><img src="${escapeHtml(receiptStampImageUrl)}" alt="Company stamp" style="width:72px;height:72px;object-fit:contain;" /></div>` : ""}
          ${(footerPrimary || footerSecondary) ? '<div class="text-center text-xs receipt-muted">' : ""}
          ${footerPrimary ? `<div class="footer-strong">${escapeHtml(footerPrimary)}</div>` : ""}
          ${footerSecondary ? `<div>${escapeHtml(footerSecondary)}</div>` : ""}
          ${(footerPrimary || footerSecondary) ? "</div>" : ""}
          </div>
        </body>
      </html>
    `
  }, [previewData, tr, receiptLogoSize, receiptShowTitle, receiptShowPaidStamp, receiptBizName, receiptBizTaxId, receiptBizAbn, receiptBizOwner, receiptBizAddress, receiptBizPhone, receiptLogoImageUrl, receiptFooterPrimaryText, receiptFooterSecondaryText, receiptMembershipQrText, receiptShowMembershipQr, receiptMembershipQrImageUrl, receiptMembershipQrLinkUrl, receiptShowStamp, receiptStampImageUrl, receiptStampOnlyTaxInvoice, receiptShowThankYou, receiptShowCustomerCopy, receiptBarcode, itemBarcode, signatureLine, t])

  const buildKitchenSlipHtmlForSlip = React.useCallback(
    (slip: { label: string; items: { name: string; qty: number; note?: string }[] }) => {
      const design = resolveKitchenSlipDesign({
        kitchenSlipFontScale,
        kitchenSlipShowLineNotes,
        kitchenSlipShowOrderMemo,
      })
      const memoLine = `${t("posCustomerMemo") || "메모"}: ${previewData.memo}`
      return buildKitchenSlipDocumentHtml({
        label: slip.label,
        orderNo: previewData.orderNo,
        storeCode: previewData.storeCode,
        orderTypeLabel: previewData.orderType,
        tablePart: ` · ${t("posTable") || "테이블"}: ${previewData.tableName}`,
        dateStr: previewData.now,
        items: slip.items,
        memoLine,
        escapeHtml,
        design,
        printColorAdjust: "economy",
      })
    },
    [
      previewData.orderNo,
      previewData.storeCode,
      previewData.orderType,
      previewData.tableName,
      previewData.now,
      previewData.memo,
      kitchenSlipFontScale,
      kitchenSlipShowLineNotes,
      kitchenSlipShowOrderMemo,
      t,
    ]
  )

  const handleOpenPreview = (kind: PreviewKind) => {
    setPreviewKind(kind)
    setPreviewOpen(true)
  }

  const handleTestPrint = async (kind: PreviewKind) => {
    try {
      const hwSettings =
        effectiveStore.length > 0
          ? await getPosPrinterSettings({ storeCode: effectiveStore }).catch(() => null)
          : null
      if (kind === "receipt") {
        const html = buildReceiptHtml()
        await runPrintTestHtml(html, tr("posReceipt", "영수증"), {
          printRole: "receipt",
          printReceiptKind: "payment",
          escPosCutOverride: resolveEscPosCutOverride(hwSettings, {
            printRole: "receipt",
            printReceiptKind: "payment",
          }),
        })
        return
      }
      const slips = kitchenSlipsForPreview
      if (!slips.length) {
        await appAlert(t("posKitchenNoItemsToPrint"))
        return
      }
      for (let i = 0; i < slips.length; i++) {
        const slip = slips[i]
        const html = buildKitchenSlipHtmlForSlip(slip)
        await runPrintTestHtml(html, slip.label, {
          printRole: "kitchen",
          kitchenStation: slip.station,
          escPosCutOverride: resolveEscPosCutOverride(hwSettings, { printRole: "kitchen" }),
        })
        if (i + 1 < slips.length) {
          await new Promise<void>((r) => setTimeout(() => r(), POS_THERMAL_BETWEEN_KITCHEN_SLIPS_MS))
        }
      }
    } catch (e) {
      await appAlert(i18nTr(t, "posUnexpectedErrorDetail", { detail: String(e) }))
    }
  }

  const receiptPreviewIsTaxInvoice = false

  if (!canAccessPosPrinters(auth?.role || "")) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{tr("noPermission", "접근 권한이 없습니다.")}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Printer className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {tr("posPrinterSettings", "프린터 설정")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {tr("posPrinterSettingsSub", "매장별 주방 프린터·카테고리 출력 설정")}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select value={storeCode} onValueChange={setStoreCode}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue placeholder={tr("store", "매장")} />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={loadData}
            disabled={loading}
          >
            <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {tr("posRefresh", "새로고침")}
          </Button>
          {canSearchAll && stores.length > 1 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              type="button"
              onClick={handleOpenCopyDialog}
              disabled={!effectiveStore || loading}
            >
              <Copy className="h-4 w-4" />
              {tr("posPrinterCopySettings", "설정 복사")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            type="button"
            onClick={() => void handleQuickPrintCheck()}
            disabled={!effectiveStore || loading || quickTesting}
          >
            <Printer className="h-4 w-4" />
            {quickTesting
              ? tr("posPrinterQuickTesting", "테스트 인쇄 중...")
              : tr("posPrinterQuickTest", "원클릭 테스트")}
          </Button>
        </div>

        <div className="mb-4 rounded-lg border bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                saveStatusUi.cn
              )}
            >
              {saveStatusUi.text}
            </span>
            <span className="text-muted-foreground">
              {lastSavedAt
                ? tr("posPrinterLastSavedAt", "마지막 저장: {{time}}").replace(
                    "{{time}}",
                    formatBangkokDateTime(lastSavedAt)
                  )
                : tr("posPrinterLastSavedAtEmpty", "저장 이력이 없습니다.")}
            </span>
          </div>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {effectiveStore && !loading && (
          <div className={adminTabsRootCn}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="printer" className={adminTabsTriggerCn}>
                    <Printer className={adminTabsIconCn} aria-hidden />
                    {tr("posPrinterTabKitchenRouting", "주방 라우팅")}
                  </TabsTrigger>
                  <TabsTrigger value="receipt" className={adminTabsTriggerCn}>
                    <Receipt className={adminTabsIconCn} aria-hidden />
                    {tr("posReceiptTabAutoPrint", "영수증/자동인쇄")}
                  </TabsTrigger>
                  <TabsTrigger value="receipt-design" className={adminTabsTriggerCn}>
                    <Receipt className={adminTabsIconCn} aria-hidden />
                    {tr("posReceiptDesignTab", "디자인")}
                  </TabsTrigger>
                  <TabsTrigger value="business" className={adminTabsTriggerCn}>
                    <Building2 className={adminTabsIconCn} aria-hidden />
                    {tr("posBizInfoTab", "사업자 정보")}
                  </TabsTrigger>
                  <TabsTrigger value="drawer" className={adminTabsTriggerCn}>
                    <Wallet className={adminTabsIconCn} aria-hidden />
                    {tr("posDrawerTab", "돈통")}
                  </TabsTrigger>
                  <TabsTrigger value="dual-monitor" className={adminTabsTriggerCn}>
                    <Monitor className={adminTabsIconCn} aria-hidden />
                    {tr("posDualMonitorTab", "듀얼 모니터")}
                  </TabsTrigger>
                </TabsList>
          </AdminTabsBarWithHelp>

            <TabsContent value="printer" className={cn(adminTabsContentCn, "space-y-6")}>
              <div>
                <label className="text-sm font-medium">{tr("posKitchenMode", "주방 주문서 분할")}</label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tr("posKitchenModeScopeNote", "카운터·영수증(메인 POS)은 위 안내와 같이 별도입니다. 여기서는 주방 주문서를 주방 1~3 슬립으로 최대 몇 갈래까지 나눌지만 정합니다.")}
                </p>
                <Select
                  value={String(kitchenMode)}
                  onValueChange={(v) => setKitchenMode(Number(v) as 1 | 2 | 3)}
                >
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{tr("posKitchenMode1", "1대")}</SelectItem>
                    <SelectItem value="2">{tr("posKitchenMode2", "2대")}</SelectItem>
                    <SelectItem value="3">{tr("posKitchenMode3", "3대")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tr("posKitchenModeRoutingHint", "아래 표에서 대분류·카테고리·메뉴별로 주방 1~3 또는 주방 미인쇄를 지정합니다. 2·3대 모드에서는 슬립이 주방별로 나뉩니다.")}
                </p>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {tr("posKitchenRouteSection", "주방 프린터 지정 (대분류·카테고리·메뉴)")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {tr("posKitchenRouteHint", "우선순위: 메뉴별 → 카테고리별 → 대분류별. 미지정은 주방 1로 처리됩니다.")}
                  </p>
                </div>
                {mainCategories.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {tr("posKitchenRouteByMain", "대분류(category_main)")}
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-md border px-2">
                      {mainCategories.map((main) => (
                        <KitchenRouteSelectRow
                          key={`km-${main}`}
                          label={main}
                          value={kitchenRouteByCategoryMain[main]}
                          maxK={kitchenMode}
                          t={t}
                          onChange={(v) =>
                            setKitchenRouteByCategoryMain((prev) => {
                              const next = { ...prev }
                              if (v == null) delete next[main]
                              else next[main] = v
                              return next
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {categories.length > 0 ? (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      {tr("posKitchenRouteByCategoryCol", "카테고리(소분류)")}
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-md border px-2">
                      {categories.map((cat) => (
                        <KitchenRouteSelectRow
                          key={`kc-${cat}`}
                          label={cat}
                          value={kitchenRouteByCategory[cat]}
                          maxK={kitchenMode}
                          t={t}
                          onChange={(v) =>
                            setKitchenRouteByCategory((prev) => {
                              const next = { ...prev }
                              if (v == null) delete next[cat]
                              else next[cat] = v
                              return next
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {tr("posKitchenRouteByMenuCol", "메뉴별")}
                  </p>
                  <Input
                    className="mb-2 h-9 text-sm"
                    placeholder={tr("posKitchenRouteMenuSearch", "메뉴 검색 (이름·코드·ID)")}
                    value={menuRouteFilter}
                    onChange={(e) => setMenuRouteFilter(e.target.value)}
                  />
                  <div className="max-h-72 overflow-y-auto rounded-md border px-2">
                    {menusFilteredForRoute.map((m) => (
                      <KitchenRouteSelectRow
                        key={m.id}
                        label={`${m.name} (${m.code || m.id})`}
                        value={kitchenRouteByMenu[String(m.id)]}
                        maxK={kitchenMode}
                        t={t}
                        onChange={(v) =>
                          setKitchenRouteByMenu((prev) => {
                            const next = { ...prev }
                            const id = String(m.id)
                            if (v == null) delete next[id]
                            else next[id] = v
                            return next
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200/70 bg-amber-50/40 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-xs text-muted-foreground">
                  {tr("posKitchenRoutingSaveHint", "아래 저장 버튼(또는 페이지 하단 저장 버튼)을 눌러 서버에 반영하세요.")}
                </p>
                <Button
                  type="button"
                  className="mt-3 w-full sm:w-auto"
                  onClick={() => void handleSave()}
                  disabled={saving || loading}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? t("posPrinterSaving") : t("itemsBtnSave")}
                </Button>
              </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={() => handleOpenPreview("receipt")}>
                <Receipt className="mr-2 h-4 w-4" />
                {tr("posReceipt", "영수증")} {tr("posPreview", "미리보기")}
              </Button>
              <Button variant="outline" onClick={() => handleOpenPreview("kitchen")}>
                <Printer className="mr-2 h-4 w-4" />
                {tr("posKitchenOrder", "주방 주문서")} {tr("posPreview", "미리보기")}
              </Button>
            </div>
            </TabsContent>

            <TabsContent value="receipt" className={cn(adminTabsContentCn, "space-y-4")}>
              <p className="text-sm text-muted-foreground">
                {tr("posReceiptOptionsHint", "영수증·고객 주문서 출력 시 포함할 항목을 설정합니다.")}
              </p>
              <div className="space-y-3">
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-sm font-medium">{tr("posReceiptAutoPrintSection", "자동 인쇄")}</p>
                  <p className="text-xs text-muted-foreground">
                    {tr("posReceiptAutoPrintSectionHint", "영수증/주방 주문서 자동 인쇄 시점을 선택합니다.")}
                  </p>
                  <ToggleRow label={tr("posKitchenAutoPrintOnOrder", "주문 완료 시 주방 주문서 자동 인쇄")} value={autoPrintKitchenSlipOnOrder} onChange={setAutoPrintKitchenSlipOnOrder} t={t} />
                  <ToggleRow label={tr("posAutoPrintReceiptOnOrder", "주문 시 영수증 자동 인쇄")} value={autoPrintReceiptOnOrder} onChange={setAutoPrintReceiptOnOrder} t={t} />
                  <ToggleRow label={tr("posAutoPrintReceiptOnAddOrder", "추가 주문 시 영수증 자동 인쇄")} value={autoPrintReceiptOnAddOrder} onChange={setAutoPrintReceiptOnAddOrder} t={t} />
                  <ToggleRow label={tr("posAutoPrintReceiptOnPayment", "결제 시 영수증 자동 인쇄")} value={autoPrintReceiptOnPayment} onChange={setAutoPrintReceiptOnPayment} t={t} />
                  <ToggleRow
                    label={tr("posAutoPrintFinalHallOrderBeforePayment", "결제 직전 최종 홀 주문서 자동 인쇄")}
                    value={autoPrintFinalOrderBeforePayment}
                    onChange={setAutoPrintFinalOrderBeforePayment}
                    t={t}
                  />
                </div>
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-sm font-medium">{tr("posEscPosCutSection", "용지 절단 (Windows 설치형 POS)")}</p>
                  <p className="text-xs text-muted-foreground">
                    {tr(
                      "posEscPosCutSectionHint",
                      "하이브리드(Choongman POS)에서 ESC/POS 절단을 켜면, 드라이버가 자동 절단하지 않는 프린터에서도 잘립니다. 웹 브라우저만 쓰는 매장은 적용되지 않습니다."
                    )}
                  </p>
                  <ToggleRow
                    label={tr("posEscPosCutKitchen", "주방 주문서 인쇄 후 절단")}
                    value={escPosCutAfterKitchenHtml}
                    onChange={setEscPosCutAfterKitchenHtml}
                    t={t}
                  />
                  <ToggleRow
                    label={tr("posEscPosCutHall", "홀 주문서·터미널 주문서 인쇄 후 절단")}
                    value={escPosCutAfterHallOrderHtml}
                    onChange={setEscPosCutAfterHallOrderHtml}
                    t={t}
                  />
                  <ToggleRow
                    label={tr("posEscPosCutPayment", "결제 영수증 인쇄 후 절단")}
                    value={escPosCutAfterPaymentReceiptHtml}
                    onChange={setEscPosCutAfterPaymentReceiptHtml}
                    t={t}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">{tr("posReceiptPrintLang", "주문·영수증·주방 인쇄 언어")}</label>
                  <p className="text-xs text-muted-foreground mt-0.5">{tr("posReceiptPrintLangHint", "설정 시 주문, 영수증, 주방 주문서에 적용됩니다. 미설정 시 화면 언어를 따릅니다.")}</p>
                  <Select value={receiptPrintLang || "__auto__"} onValueChange={(v) => setReceiptPrintLang(v === "__auto__" ? "" : v)}>
                    <SelectTrigger className="mt-1 w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">{tr("posReceiptPrintLangAuto", "화면 언어 따름")}</SelectItem>
                      <SelectItem value="ko">{tr("posLangKo", "한국어")}</SelectItem>
                      <SelectItem value="en">{tr("posLangEn", "English")}</SelectItem>
                      <SelectItem value="th">{tr("posLangTh", "ไทย")}</SelectItem>
                      <SelectItem value="mm">{tr("posLangMm", "မြန်မာ")}</SelectItem>
                      <SelectItem value="la">{tr("posLangLa", "ລາວ")}</SelectItem>
                      <SelectItem value="kh">{tr("posLangKh", "ខ្មែរ")}</SelectItem>
                      <SelectItem value="vi">{tr("posLangVi", "Tiếng Việt")}</SelectItem>
                      <SelectItem value="ms">{tr("posLangMs", "Bahasa")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ToggleRow label={tr("posLogoPrint", "로고 인쇄")} value={logoPrint} onChange={setLogoPrint} t={t} />
                <ToggleRow label={tr("posSignatureLine", "서명란 출력")} value={signatureLine} onChange={setSignatureLine} t={t} />
                <ToggleRow label={tr("posReceiptBarcode", "영수증 바코드")} value={receiptBarcode} onChange={setReceiptBarcode} t={t} />
                <ToggleRow label={tr("posItemBarcode", "아이템 바코드")} value={itemBarcode} onChange={setItemBarcode} t={t} />
                <ToggleRow
                  label={tr("posQrCodeOption", "QR코드 영수증")}
                  value={qrCodeOption === "yes"}
                  onChange={(v) => setQrCodeOption(v ? "yes" : "no")}
                  t={t}
                />
                <ToggleRow label={tr("posDiscountSeparatePrint", "할인내역 별도출력")} value={discountSeparatePrint} onChange={setDiscountSeparatePrint} t={t} />
                <ToggleRow label={tr("posToppingOptionsPrint", "토핑메뉴 추가옵션")} value={toppingOptionsPrint} onChange={setToppingOptionsPrint} t={t} />
                <p className="text-xs text-muted-foreground mt-2">
                  <span>{tr("posPrinterKioskPrintingHintBefore", "인쇄 확인 창 없이 바로 프린터로 출력하려면, 포스 PC에서 Chrome을")}</span>{" "}
                  <code className="rounded bg-muted px-1">--kiosk-printing</code>{" "}
                  <span>{tr("posPrinterKioskPrintingHintMid", "옵션으로 실행하세요. 매장 오픈 시 PC 안내는 문서")}</span>{" "}
                  <code className="rounded bg-muted px-1">vercel-app/docs/STORE-OPEN-SETUP.md</code>
                  <span>{tr("posPrinterKioskPrintingHintAfter", "를 참고하세요.")}</span>
                </p>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenPreview("receipt")}>
                    <Receipt className="h-4 w-4" />
                    {tr("posReceipt", "영수증")} {tr("posPreview", "미리보기")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenPreview("kitchen")}>
                    <Printer className="h-4 w-4" />
                    {tr("posKitchenOrder", "주방 주문서")} {tr("posPreview", "미리보기")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="receipt-design" className={cn(adminTabsContentCn, "space-y-4")}>
              <p className="text-sm text-muted-foreground">
                {tr("posReceiptDesignHint", "손님 영수증·주방 주문서 레이아웃을 설정합니다.")}
              </p>

              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-semibold">{tr("posKitchenSlipDesignSection", "주방 주문서")}</p>
                <div>
                  <label className="text-sm font-medium">{tr("posKitchenSlipFontScaleLabel", "주방 슬립 글자 크기")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(["sm", "md", "lg"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setKitchenSlipFontScale(v)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm",
                          kitchenSlipFontScale === v ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                        )}
                      >
                        {v === "sm" ? tr("posReceiptLogoSizeSm", "작게") : v === "md" ? tr("posReceiptLogoSizeMd", "중간") : tr("posReceiptLogoSizeLg", "크게")}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleRow
                  label={tr("posKitchenSlipShowLineNotesLabel", "품목 줄 메모 표시")}
                  value={kitchenSlipShowLineNotes}
                  onChange={setKitchenSlipShowLineNotes}
                  t={t}
                />
                <ToggleRow
                  label={tr("posKitchenSlipShowOrderMemoLabel", "주문 메모 박스 표시")}
                  value={kitchenSlipShowOrderMemo}
                  onChange={setKitchenSlipShowOrderMemo}
                  t={t}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenPreview("receipt")}>
                    <Receipt className="h-4 w-4" />
                    {tr("posReceipt", "영수증")} {tr("posPreview", "미리보기")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenPreview("kitchen")}>
                    <Printer className="h-4 w-4" />
                    {tr("posKitchenOrder", "주방 주문서")} {tr("posPreview", "미리보기")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleTestPrint("kitchen")}>
                    <Printer className="h-4 w-4" />
                    {tr("posKitchenOrder", "주방 주문서")} {tr("posPrintTest", "테스트 인쇄")}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-semibold">{tr("posReceiptDesignCustomerSection", "손님 영수증")}</p>
                <div>
                  <label className="text-sm font-medium">{tr("posReceiptDesignStyleLabel", "헤더 스타일")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptDesignStyle('badge')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptDesignStyle === 'badge' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {tr("posReceiptDesignStyleBadge", "배지형")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptDesignStyle('simple')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptDesignStyle === 'simple' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {tr("posReceiptDesignStyleSimple", "기본형")}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">{tr("posReceiptLogoSizeLabel", "로고 크기")}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptLogoSize('sm')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptLogoSize === 'sm' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {tr("posReceiptLogoSizeSm", "작게")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptLogoSize('md')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptLogoSize === 'md' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {tr("posReceiptLogoSizeMd", "중간")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptLogoSize('lg')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptLogoSize === 'lg' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {tr("posReceiptLogoSizeLg", "크게")}
                    </button>
                  </div>
                </div>
                <ToggleRow label={tr("posReceiptShowTitle", "영수증 제목 표시")} value={receiptShowTitle} onChange={setReceiptShowTitle} t={t} />
                <ToggleRow label={tr("posReceiptShowPaidStamp", "결제완료(PAID) 스탬프 표시")} value={receiptShowPaidStamp} onChange={setReceiptShowPaidStamp} t={t} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {tr("posReceiptFooterPrimaryText", "하단 문구 1")}
                    </label>
                    <Textarea
                      value={receiptFooterPrimaryText}
                      onChange={(e) => setReceiptFooterPrimaryText(e.target.value)}
                      className="mt-1 min-h-[72px] text-sm"
                      placeholder={tr("posReceiptFooterPrimaryPh", "예: Thank you / 감사합니다")}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      {tr("posReceiptFooterSecondaryText", "하단 문구 2")}
                    </label>
                    <Textarea
                      value={receiptFooterSecondaryText}
                      onChange={(e) => setReceiptFooterSecondaryText(e.target.value)}
                      className="mt-1 min-h-[72px] text-sm"
                      placeholder={tr("posReceiptFooterSecondaryPh", "예: Customer Copy / 멤버십 가입 안내")}
                    />
                  </div>
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium">{tr("posReceiptLogoUploadTitle", "로고 이미지")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="max-w-xs text-xs"
                      onChange={(e) => void handleAssetUpload(e, setReceiptLogoImageUrl, tr("posReceiptLogoUploadTitle", "로고 이미지"))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setReceiptLogoImageUrl("")}>
                      {tr("reset", "초기화")}
                    </Button>
                  </div>
                  {receiptLogoImageUrl ? (
                    <img src={receiptLogoImageUrl} alt="Receipt logo" className="h-14 w-auto object-contain rounded border bg-white p-1" />
                  ) : null}
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium">{tr("posReceiptStampUploadTitle", "회사 도장 이미지")}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="max-w-xs text-xs"
                      onChange={(e) => void handleAssetUpload(e, setReceiptStampImageUrl, tr("posReceiptStampUploadTitle", "회사 도장 이미지"))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setReceiptStampImageUrl("")}>
                      {tr("reset", "초기화")}
                    </Button>
                  </div>
                  <ToggleRow
                    label={tr("posReceiptShowStamp", "도장 표시")}
                    value={receiptShowStamp}
                    onChange={setReceiptShowStamp}
                    t={t}
                  />
                  <ToggleRow
                    label={tr("posReceiptStampOnlyTaxInvoice", "인보이스(세금계산서) 발행 시만 도장 표시")}
                    value={receiptStampOnlyTaxInvoice}
                    onChange={setReceiptStampOnlyTaxInvoice}
                    t={t}
                  />
                  {receiptStampImageUrl ? (
                    <img src={receiptStampImageUrl} alt="Receipt stamp" className="h-14 w-14 object-contain rounded border bg-white p-1" />
                  ) : null}
                </div>
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium">{tr("posReceiptMembershipQrTitle", "멤버십 QR")}</p>
                  <Input
                    value={receiptMembershipQrLinkUrl}
                    onChange={(e) => setReceiptMembershipQrLinkUrl(e.target.value)}
                    className="h-9"
                    placeholder={tr("posReceiptMembershipQrUrlPh", "https://... (URL만 입력하면 QR 자동 생성)")}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      className="max-w-xs text-xs"
                      onChange={(e) => void handleAssetUpload(e, setReceiptMembershipQrImageUrl, tr("posReceiptMembershipQrTitle", "멤버십 QR"))}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => { setReceiptMembershipQrImageUrl(""); setReceiptMembershipQrLinkUrl("") }}>
                      {tr("reset", "초기화")}
                    </Button>
                  </div>
                  {receiptMembershipQrLinkUrl.trim() ? (
                    <p className="text-[11px] text-muted-foreground">
                      {tr("posReceiptMembershipQrUrlHint", "URL이 있으면 업로드 이미지 대신 자동 생성 QR이 우선 사용됩니다.")}
                    </p>
                  ) : null}
                  <ToggleRow
                    label={tr("posReceiptShowMembershipQr", "멤버십 QR 표시")}
                    value={receiptShowMembershipQr}
                    onChange={setReceiptShowMembershipQr}
                    t={t}
                  />
                  <Input
                    value={receiptMembershipQrText}
                    onChange={(e) => setReceiptMembershipQrText(e.target.value)}
                    className="h-9"
                    placeholder={tr("posReceiptMembershipQrTextPh", "예: 가입하고 포인트 적립 받기")}
                  />
                  {(receiptMembershipQrLinkUrl.trim() || receiptMembershipQrImageUrl) ? (
                    <img
                      src={
                        receiptMembershipQrLinkUrl.trim()
                          ? `https://quickchart.io/qr?text=${encodeURIComponent(receiptMembershipQrLinkUrl.trim())}&size=180&margin=1&format=png`
                          : receiptMembershipQrImageUrl
                      }
                      alt="Membership QR"
                      className="h-20 w-20 object-contain rounded border bg-white p-1"
                    />
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleOpenPreview("receipt")}>
                    <Receipt className="h-4 w-4" />
                    {tr("posReceipt", "영수증")} {tr("posPreview", "미리보기")}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void handleTestPrint("receipt")}>
                    <Printer className="h-4 w-4" />
                    {tr("posReceipt", "영수증")} {tr("posPrintTest", "테스트 인쇄")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="business" className={cn(adminTabsContentCn, "space-y-4")}>
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">{tr("posBizInfoTab", "사업자 정보")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">{tr("posBizNameLabel", "상호명")}</label>
                    <Input value={receiptBizName} onChange={(e) => setReceiptBizName(e.target.value)} className="mt-1 h-9" placeholder={tr("posBizNamePh", "예: 청만 아속점")} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{tr("posBizTaxIdLabel", "사업자등록번호")}</label>
                    <Input value={receiptBizTaxId} onChange={(e) => setReceiptBizTaxId(e.target.value)} className="mt-1 h-9" placeholder={tr("posBizTaxIdPh", "예: 0105566137147")} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{tr("posBizAbnLabel", "ABN")}</label>
                    <Input value={receiptBizAbn} onChange={(e) => setReceiptBizAbn(e.target.value)} className="mt-1 h-9" placeholder={tr("posBizAbnPh", "예: 12 345 678 901")} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{tr("posBizOwnerLabel", "대표자명")}</label>
                    <Input value={receiptBizOwner} onChange={(e) => setReceiptBizOwner(e.target.value)} className="mt-1 h-9" placeholder={tr("posBizOwnerPh", "예: 홍길동")} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{tr("posBizPhoneLabel", "연락처")}</label>
                    <Input value={receiptBizPhone} onChange={(e) => setReceiptBizPhone(e.target.value)} className="mt-1 h-9" placeholder={tr("posBizPhonePh", "예: 02-123-4567")} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{tr("posBizAddressLabel", "사업장 주소")}</label>
                  <Input value={receiptBizAddress} onChange={(e) => setReceiptBizAddress(e.target.value)} className="mt-1 h-9" placeholder={tr("posBizAddressPh", "예: Bangkok ... ")} />
                </div>
                <p className="text-[11px] text-muted-foreground">{tr("posBizInfoHint", "초기값은 기존 매장 정보(vendors)에서 자동 반영되며, 저장 후 언제든 수정할 수 있습니다.")}</p>
              </div>
            </TabsContent>

            <TabsContent value="drawer" className={cn(adminTabsContentCn, "space-y-4")}>
              <p className="text-sm text-muted-foreground">
                {tr("posDrawerHintV2", "돈통은 '현금 결제가 포함된 경우'에만 자동으로 열리며, 그 외에는 열지 않습니다. (수동 열기/강제 열기는 별도 동작)")}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr("posDrawerBridgeHint", "")}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium">{tr("posDrawerOpenOption", "돈통열기 옵션")}</label>
                  <p className="text-xs text-muted-foreground mb-1">
                    {tr("posDrawerOpenOptionHint", "수동으로 돈통을 열 때 필요한 조건")}
                  </p>
                  <div className="flex flex-col gap-2 mt-1">
                    {(['password_and_reason', 'reason_only', 'force'] as const).map((v) => (
                      <label
                        key={v}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 cursor-pointer",
                          drawerOpenOption === v ? "border-primary bg-primary/5" : "border-muted"
                        )}
                      >
                        <input
                          type="radio"
                          name="drawerOpenOption"
                          checked={drawerOpenOption === v}
                          onChange={() => setDrawerOpenOption(v)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">
                          {v === 'password_and_reason' ? tr("posDrawerPasswordAndReason", "암호입력 및 사유입력") :
                           v === 'reason_only' ? tr("posDrawerReasonOnly", "사유입력") :
                           tr("posDrawerForceOpen", "강제열기")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="dual-monitor" className={cn(adminTabsContentCn, "space-y-4")}>
              <p className="text-sm text-muted-foreground">
                {tr("posDualMonitorDeviceTabDesc", "Windows POS 듀얼 모니터 감지/자동 배치 및 고객창 제어를 설정합니다.")}
              </p>
              <PosDualMonitorSettingsContent storeCode={effectiveStore} />
            </TabsContent>
          </Tabs>
            <div className="border-t border-border px-4 py-4 sm:px-6">
              <Button
                type="button"
                className="w-full"
                onClick={() => void handleSave()}
                disabled={saving || loading}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? t("posPrinterSaving") : t("itemsBtnSave")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("posPrinterCopySettings", "설정 복사")}</DialogTitle>
            <DialogDescription className="text-left">
              {tr("posPrinterCopySettingsDesc", "다른 매장의 POS 프린터·영수증·돈통 등 저장값을 현재 매장으로 가져옵니다. 메인 POS 기기 등록은 매장별로 따로 관리됩니다.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">{tr("posPrinterCopyFromStore", "복사할 매장")}</label>
              <Select value={copySourceStore} onValueChange={setCopySourceStore}>
                <SelectTrigger className="mt-1 h-10 w-full">
                  <SelectValue placeholder={tr("store", "매장")} />
                </SelectTrigger>
                <SelectContent>
                  {stores
                    .filter((s) => s !== effectiveStore)
                    .map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {tr("posPrinterCopyToCurrent", "적용 대상: {{store}}").replace("{{store}}", effectiveStore || "—")}
            </p>
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{tr("posPrinterCopyTabsTitle", "복사할 탭 선택")}</p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={copyTabPrinter} onChange={(e) => setCopyTabPrinter(e.target.checked)} />
                <span>{tr("posPrinterTab", "프린터")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={copyTabReceipt} onChange={(e) => setCopyTabReceipt(e.target.checked)} />
                <span>{tr("posReceiptTab", "영수증")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={copyTabReceiptDesign} onChange={(e) => setCopyTabReceiptDesign(e.target.checked)} />
                <span>{tr("posReceiptDesignTab", "디자인")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={copyTabBusiness} onChange={(e) => setCopyTabBusiness(e.target.checked)} />
                <span>{tr("posBizInfoTab", "사업자 정보")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={copyTabDrawer} onChange={(e) => setCopyTabDrawer(e.target.checked)} />
                <span>{tr("posDrawerTab", "돈통")}</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 rounded border-input" checked={copyTabDualMonitor} onChange={(e) => setCopyTabDualMonitor(e.target.checked)} />
                <span>{tr("posDualMonitorTab", "듀얼 모니터")}</span>
              </label>
              <p className="text-[11px] text-muted-foreground">
                {tr("posPrinterCopyTabsHint", "선택한 탭만 현재 매장 설정에 덮어씁니다. 선택하지 않은 탭은 유지됩니다.")}
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-input"
                checked={copySaveImmediately}
                onChange={(e) => setCopySaveImmediately(e.target.checked)}
              />
              <span>
                <span className="font-medium">
                  {tr("posPrinterCopySaveNow", "가져온 뒤 바로 저장")}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {tr("posPrinterCopySaveNowHint", "끄면 화면에만 반영됩니다. 확인 후 하단 저장으로 DB에 반영하세요.")}
                </span>
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCopyDialogOpen(false)} disabled={copyWorking}>
              {tr("cancel", "취소")}
            </Button>
            <Button type="button" onClick={() => void handleCopySettingsApply()} disabled={copyWorking}>
              {copyWorking ? t("posPrinterCopyWorking") : t("posPrinterCopyApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{tr("posPrintPreviewBothTitle", "영수증 · 주방 미리보기")}</DialogTitle>
            <DialogDescription className="text-left text-sm">
              {tr("posPrintPreviewSaveHint", "미리보기·테스트 인쇄는 DB에 저장하지 않습니다. 변경한 설정은 이 창을 닫은 뒤 아래 「설정 저장」 또는 페이지 맨 아래 「저장」으로 반영하세요.")}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={previewKind}
            onValueChange={(v) => setPreviewKind(v as PreviewKind)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="receipt" className="gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                {tr("posReceipt", "영수증")}
              </TabsTrigger>
              <TabsTrigger value="kitchen" className="gap-1.5">
                <Printer className="h-3.5 w-3.5" />
                {tr("posKitchenOrder", "주방 주문서")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="receipt" className="mt-3 outline-none">
          <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/20 p-4">
            <div
              className={cn(
                "mx-auto w-full rounded-md border bg-white p-3 text-black",
                "max-w-[320px]"
              )}
            >
                <div className="font-mono text-xs">
                  <div className="text-center">
                    <img
                      src={receiptLogoImageUrl || "/company-stamp.png"}
                      alt={t("posReceiptLogoAlt")}
                      className={cn(
                        "mx-auto h-auto object-contain",
                        receiptLogoSize === "sm" ? "w-20" : receiptLogoSize === "lg" ? "w-32" : "w-24"
                      )}
                    />
                    <div className="mt-1 text-black">{previewData.storeCode}</div>
                  </div>
                  <div className="my-2 border-t border-dashed border-black" />
                  {receiptShowTitle && (
                    <div>
                      <div className="text-center text-sm font-semibold tracking-wide">{t("posReceipt") || "영수증"}</div>
                      <div className="text-center text-xs text-black">{tr("posReceiptSimpleTaxInvoice", "간이 세금계산서")}</div>
                    </div>
                  )}
                  <div className="mt-1">
                    <div className="my-1 grid grid-cols-[70px_minmax(0,1fr)] items-start gap-x-1"><span>{tr("posOrderNo", "주문번호")}</span><span className="break-words">{formatPosOrderNoForPrint(previewData.orderNo)}</span></div>
                    <div className="my-1 grid grid-cols-[70px_minmax(0,1fr)] items-start gap-x-1"><span>{t("posTable") || "테이블"}</span><span className="break-words">{previewData.tableName}</span></div>
                    <div className="my-1 grid grid-cols-[70px_minmax(0,1fr)] items-start gap-x-1"><span>{t("date") || "Date"}</span><span className="break-words">{previewData.now}</span></div>
                    <div className="my-1 flex items-center justify-between"><span>{t("posOrderType") || "Order Type"}</span><span>{previewData.orderType}</span></div>
                  </div>
                  <div className="my-2 border-t border-dashed border-black" />
                  {(receiptBizName || receiptBizTaxId || receiptBizAbn || receiptBizOwner || receiptBizAddress || receiptBizPhone) && (
                    <div className="space-y-0.5 text-black">
                      {receiptBizName && <div className="font-semibold">{receiptBizName}</div>}
                      {receiptBizTaxId && <div>{tr("posTaxIdLabel", "사업자번호")}: {receiptBizTaxId}</div>}
                      {receiptBizAbn && <div>ABN: {receiptBizAbn}</div>}
                      {receiptBizOwner && <div>{t("posOwner") || "대표"}: {receiptBizOwner}</div>}
                      {receiptBizAddress && <div>{receiptBizAddress}</div>}
                      {receiptBizPhone && <div>{tr("posTelLabel", "전화")}: {receiptBizPhone}</div>}
                    </div>
                  )}
                  <div className="my-2 border-t-2 border-black" />
                  <div className="mb-1 flex items-center justify-between border-b border-black pb-1 text-[11px] font-semibold">
                    <span>{tr("posMenuName", "품목")}</span>
                    <span>{tr("amount", "금액")}</span>
                  </div>
                  {previewData.items.map((it) => (
                    <div key={it.name} className="my-1">
                      <div className="flex items-center justify-between">
                        <span>{it.qty}x {it.name}</span>
                        <span>{(it.qty * it.price).toLocaleString()}</span>
                      </div>
                      {itemBarcode ? (
                        <div className="text-center mt-1">
                          <img
                            src={buildCode128BarcodeUrl(`pv-${it.name}`)}
                            alt="Item barcode"
                            className="mx-auto h-auto max-w-full"
                            style={{ width: "66mm" }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div className="my-2 border-t border-dashed border-black" />
                  <div className="my-1 flex items-center justify-between"><span>{t("posSubtotal") || "소계"}</span><span>{previewData.subtotal.toLocaleString()}</span></div>
                  <div className="my-1 flex items-center justify-between"><span>{t("posDiscount") || "할인"}</span><span>-{previewData.discount.toLocaleString()}</span></div>
                  <div className="my-1 flex items-center justify-between"><span>{t("posDeliveryFee") || "배달 수수료"}</span><span>+{previewData.delivery.toLocaleString()}</span></div>
                  <div className="my-1 flex items-center justify-between"><span>{t("posPackagingFee") || "포장 수수료"}</span><span>+{previewData.packaging.toLocaleString()}</span></div>
                  <div className="my-2 border-t-2 border-black" />
                  <div className="font-bold">
                    <div className="flex items-center justify-between"><span>{t("posTotal") || "합계"}</span><span>{previewData.total.toLocaleString()}</span></div>
                  </div>
                  <div className="my-2 border-t border-dashed border-black" />
                  {receiptBarcode ? (
                    <div className="my-2 text-center">
                      <img
                        src={buildCode128BarcodeUrl(previewData.orderNo)}
                        alt="Receipt barcode"
                        className="mx-auto h-auto max-w-full"
                        style={{ width: "68mm" }}
                      />
                    </div>
                  ) : null}
                  {signatureLine && receiptPreviewIsTaxInvoice ? (
                    <div className="my-2 text-[11px] text-black">
                      {tr("posSignature", "서명")}: ____________________
                    </div>
                  ) : null}
                  {receiptShowPaidStamp && (
                    <div className="my-2 text-center">
                      <span className="inline-block border border-black px-3 py-0.5 text-xs font-semibold tracking-widest">{tr("posReceiptPaid", "결제완료")}</span>
                    </div>
                  )}
                  {receiptShowMembershipQr && (receiptMembershipQrLinkUrl.trim() || receiptMembershipQrImageUrl) && (
                    <div className="my-2 text-center">
                      <img
                        src={
                          receiptMembershipQrLinkUrl.trim()
                            ? `https://quickchart.io/qr?text=${encodeURIComponent(receiptMembershipQrLinkUrl.trim())}&size=180&margin=1&format=png`
                            : receiptMembershipQrImageUrl
                        }
                        alt="Membership QR"
                        className="mx-auto h-20 w-20 object-contain"
                      />
                      {receiptMembershipQrText.trim() ? (
                        <div className="mt-1 text-[11px] text-black">{receiptMembershipQrText.trim()}</div>
                      ) : null}
                    </div>
                  )}
                  {receiptShowStamp && receiptStampImageUrl && !receiptStampOnlyTaxInvoice && (
                    <div className="my-2 text-center">
                      <img src={receiptStampImageUrl} alt="Company stamp" className="mx-auto h-16 w-16 object-contain" />
                    </div>
                  )}
                  {(
                    receiptFooterPrimaryText.trim() ||
                    receiptFooterSecondaryText.trim() ||
                    receiptShowThankYou ||
                    receiptShowCustomerCopy
                  ) && (
                    <div className="text-center text-black">
                      {receiptFooterPrimaryText.trim() ? <div className="font-semibold">{receiptFooterPrimaryText.trim()}</div> : receiptShowThankYou ? <div className="font-semibold">{tr("posReceiptThankYou", "감사합니다")}</div> : null}
                      {receiptFooterSecondaryText.trim() ? <div>{receiptFooterSecondaryText.trim()}</div> : receiptShowCustomerCopy ? <div>{tr("posReceiptCustomerCopy", "고객용")}</div> : null}
                    </div>
                  )}
                </div>
            </div>
          </div>
            </TabsContent>
            <TabsContent value="kitchen" className="mt-3 outline-none">
          <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/20 p-4">
            <div
              className={cn(
                "mx-auto w-full rounded-md border bg-white p-3 text-black",
                "max-w-2xl space-y-4"
              )}
            >
                  {kitchenSlipsForPreview.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      {t("posKitchenNoItemsToPrint")}
                    </p>
                  ) : (
                    kitchenSlipsForPreview.map((slip) => (
                      <div
                        key={slip.label}
                        className={cn(
                          "text-base rounded-md border border-dashed p-3",
                          kitchenSlipFontScale === "sm" && "text-sm",
                          kitchenSlipFontScale === "lg" && "text-lg"
                        )}
                      >
                        <div
                          className={cn(
                            "mb-2 border-b-2 border-black pb-2 text-center font-bold",
                            kitchenSlipFontScale === "sm" && "text-base",
                            kitchenSlipFontScale === "md" && "text-lg",
                            kitchenSlipFontScale === "lg" && "text-xl"
                          )}
                        >
                          {slip.label}
                        </div>
                        <div className="mb-1 font-bold">{formatPosOrderNoForPrint(previewData.orderNo)}</div>
                        <div className="mb-1">
                          {previewData.storeCode} · {previewData.orderType} · {t("posTable") || "테이블"}:{" "}
                          {previewData.tableName}
                        </div>
                        <div className="mb-2">{previewData.now}</div>
                        <hr className="my-2 border-black" />
                        {slip.items.map((it) => (
                          <div key={`${slip.label}-${it.name}-${it.qty}`} className="my-1">
                            {it.qty} × {it.name}
                            {kitchenSlipShowLineNotes && it.note ? (
                              <div className="pl-1 text-xs text-neutral-600">{it.note}</div>
                            ) : null}
                          </div>
                        ))}
                        {kitchenSlipShowOrderMemo ? (
                          <div className="mt-3 rounded bg-slate-100 p-2 text-sm">
                            {t("posCustomerMemo") || "메모"}: {previewData.memo}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
            </div>
          </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              {t("posDialogClose")}
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleTestPrint(previewKind)}>
              <Printer className="mr-2 h-4 w-4" />
              {t("posPrintTest")}
            </Button>
            <Button
              type="button"
              disabled={saving || loading || !effectiveStore}
              onClick={async () => {
                const ok = await handleSave()
                if (ok) setPreviewOpen(false)
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              {t("posPrintPreviewSaveSettings") || t("itemsBtnSave") || "설정 저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
