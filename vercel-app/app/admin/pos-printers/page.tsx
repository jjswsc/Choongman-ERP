"use client"

import * as React from "react"
import { Printer, Save, RotateCw, Wallet, Receipt, Building2, Calculator } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
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
import { useT } from "@/lib/i18n"
import {
  getPosPrinterSettings,
  getPosMenuCategories,
  savePosPrinterSettings,
  useStoreList,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole, canAccessPosPrinters } from "@/lib/permissions"
import { cn, escapeHtml } from "@/lib/utils"

type PreviewKind = "receipt" | "kitchen"

const POS_PAPER_WIDTH_MM = 80
const POS_PAPER_SIDE_PADDING_MM = 3
const POS_PAPER_HEIGHT_MM = 200

const getPosPaperBaseCss = (fontFamily: string, fontSizePx: number) => `
  @page { size: ${POS_PAPER_WIDTH_MM}mm ${POS_PAPER_HEIGHT_MM}mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${POS_PAPER_WIDTH_MM}mm;
    box-sizing: border-box;
    font-family: ${fontFamily};
    font-size: ${fontSizePx}px;
    padding: ${POS_PAPER_SIDE_PADDING_MM}mm;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
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
  const yesLabel = t("yes") || "예"
  const noLabel = t("no") || "아니오"
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

function getBangkokNowStr() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date())
}

export default function PosPrintersPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState("")
  const [kitchenMode, setKitchenMode] = React.useState<1 | 2>(1)
  const [kitchen1Categories, setKitchen1Categories] = React.useState<string[]>([])
  const [kitchen2Categories, setKitchen2Categories] = React.useState<string[]>([])
  const [autoStockDeduction, setAutoStockDeduction] = React.useState(false)
  const [deliveryFee, setDeliveryFee] = React.useState("0")
  const [packagingFee, setPackagingFee] = React.useState("0")
  const [categories, setCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [previewKind, setPreviewKind] = React.useState<PreviewKind>("receipt")
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("printer")

  const [cardAutoOpen, setCardAutoOpen] = React.useState(false)
  const [checkAutoOpen, setCheckAutoOpen] = React.useState(false)
  const [drawerOpenOption, setDrawerOpenOption] = React.useState<'password_and_reason' | 'reason_only' | 'force'>('reason_only')

  const [logoPrint, setLogoPrint] = React.useState(false)
  const [receiptPrintTiming, setReceiptPrintTiming] = React.useState<'per_payment' | 'final_payment'>('per_payment')
  const [customerReceiptOrderDetails, setCustomerReceiptOrderDetails] = React.useState(true)
  const [merchantReceiptOrderDetails, setMerchantReceiptOrderDetails] = React.useState(true)
  const [cashPaymentReceipt, setCashPaymentReceipt] = React.useState(false)
  const [signatureLine, setSignatureLine] = React.useState(false)
  const [receiptBarcode, setReceiptBarcode] = React.useState(true)
  const [itemBarcode, setItemBarcode] = React.useState(true)
  const [qrCodeOption, setQrCodeOption] = React.useState<'yes' | 'no' | 'return_points'>('yes')
  const [discountSeparatePrint, setDiscountSeparatePrint] = React.useState(true)
  const [merchantReceiptPrint, setMerchantReceiptPrint] = React.useState(true)
  const [actualOrderDetails, setActualOrderDetails] = React.useState(true)
  const [toppingOptionsPrint, setToppingOptionsPrint] = React.useState(false)
  const [autoPrintReceiptOnOrder, setAutoPrintReceiptOnOrder] = React.useState(false)
  const [autoPrintReceiptOnAddOrder, setAutoPrintReceiptOnAddOrder] = React.useState(false)
  const [autoPrintReceiptOnPayment, setAutoPrintReceiptOnPayment] = React.useState(false)
  const [autoPrintKitchenSlipOnOrder, setAutoPrintKitchenSlipOnOrder] = React.useState(false)
  const [receiptBizName, setReceiptBizName] = React.useState("")
  const [receiptBizTaxId, setReceiptBizTaxId] = React.useState("")
  const [receiptBizOwner, setReceiptBizOwner] = React.useState("")
  const [receiptBizAddress, setReceiptBizAddress] = React.useState("")
  const [receiptBizPhone, setReceiptBizPhone] = React.useState("")
  const [receiptDesignStyle, setReceiptDesignStyle] = React.useState<'badge' | 'simple'>('badge')
  const [receiptLogoSize, setReceiptLogoSize] = React.useState<'sm' | 'md' | 'lg'>('md')
  const [receiptShowTitle, setReceiptShowTitle] = React.useState(true)
  const [receiptShowPaidStamp, setReceiptShowPaidStamp] = React.useState(true)
  const [receiptShowThankYou, setReceiptShowThankYou] = React.useState(true)
  const [receiptShowCustomerCopy, setReceiptShowCustomerCopy] = React.useState(true)
  const [vatRate, setVatRate] = React.useState("7")
  const [vatMode, setVatMode] = React.useState<'included' | 'separate'>('included')
  const [serviceRate, setServiceRate] = React.useState("0")
  const [serviceMode, setServiceMode] = React.useState<'included' | 'separate'>('separate')
  const [cardRate, setCardRate] = React.useState("0")
  const [cardMode, setCardMode] = React.useState<'included' | 'separate'>('separate')
  const [cardBaseMode, setCardBaseMode] = React.useState<'card_only' | 'card_plus_vat' | 'card_plus_vat_service'>('card_only')
  const [otherRate, setOtherRate] = React.useState("0")
  const [otherMode, setOtherMode] = React.useState<'included' | 'separate'>('separate')

  const canSearchAll = isOfficeRole(auth?.role || "")
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ""

  const loadData = React.useCallback(() => {
    if (!effectiveStore) return
    setLoading(true)
    Promise.all([
      getPosPrinterSettings({ storeCode: effectiveStore }),
      getPosMenuCategories(),
    ])
      .then(([settings, { categories: cats }]) => {
        setKitchenMode((settings.kitchenMode as 1 | 2) || 1)
        setKitchen1Categories(settings.kitchen1Categories || [])
        setKitchen2Categories(settings.kitchen2Categories || [])
        setAutoStockDeduction(Boolean(settings.autoStockDeduction))
        setDeliveryFee(String(settings.deliveryFee ?? 0))
        setPackagingFee(String(settings.packagingFee ?? 0))
        setCategories(cats || [])
        setCardAutoOpen(Boolean(settings.cardAutoOpen))
        setCheckAutoOpen(Boolean(settings.checkAutoOpen))
        setDrawerOpenOption((['password_and_reason', 'reason_only', 'force'].includes(settings.drawerOpenOption || '') ? settings.drawerOpenOption : 'reason_only') as 'password_and_reason' | 'reason_only' | 'force')
        setLogoPrint(Boolean(settings.logoPrint))
        setReceiptPrintTiming(settings.receiptPrintTiming === 'final_payment' ? 'final_payment' : 'per_payment')
        setCustomerReceiptOrderDetails(settings.customerReceiptOrderDetails !== false)
        setMerchantReceiptOrderDetails(settings.merchantReceiptOrderDetails !== false)
        setCashPaymentReceipt(Boolean(settings.cashPaymentReceipt))
        setSignatureLine(Boolean(settings.signatureLine))
        setReceiptBarcode(settings.receiptBarcode !== false)
        setItemBarcode(settings.itemBarcode !== false)
        setQrCodeOption((['yes', 'no', 'return_points'].includes(settings.qrCodeOption || '') ? settings.qrCodeOption : 'yes') as 'yes' | 'no' | 'return_points')
        setDiscountSeparatePrint(settings.discountSeparatePrint !== false)
        setMerchantReceiptPrint(settings.merchantReceiptPrint !== false)
        setActualOrderDetails(settings.actualOrderDetails !== false)
        setToppingOptionsPrint(Boolean(settings.toppingOptionsPrint))
        setAutoPrintReceiptOnOrder(Boolean(settings.autoPrintReceiptOnOrder))
        setAutoPrintReceiptOnAddOrder(Boolean(settings.autoPrintReceiptOnAddOrder))
        setAutoPrintReceiptOnPayment(Boolean(settings.autoPrintReceiptOnPayment ?? settings.autoPrintReceiptOnOrder))
        setAutoPrintKitchenSlipOnOrder(Boolean(settings.autoPrintKitchenSlipOnOrder))
        setReceiptBizName(String(settings.receiptBizName || ""))
        setReceiptBizTaxId(String(settings.receiptBizTaxId || ""))
        setReceiptBizOwner(String(settings.receiptBizOwner || ""))
        setReceiptBizAddress(String(settings.receiptBizAddress || ""))
        setReceiptBizPhone(String(settings.receiptBizPhone || ""))
        setReceiptDesignStyle(settings.receiptDesignStyle === 'simple' ? 'simple' : 'badge')
        setReceiptLogoSize(
          settings.receiptLogoSize === 'sm'
            ? 'sm'
            : settings.receiptLogoSize === 'lg'
              ? 'lg'
              : 'md'
        )
        setReceiptShowTitle(settings.receiptShowTitle !== false)
        setReceiptShowPaidStamp(settings.receiptShowPaidStamp !== false)
        setReceiptShowThankYou(settings.receiptShowThankYou !== false)
        setReceiptShowCustomerCopy(settings.receiptShowCustomerCopy !== false)
        setVatRate(String(settings.vatRate ?? 7))
        setVatMode(settings.vatMode === 'separate' ? 'separate' : 'included')
        setServiceRate(String(settings.serviceRate ?? 0))
        setServiceMode(settings.serviceMode === 'included' ? 'included' : 'separate')
        setCardRate(String(settings.cardRate ?? 0))
        setCardMode(settings.cardMode === 'included' ? 'included' : 'separate')
        setCardBaseMode(
          settings.cardBaseMode === 'card_plus_vat'
            ? 'card_plus_vat'
            : settings.cardBaseMode === 'card_plus_vat_service'
              ? 'card_plus_vat_service'
              : 'card_only'
        )
        setOtherRate(String(settings.otherRate ?? 0))
        setOtherMode(settings.otherMode === 'included' ? 'included' : 'separate')
      })
      .catch(() => {
        setCategories([])
      })
      .finally(() => setLoading(false))
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

  const toggleKitchen1 = (cat: string) => {
    if (kitchen1Categories.includes(cat)) {
      setKitchen1Categories((prev) => prev.filter((c) => c !== cat))
    } else {
      setKitchen1Categories((prev) => [...prev, cat])
      setKitchen2Categories((prev) => prev.filter((c) => c !== cat))
    }
  }

  const toggleKitchen2 = (cat: string) => {
    if (kitchen2Categories.includes(cat)) {
      setKitchen2Categories((prev) => prev.filter((c) => c !== cat))
    } else {
      setKitchen2Categories((prev) => [...prev, cat])
      setKitchen1Categories((prev) => prev.filter((c) => c !== cat))
    }
  }

  const handleSave = async () => {
    if (!effectiveStore) {
      alert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const res = await savePosPrinterSettings({
        storeCode: effectiveStore,
        kitchenMode,
        kitchen1Categories,
        kitchen2Categories,
        autoStockDeduction,
        deliveryFee: Number(deliveryFee) || 0,
        packagingFee: Number(packagingFee) || 0,
        cardAutoOpen,
        checkAutoOpen,
        drawerOpenOption,
        logoPrint,
        receiptPrintTiming,
        customerReceiptOrderDetails,
        merchantReceiptOrderDetails,
        cashPaymentReceipt,
        signatureLine,
        receiptBarcode,
        itemBarcode,
        qrCodeOption,
        discountSeparatePrint,
        merchantReceiptPrint,
        actualOrderDetails,
        toppingOptionsPrint,
        autoPrintReceiptOnOrder,
        autoPrintReceiptOnAddOrder,
        autoPrintReceiptOnPayment,
        autoPrintKitchenSlipOnOrder,
        receiptBizName,
        receiptBizTaxId,
        receiptBizOwner,
        receiptBizAddress,
        receiptBizPhone,
        receiptDesignStyle,
        receiptLogoSize,
        receiptShowTitle,
        receiptShowPaidStamp,
        receiptShowThankYou,
        receiptShowCustomerCopy,
        vatRate: Number(vatRate) || 0,
        vatMode,
        serviceRate: Number(serviceRate) || 0,
        serviceMode,
        cardRate: Number(cardRate) || 0,
        cardMode,
        cardBaseMode,
        otherRate: Number(otherRate) || 0,
        otherMode,
      })
      if (res.success) {
        alert(t("itemsAlertSaved") || "저장되었습니다.")
        loadData()
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const previewData = React.useMemo(() => {
    const items = [
      { name: "후라이드 치킨", qty: 1, price: 199 },
      { name: "콜라 1.25L", qty: 1, price: 45 },
    ]
    const subtotal = items.reduce((sum, it) => sum + it.qty * it.price, 0)
    const delivery = Math.max(0, Number(deliveryFee) || 0)
    const packaging = Math.max(0, Number(packagingFee) || 0)
    const discount = 10
    const total = Math.max(0, subtotal - discount + delivery + packaging)
    return {
      orderNo: "TEST-0001",
      storeCode: effectiveStore || "ST01",
      orderType: t("posOrderTypeTakeout") || "포장",
      tableName: "A-1",
      now: getBangkokNowStr(),
      items,
      subtotal,
      discount,
      delivery,
      packaging,
      total,
      memo: t("posCustomerMemo") || "덜 맵게 부탁드려요.",
    }
  }, [deliveryFee, packagingFee, effectiveStore, t])

  const buildReceiptHtml = React.useCallback(() => {
    const logoUrl = `${window.location.origin}/company-stamp.png`
    const lines = previewData.items
      .map(
        (it) =>
          `<div class="receipt-row"><span>${it.qty}x ${escapeHtml(it.name)}</span><span>${(
            it.qty * it.price
          ).toLocaleString()}</span></div>`
      )
      .join("")
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(t("posReceipt") || "영수증")}</title>
          <style>
            ${getPosPaperBaseCss("'Courier New', monospace", 12)}
            body { font-weight: 600; line-height: 1.4; letter-spacing: 0.01em; color: #000; }
            .receipt-content { width: 72mm; max-width: 72mm; margin: 0 auto; }
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
            .receipt-row { display: flex; justify-content: space-between; margin: 4px 0; }
            .receipt-item-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; padding-bottom: 4px; border-bottom: 1px solid #111; }
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
              ? `<div><div class="receipt-section-title">RECEIPT</div><div class="receipt-sub-title">Tax Invoice (ABB)</div></div>`
              : ""
          }
          <div class="text-xs">
            <div class="receipt-row"><span class="receipt-muted">Order #</span><span>${escapeHtml(previewData.orderNo)}</span></div>
            <div class="receipt-row"><span class="receipt-muted">${escapeHtml(t("posTable") || "테이블")}</span><span>${escapeHtml(previewData.tableName)}</span></div>
            <div class="receipt-row"><span class="receipt-muted">${escapeHtml(t("date") || "Date")}</span><span>${escapeHtml(previewData.now)}</span></div>
            <div class="receipt-row"><span class="receipt-muted">${escapeHtml(t("posOrderType") || "Order Type")}</span><span>${escapeHtml(previewData.orderType)}</span></div>
          </div>
          <div class="receipt-divider"></div>
          ${(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? '<div class="text-xs receipt-muted">' : ""}
          ${receiptBizName ? `<div class="biz-line biz-strong">${escapeHtml(receiptBizName)}</div>` : ""}
          ${receiptBizTaxId ? `<div class="biz-line">Tax ID: ${escapeHtml(receiptBizTaxId)}</div>` : ""}
          ${receiptBizOwner ? `<div class="biz-line">${escapeHtml(t("posOwner") || "대표")}: ${escapeHtml(receiptBizOwner)}</div>` : ""}
          ${receiptBizAddress ? `<div class="biz-line">${escapeHtml(receiptBizAddress)}</div>` : ""}
          ${receiptBizPhone ? `<div class="biz-line">TEL: ${escapeHtml(receiptBizPhone)}</div>` : ""}
          ${(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) ? "</div>" : ""}
          <div class="receipt-divider-strong"></div>
          <div class="receipt-item-head"><span>ITEM</span><span>AMOUNT</span></div>
          ${lines}
          <div class="receipt-divider"></div>
          <div class="receipt-row"><span>${escapeHtml(t("posSubtotal") || "소계")}</span><span>${previewData.subtotal.toLocaleString()} ฿</span></div>
          <div class="receipt-row"><span>${escapeHtml(t("posDiscount") || "할인")}</span><span>-${previewData.discount.toLocaleString()} ฿</span></div>
          <div class="receipt-row"><span>${escapeHtml(t("posDeliveryFee") || "배달 수수료")}</span><span>+${previewData.delivery.toLocaleString()} ฿</span></div>
          <div class="receipt-row"><span>${escapeHtml(t("posPackagingFee") || "포장 수수료")}</span><span>+${previewData.packaging.toLocaleString()} ฿</span></div>
          <div class="receipt-divider-strong"></div>
          <div class="receipt-total">
            <div class="receipt-row"><span>${escapeHtml(t("posTotal") || "합계")}</span><span>${previewData.total.toLocaleString()} ฿</span></div>
          </div>
          <div class="receipt-divider"></div>
          ${receiptShowPaidStamp ? '<div class="paid-stamp-wrap"><span class="paid-stamp">PAID</span></div>' : ""}
          ${(receiptShowThankYou || receiptShowCustomerCopy) ? '<div class="text-center text-xs receipt-muted">' : ""}
          ${receiptShowThankYou ? '<div class="footer-strong">Thank you!</div>' : ""}
          ${receiptShowCustomerCopy ? '<div>Customer Copy</div>' : ""}
          ${(receiptShowThankYou || receiptShowCustomerCopy) ? "</div>" : ""}
          </div>
        </body>
      </html>
    `
  }, [previewData, t, receiptLogoSize, receiptShowTitle, receiptShowPaidStamp, receiptShowThankYou, receiptShowCustomerCopy, receiptBizName, receiptBizTaxId, receiptBizOwner, receiptBizAddress, receiptBizPhone])

  const buildKitchenHtml = React.useCallback(() => {
    const lines = previewData.items
      .map((it) => `<div class="k-row">${escapeHtml(it.name)} x ${it.qty}</div>`)
      .join("")
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(t("posKitchenOrder") || "주방 주문서")}</title>
          <style>
            ${getPosPaperBaseCss("sans-serif", 18)}
            .k-header { text-align: center; font-size: 22px; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
            .k-row { margin: 6px 0; font-size: 18px; }
            .k-memo { margin-top: 8px; padding: 8px; background: #f0f0f0; font-size: 16px; }
          </style>
        </head>
        <body>
          <div class="k-header">${escapeHtml(t("posKitchenOrder") || "주방 주문서")}</div>
          <div class="k-row"><strong>${escapeHtml(previewData.orderNo)}</strong></div>
          <div class="k-row">${escapeHtml(
            `${previewData.storeCode} · ${previewData.orderType} · ${t("posTable") || "테이블"}: ${previewData.tableName}`
          )}</div>
          <div class="k-row">${escapeHtml(previewData.now)}</div>
          <hr style="margin: 10px 0;" />
          ${lines}
          <div class="k-memo">${escapeHtml(`${t("posCustomerMemo") || "메모"}: ${previewData.memo}`)}</div>
        </body>
      </html>
    `
  }, [previewData, t])

  const handleOpenPreview = (kind: PreviewKind) => {
    setPreviewKind(kind)
    setPreviewOpen(true)
  }

  const handleTestPrint = (kind: PreviewKind) => {
    const html = kind === "receipt" ? buildReceiptHtml() : buildKitchenHtml()
    const title = kind === "receipt" ? t("posReceipt") || "영수증" : t("posKitchenOrder") || "주방 주문서"
    const w = window.open("", "_blank")
    if (!w) {
      alert(t("posPrintBlocked") || "팝업이 차단되었습니다. 인쇄를 허용해 주세요.")
      return
    }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => {
      w.print()
      w.close()
    }, 250)
  }

  if (!canAccessPosPrinters(auth?.role || "")) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-muted-foreground">{t("noPermission") || "접근 권한이 없습니다."}</p>
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
              {t("posPrinterSettings") || "프린터 설정"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posPrinterSettingsSub") || "매장별 주방 프린터·카테고리 출력 설정"}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select value={storeCode} onValueChange={setStoreCode}>
            <SelectTrigger className="h-10 w-40">
              <SelectValue placeholder={t("store") || "매장"} />
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
            {t("posRefresh") || "새로고침"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        {effectiveStore && !loading && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="rounded-xl border bg-card">
            <TabsList className="w-full justify-start rounded-t-xl rounded-b-none border-b px-4 pt-4 gap-2">
              <TabsTrigger value="printer" className="gap-1.5">
                <Printer className="h-4 w-4" />
                {t("posPrinterTab") || "프린터"}
              </TabsTrigger>
              <TabsTrigger value="receipt" className="gap-1.5">
                <Receipt className="h-4 w-4" />
                {t("posReceiptTab") || "영수증"}
              </TabsTrigger>
              <TabsTrigger value="receipt-design" className="gap-1.5">
                <Receipt className="h-4 w-4" />
                {t("posReceiptDesignTab") || "영수증 디자인"}
              </TabsTrigger>
              <TabsTrigger value="kitchen" className="gap-1.5">
                <Printer className="h-4 w-4" />
                {t("posKitchenSlip") || "주방 인쇄"}
              </TabsTrigger>
              <TabsTrigger value="business" className="gap-1.5">
                <Building2 className="h-4 w-4" />
                {t("posBizInfoTab") || "사업자 정보"}
              </TabsTrigger>
              <TabsTrigger value="pricing" className="gap-1.5">
                <Calculator className="h-4 w-4" />
                {t("posPricingTab") || "최종가격"}
              </TabsTrigger>
              <TabsTrigger value="drawer" className="gap-1.5">
                <Wallet className="h-4 w-4" />
                {t("posDrawerTab") || "돈통"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="printer" className="mt-0 p-6 space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{t("posDeliveryFee") || "배달 수수료"} (฿)</label>
                <Input
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("posPackagingFee") || "포장 수수료"} (฿)</label>
                <Input
                  type="number"
                  min={0}
                  value={packagingFee}
                  onChange={(e) => setPackagingFee(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium">{t("posAutoStockDeduction") || "자동 재고 차감"}</p>
                <p className="text-xs text-muted-foreground">
                  {t("posAutoStockDeductionHint") || "주문 완료 시 메뉴 BOM에 따라 재고가 자동 차감됩니다. 매장 적응 후 사용하세요."}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoStockDeduction}
                  onChange={(e) => setAutoStockDeduction(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{t("posUse") || "사용"}</span>
              </label>
            </div>

            <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-xs text-muted-foreground">
              {t("posPrinterNote") ||
                "※ 손님 영수증·주방 주문서는 결제 완료 후 모달에서 수동 인쇄하거나, 각 탭에서 자동 인쇄를 설정할 수 있습니다."}
            </div>

            <div className="grid gap-2 sm:grid-cols-1">
              <Button variant="outline" onClick={() => handleOpenPreview("receipt")}>
                <Printer className="mr-2 h-4 w-4" />
                {t("posReceipt") || "영수증"} {t("preview") || "미리보기"}
              </Button>
            </div>
            </TabsContent>

            <TabsContent value="kitchen" className="mt-0 p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("posKitchenOptionsHint") || "주방 주문서 출력 방식, 분류, 자동 인쇄를 설정합니다."}
              </p>
              <div>
                <label className="text-sm font-medium">{t("posKitchenMode") || "주방 프린터 구성"}</label>
                <Select
                  value={String(kitchenMode)}
                  onValueChange={(v) => setKitchenMode(Number(v) as 1 | 2)}
                >
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("posKitchenMode1") || "1대 (통합)"}</SelectItem>
                    <SelectItem value="2">{t("posKitchenMode2") || "2대 (카테고리별)"}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("posKitchenModeHint") || "2대: 치킨→주방1, 한식→주방2 등 카테고리별 출력"}
                </p>
              </div>

              {kitchenMode === 2 && categories.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 text-sm font-semibold">
                      {t("posKitchen1") || "주방 1"}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <label
                          key={cat}
                          className={cn(
                            "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs",
                            kitchen1Categories.includes(cat)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-muted bg-muted/30 text-muted-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={kitchen1Categories.includes(cat)}
                            onChange={() => toggleKitchen1(cat)}
                            className="mr-1.5"
                          />
                          {cat}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <h3 className="mb-2 text-sm font-semibold">
                      {t("posKitchen2") || "주방 2"}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <label
                          key={cat}
                          className={cn(
                            "inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-xs",
                            kitchen2Categories.includes(cat)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-muted bg-muted/30 text-muted-foreground"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={kitchen2Categories.includes(cat)}
                            onChange={() => toggleKitchen2(cat)}
                            className="mr-1.5"
                          />
                          {cat}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <ToggleRow label={t("posKitchenAutoPrintOnOrder") || "주문 완료 시 주방 주문서 자동 인쇄"} value={autoPrintKitchenSlipOnOrder} onChange={setAutoPrintKitchenSlipOnOrder} t={t} />
              </div>

              <div className="grid gap-2 sm:grid-cols-1">
                <Button variant="outline" onClick={() => handleOpenPreview("kitchen")}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("posKitchenOrder") || "주방 주문서"} {t("preview") || "미리보기"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="receipt" className="mt-0 p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("posReceiptOptionsHint") || "영수증·고객 주문서 출력 시 포함할 항목을 설정합니다."}
              </p>
              <div className="space-y-3">
                <ToggleRow label={t("posLogoPrint") || "로고 인쇄"} value={logoPrint} onChange={setLogoPrint} t={t} />
                <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                  {t("posReceiptPrintTiming") || "영수증 출력 시점"}: {t("posOrderButton") || "주문"} / {t("posReorder") || "추가 주문"} / {t("posPayButton") || "결제"}
                </div>
                <ToggleRow label={t("posCustomerReceiptOrderDetails") || "고객영수증 주문내역"} value={customerReceiptOrderDetails} onChange={setCustomerReceiptOrderDetails} t={t} />
                <ToggleRow label={t("posMerchantReceiptOrderDetails") || "가맹점영수증 주문내역"} value={merchantReceiptOrderDetails} onChange={setMerchantReceiptOrderDetails} t={t} />
                <ToggleRow label={t("posCashPaymentReceipt") || "현금 결제 시 영수증 출력"} value={cashPaymentReceipt} onChange={setCashPaymentReceipt} t={t} />
                <ToggleRow label={t("posSignatureLine") || "서명란 출력"} value={signatureLine} onChange={setSignatureLine} t={t} />
                <ToggleRow label={t("posReceiptBarcode") || "영수증 바코드"} value={receiptBarcode} onChange={setReceiptBarcode} t={t} />
                <ToggleRow label={t("posItemBarcode") || "아이템 바코드"} value={itemBarcode} onChange={setItemBarcode} t={t} />
                <div>
                  <label className="text-sm font-medium">{t("posQrCodeOption") || "QR코드 영수증"}</label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {(['yes', 'no', 'return_points'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setQrCodeOption(v)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm",
                          qrCodeOption === v ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                        )}
                      >
                        {v === 'yes' ? t("yes") || "예" : v === 'no' ? t("no") || "아니오" : (t("posQrReturnPoints") || "리턴포인트")}
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleRow label={t("posDiscountSeparatePrint") || "할인내역 별도출력"} value={discountSeparatePrint} onChange={setDiscountSeparatePrint} t={t} />
                <ToggleRow label={t("posMerchantReceiptPrint") || "가맹점 영수증 출력"} value={merchantReceiptPrint} onChange={setMerchantReceiptPrint} t={t} />
                <ToggleRow label={t("posActualOrderDetails") || "실 주문 내역 출력"} value={actualOrderDetails} onChange={setActualOrderDetails} t={t} />
                <ToggleRow label={t("posToppingOptionsPrint") || "토핑메뉴 추가옵션"} value={toppingOptionsPrint} onChange={setToppingOptionsPrint} t={t} />
                <ToggleRow label="주문시 영수증 자동 인쇄" value={autoPrintReceiptOnOrder} onChange={setAutoPrintReceiptOnOrder} t={t} />
                <ToggleRow label="추가 주문시 영수증 자동 인쇄" value={autoPrintReceiptOnAddOrder} onChange={setAutoPrintReceiptOnAddOrder} t={t} />
                <ToggleRow label="결제시 영수증 자동 인쇄" value={autoPrintReceiptOnPayment} onChange={setAutoPrintReceiptOnPayment} t={t} />
              </div>
            </TabsContent>

            <TabsContent value="receipt-design" className="mt-0 p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("posReceiptDesignHint") || "손님 영수증 레이아웃 표시 항목을 설정합니다."}
              </p>
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <label className="text-sm font-medium">{t("posReceiptDesignStyleLabel") || "헤더 스타일"}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptDesignStyle('badge')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptDesignStyle === 'badge' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posReceiptDesignStyleBadge") || "배지형"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptDesignStyle('simple')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptDesignStyle === 'simple' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posReceiptDesignStyleSimple") || "기본형"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">{t("posReceiptLogoSizeLabel") || "로고 크기"}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptLogoSize('sm')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptLogoSize === 'sm' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posReceiptLogoSizeSm") || "작게"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptLogoSize('md')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptLogoSize === 'md' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posReceiptLogoSizeMd") || "중간"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptLogoSize('lg')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        receiptLogoSize === 'lg' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posReceiptLogoSizeLg") || "크게"}
                    </button>
                  </div>
                </div>
                <ToggleRow label={t("posReceiptShowTitle") || "영수증 제목 표시"} value={receiptShowTitle} onChange={setReceiptShowTitle} t={t} />
                <ToggleRow label={t("posReceiptShowPaidStamp") || "PAID 스탬프 표시"} value={receiptShowPaidStamp} onChange={setReceiptShowPaidStamp} t={t} />
                <ToggleRow label={t("posReceiptShowThankYou") || "하단 Thank you 표시"} value={receiptShowThankYou} onChange={setReceiptShowThankYou} t={t} />
                <ToggleRow label={t("posReceiptShowCustomerCopy") || "하단 Customer Copy 표시"} value={receiptShowCustomerCopy} onChange={setReceiptShowCustomerCopy} t={t} />
              </div>
            </TabsContent>

            <TabsContent value="business" className="mt-0 p-6 space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">{t("posBizInfoTab") || "사업자 정보"}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("posBizNameLabel") || "상호명"}</label>
                    <Input value={receiptBizName} onChange={(e) => setReceiptBizName(e.target.value)} className="mt-1 h-9" placeholder={t("posBizNamePh") || "예: 청만 아속점"} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("posBizTaxIdLabel") || "사업자등록번호"}</label>
                    <Input value={receiptBizTaxId} onChange={(e) => setReceiptBizTaxId(e.target.value)} className="mt-1 h-9" placeholder={t("posBizTaxIdPh") || "예: 0105566137147"} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("posBizOwnerLabel") || "대표자명"}</label>
                    <Input value={receiptBizOwner} onChange={(e) => setReceiptBizOwner(e.target.value)} className="mt-1 h-9" placeholder={t("posBizOwnerPh") || "예: 홍길동"} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("posBizPhoneLabel") || "연락처"}</label>
                    <Input value={receiptBizPhone} onChange={(e) => setReceiptBizPhone(e.target.value)} className="mt-1 h-9" placeholder={t("posBizPhonePh") || "예: 02-123-4567"} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("posBizAddressLabel") || "사업장 주소"}</label>
                  <Input value={receiptBizAddress} onChange={(e) => setReceiptBizAddress(e.target.value)} className="mt-1 h-9" placeholder={t("posBizAddressPh") || "예: Bangkok ... "} />
                </div>
                <p className="text-[11px] text-muted-foreground">{t("posBizInfoHint") || "초기값은 기존 매장 정보(vendors)에서 자동 반영되며, 저장 후 언제든 수정할 수 있습니다."}</p>
              </div>
            </TabsContent>

            <TabsContent value="pricing" className="mt-0 p-6 space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-sm font-medium">{t("posPricingTab") || "최종가격"}</p>
                <p className="text-[11px] text-muted-foreground">{t("posPricingAdjustmentsHint") || "각 항목은 % 기준입니다. 포함: 최종금액에 이미 포함, 별도: 최종금액에 추가됩니다."}</p>
                <div className="grid gap-3">
                  {[
                    { key: 'vat', label: t("posVatLabel") || '부가세', rate: vatRate, setRate: setVatRate, mode: vatMode, setMode: setVatMode },
                    { key: 'service', label: t("posServiceFeeLabel") || '서비스비', rate: serviceRate, setRate: setServiceRate, mode: serviceMode, setMode: setServiceMode },
                    { key: 'card', label: t("posCardFeeLabel") || '카드비', rate: cardRate, setRate: setCardRate, mode: cardMode, setMode: setCardMode },
                    { key: 'other', label: t("posOtherFeeLabel") || '기타', rate: otherRate, setRate: setOtherRate, mode: otherMode, setMode: setOtherMode },
                  ].map((it) => (
                    <div key={it.key} className="space-y-1.5">
                      <div className="grid gap-2 sm:grid-cols-[120px_1fr_220px] sm:items-center">
                        <label className="text-sm font-medium">{it.label}</label>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={it.rate}
                          onChange={(e) => it.setRate(e.target.value)}
                          className="h-9"
                          placeholder="0"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => it.setMode('included')}
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm",
                              it.mode === 'included' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                            )}
                          >
                            {t("posFeeModeIncluded") || "포함"}
                          </button>
                          <button
                            type="button"
                            onClick={() => it.setMode('separate')}
                            className={cn(
                              "rounded-md border px-3 py-1.5 text-sm",
                              it.mode === 'separate' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                            )}
                          >
                            {t("posFeeModeSeparate") || "별도"}
                          </button>
                        </div>
                      </div>
                      {it.key !== 'card' && (
                        <p className="text-[11px] text-muted-foreground sm:pl-[120px]">
                          {it.mode === 'included'
                            ? (t("posFeeFormulaIncluded") || '예시) {fee}액 = 기준금액 x ({fee}율 / (100 + {fee}율))').replaceAll('{fee}', it.label)
                            : (t("posFeeFormulaSeparate") || '예시) {fee}액 = 기준금액 x ({fee}율 / 100)').replaceAll('{fee}', it.label)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="rounded-md border bg-muted/20 p-3">
                  <label className="text-sm font-medium">{t("posCardFeeBaseTitle") || "카드비 계산 기준"}</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCardBaseMode('card_only')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        cardBaseMode === 'card_only' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posCardFeeBaseCardOnly") || "카드 결제액 기준"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardBaseMode('card_plus_vat')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        cardBaseMode === 'card_plus_vat' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posCardFeeBaseCardPlusVat") || "카드 결제액+부가세 기준"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardBaseMode('card_plus_vat_service')}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        cardBaseMode === 'card_plus_vat_service' ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posCardFeeBaseCardPlusVatService") || "카드 결제액+부가세+서비스비 기준"}
                    </button>
                  </div>
                  <div className="mt-2 rounded-md border border-dashed bg-background/70 p-2 text-xs text-muted-foreground">
                    <p>
                      {cardBaseMode === 'card_only' && (t("posCardFeeBaseExampleCardOnly") || '예시) 카드비 기준금액 = 카드결제액')}
                      {cardBaseMode === 'card_plus_vat' && (t("posCardFeeBaseExampleCardPlusVat") || '예시) 카드비 기준금액 = 카드결제액 + 카드결제액 기준 부가세분')}
                      {cardBaseMode === 'card_plus_vat_service' && (t("posCardFeeBaseExampleCardPlusVatService") || '예시) 카드비 기준금액 = 카드결제액 + 카드결제액 기준 부가세분 + 카드결제액 기준 서비스비분')}
                    </p>
                    <p className="mt-1">
                      {t("posCardFeeFinalFormula") || '카드비 최종금액 = 카드비 기준금액 x 카드비율(%)'}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="drawer" className="mt-0 p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("posDrawerHint") || "결제 유형별 돈통 자동 열림 및 수동 열기 시 인증 옵션을 설정합니다."}
              </p>
              <div className="space-y-3">
                <ToggleRow label={t("posCardAutoOpen") || "카드결제 자동열기"} value={cardAutoOpen} onChange={setCardAutoOpen} t={t} />
                <ToggleRow label={t("posCheckAutoOpen") || "체크결제 자동열기"} value={checkAutoOpen} onChange={setCheckAutoOpen} t={t} />
                <div>
                  <label className="text-sm font-medium">{t("posDrawerOpenOption") || "돈통열기 옵션"}</label>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("posDrawerOpenOptionHint") || "수동으로 돈통을 열 때 필요한 조건"}
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
                          {v === 'password_and_reason' ? (t("posDrawerPasswordAndReason") || "암호입력 및 사유입력") :
                           v === 'reason_only' ? (t("posDrawerReasonOnly") || "사유입력") :
                           (t("posDrawerForceOpen") || "강제열기")}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <div className="border-t px-6 py-4">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "..." : t("itemsBtnSave") || "저장"}
              </Button>
            </div>
          </Tabs>
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {previewKind === "receipt"
                ? `${t("posReceipt") || "영수증"} ${t("preview") || "미리보기"}`
                : `${t("posKitchenOrder") || "주방 주문서"} ${t("preview") || "미리보기"}`}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto rounded-md border bg-muted/20 p-4">
            <div className="mx-auto w-full max-w-[320px] rounded-md border bg-white p-3 text-black">
              {previewKind === "receipt" ? (
                <div className="font-mono text-xs">
                  <div className="text-center">
                    <img
                      src="/company-stamp.png"
                      alt="Company logo"
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
                      <div className="text-center text-sm font-semibold tracking-wide">RECEIPT</div>
                      <div className="text-center text-xs text-black">Tax Invoice (ABB)</div>
                    </div>
                  )}
                  <div className="mt-1">
                    <div className="my-1 flex items-center justify-between"><span>Order #</span><span>{previewData.orderNo}</span></div>
                    <div className="my-1 flex items-center justify-between"><span>{t("posTable") || "테이블"}</span><span>{previewData.tableName}</span></div>
                    <div className="my-1 flex items-center justify-between"><span>{t("date") || "Date"}</span><span>{previewData.now}</span></div>
                    <div className="my-1 flex items-center justify-between"><span>{t("posOrderType") || "Order Type"}</span><span>{previewData.orderType}</span></div>
                  </div>
                  <div className="my-2 border-t border-dashed border-black" />
                  {(receiptBizName || receiptBizTaxId || receiptBizOwner || receiptBizAddress || receiptBizPhone) && (
                    <div className="space-y-0.5 text-black">
                      {receiptBizName && <div className="font-semibold">{receiptBizName}</div>}
                      {receiptBizTaxId && <div>Tax ID: {receiptBizTaxId}</div>}
                      {receiptBizOwner && <div>{t("posOwner") || "대표"}: {receiptBizOwner}</div>}
                      {receiptBizAddress && <div>{receiptBizAddress}</div>}
                      {receiptBizPhone && <div>TEL: {receiptBizPhone}</div>}
                    </div>
                  )}
                  <div className="my-2 border-t-2 border-black" />
                  <div className="mb-1 flex items-center justify-between border-b border-black pb-1 text-[11px] font-semibold">
                    <span>ITEM</span>
                    <span>AMOUNT</span>
                  </div>
                  {previewData.items.map((it) => (
                    <div key={it.name} className="my-1 flex items-center justify-between">
                      <span>{it.qty}x {it.name}</span>
                      <span>{(it.qty * it.price).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="my-2 border-t border-dashed border-black" />
                  <div className="my-1 flex items-center justify-between"><span>{t("posSubtotal") || "소계"}</span><span>{previewData.subtotal.toLocaleString()} ฿</span></div>
                  <div className="my-1 flex items-center justify-between"><span>{t("posDiscount") || "할인"}</span><span>-{previewData.discount.toLocaleString()} ฿</span></div>
                  <div className="my-1 flex items-center justify-between"><span>{t("posDeliveryFee") || "배달 수수료"}</span><span>+{previewData.delivery.toLocaleString()} ฿</span></div>
                  <div className="my-1 flex items-center justify-between"><span>{t("posPackagingFee") || "포장 수수료"}</span><span>+{previewData.packaging.toLocaleString()} ฿</span></div>
                  <div className="my-2 border-t-2 border-black" />
                  <div className="font-bold">
                    <div className="flex items-center justify-between"><span>{t("posTotal") || "합계"}</span><span>{previewData.total.toLocaleString()} ฿</span></div>
                  </div>
                  <div className="my-2 border-t border-dashed border-black" />
                  {receiptShowPaidStamp && (
                    <div className="my-2 text-center">
                      <span className="inline-block border border-black px-3 py-0.5 text-xs font-semibold tracking-widest">PAID</span>
                    </div>
                  )}
                  {(receiptShowThankYou || receiptShowCustomerCopy) && (
                    <div className="text-center text-black">
                      {receiptShowThankYou && <div className="font-semibold">Thank you!</div>}
                      {receiptShowCustomerCopy && <div>Customer Copy</div>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-base">
                  <div className="mb-2 border-b-2 border-black pb-2 text-center text-lg font-bold">
                    {t("posKitchenOrder") || "주방 주문서"}
                  </div>
                  <div className="mb-1 font-bold">{previewData.orderNo}</div>
                  <div className="mb-1">
                    {previewData.storeCode} · {previewData.orderType} · {t("posTable") || "테이블"}: {previewData.tableName}
                  </div>
                  <div className="mb-2">{previewData.now}</div>
                  <hr className="my-2 border-black" />
                  {previewData.items.map((it) => (
                    <div key={it.name} className="my-1">
                      {it.name} x {it.qty}
                    </div>
                  ))}
                  <div className="mt-3 rounded bg-slate-100 p-2 text-sm">
                    {t("posCustomerMemo") || "메모"}: {previewData.memo}
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t("close") || "닫기"}
            </Button>
            <Button onClick={() => handleTestPrint(previewKind)}>
              <Printer className="mr-2 h-4 w-4" />
              {t("posPrint") || "인쇄"} {t("test") || "테스트"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
