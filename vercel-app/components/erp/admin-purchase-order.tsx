"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getPurchaseLocations,
  getVendorsForPurchase,
  getItemsByVendor,
  getHqStockByLocation,
  getHeadOfficeInfo,
  savePurchaseOrder,
  uploadPoQuotationFile,
  invalidatePurchaseOrdersListCache,
  getPoBillingDraft,
  type PurchaseLocation,
  type VendorForPurchase,
  type ItemByVendor,
} from "@/lib/api-client"
import { useStoreList } from "@/lib/use-store-list"
import { useOrderCreate } from "@/lib/order-create-context"
import { todayStrBangkok } from "@/lib/attendance-utils"
import { Minus, Plus, Search, ShoppingCart, Trash2, Package, ChevronDown, Calculator, Paperclip } from "lucide-react"

function bangkokYearMonth(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date())
    const y = parts.find((p) => p.type === "year")?.value
    const mo = parts.find((p) => p.type === "month")?.value
    if (y && mo) return `${y}-${mo}`
  } catch {
    /* ignore */
  }
  return new Date().toISOString().slice(0, 7)
}

function monthBoundsFromYm(ym: string): { startStr: string; endStr: string } {
  const [ys, ms] = ym.split("-").map((x) => x.trim())
  const y = Number(ys)
  const mo = Number(ms)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    const t = new Date().toISOString().slice(0, 10)
    return { startStr: t, endStr: t }
  }
  const startStr = `${y}-${String(mo).padStart(2, "0")}-01`
  const last = new Date(y, mo, 0).getDate()
  const endStr = `${y}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")}`
  return { startStr, endStr }
}

/** 금액 표시: 천 단위 콤마, 소수는 필요 시 최대 2자리 */
function formatMoneyComma(n: number): string {
  const x = Number(n)
  if (!Number.isFinite(x)) return "0"
  return x.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/** 수량 입력(문자열) → 1 이상 정수 */
function parsePositiveIntQty(s: string): number {
  const n = parseInt(String(s).replace(/\D/g, ""), 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/** 회계 PO: 매장명과 vendors.sales_outlet(매출처)가 같은 거래처 = 해당 매장 법인 */
function vendorForSalesOutletStore(
  vendors: VendorForPurchase[],
  storeName: string
): VendorForPurchase | null {
  const s = String(storeName || "").trim()
  if (!s || s === "_none") return null
  const lower = s.toLowerCase()
  for (const v of vendors) {
    const out = String(v.salesOutlet ?? "").trim()
    if (!out) continue
    if (out === s || out.toLowerCase() === lower) return v
  }
  return null
}

interface CartItem {
  code: string
  name: string
  price: number
  qty: number
  store?: string
  taxType?: 'taxable' | 'exempt' | 'zero' | '면세' | '영세율'
  /** POS 청구 줄 — 동일 유형 재담기 시 장바구니에서 교체용(저장 시 전달 안 함) */
  poBillingKind?: 'royalty' | 'delivery_gp' | 'grab_gp' | 'all'
}

export interface AdminPurchaseOrderProps {
  /** 회계용: 품목 마스터 없이 라인 추가 (로얄티·GP 등) */
  allowManualLines?: boolean
}

export function AdminPurchaseOrder({ allowManualLines = false }: AdminPurchaseOrderProps) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { transferToPo, setTransferToPo } = useOrderCreate() || {}
  const pendingTransferCart = React.useRef<CartItem[] | null>(null)
  const appliedTransferRef = React.useRef(false)
  const prevVendorRef = React.useRef<VendorForPurchase | null>(null)
  const prevLocationCodeRef = React.useRef<string | null>(null)
  const [cartGroupByStore, setCartGroupByStore] = React.useState(false)

  const [locations, setLocations] = React.useState<PurchaseLocation[]>([])
  const [locationSelect, setLocationSelect] = React.useState<PurchaseLocation | null>(null)
  const [vendors, setVendors] = React.useState<VendorForPurchase[]>([])
  const [vendorSelect, setVendorSelect] = React.useState<VendorForPurchase | null>(null)
  const [items, setItems] = React.useState<ItemByVendor[]>([])
  const [stock, setStock] = React.useState<Record<string, number>>({})
  const [loading, setLoading] = React.useState(false)
  const [quantityInput, setQuantityInput] = React.useState("1")
  const [selectedItem, setSelectedItem] = React.useState<ItemByVendor | null>(null)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [submitting, setSubmitting] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [vendorSearchQuery, setVendorSearchQuery] = React.useState("")
  const [vendorDropdownOpen, setVendorDropdownOpen] = React.useState(false)
  const vendorInputRef = React.useRef<HTMLInputElement>(null)
  const vendorContainerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vendorContainerRef.current && !vendorContainerRef.current.contains(e.target as Node)) {
        setVendorDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const categories = React.useMemo(() => {
    const cats = new Map<string, ItemByVendor[]>()
    for (const item of items) {
      const cat = item.category || t("all")
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat)!.push(item)
    }
    return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items, t])

  const { subtotal, vat, total } = React.useMemo(() => {
    let sub = 0
    let taxableSub = 0
    for (const c of cart) {
      const amt = c.price * c.qty
      sub += amt
      const isExempt = c.taxType === 'exempt' || c.taxType === 'zero' || c.taxType === '면세' || c.taxType === '영세율'
      if (!isExempt) taxableSub += amt
    }
    const vatRaw = taxableSub * 0.07
    const v = Math.round(vatRaw * 100) / 100
    const total = Math.round((sub + v) * 100) / 100
    return { subtotal: sub, vat: v, total }
  }, [cart])
  /** 본사(회계) 발주일 — 방콕 달력 YYYY-MM-DD */
  const [poOrderDate, setPoOrderDate] = React.useState(todayStrBangkok)
  const [poReferenceNo, setPoReferenceNo] = React.useState("")
  const [poQuotation, setPoQuotation] = React.useState<{ url: string; name: string } | null>(null)
  const [poQuotationUploading, setPoQuotationUploading] = React.useState(false)
  const quotationFileInputRef = React.useRef<HTMLInputElement>(null)
  const [withholdingTaxAmount, setWithholdingTaxAmount] = React.useState("")
  const [manualLineName, setManualLineName] = React.useState("")
  const [manualLinePrice, setManualLinePrice] = React.useState("")
  const [manualLineQty, setManualLineQty] = React.useState("1")
  /** 회계 PO: 선택 매장 (미선택 가능) */
  const [relatedStore, setRelatedStore] = React.useState<string>("_none")
  const [billingStart, setBillingStart] = React.useState("")
  const [billingEnd, setBillingEnd] = React.useState("")
  const [billingLoad, setBillingLoad] = React.useState(false)
  const [billingSnap, setBillingSnap] = React.useState<{
    totalSales: number
    deliverySales: number
    grabSales: number
  } | null>(null)
  /** POS 청구로 담은 뒤 저장 시 월별 초안 갱신 키로 사용 */
  const [billingIntentMode, setBillingIntentMode] = React.useState<
    'royalty' | 'delivery_gp' | 'grab_gp' | 'all' | null
  >(null)
  const { stores: storeList } = useStoreList()

  const filteredVendors = React.useMemo(() => {
    let list = vendors
    if (allowManualLines && relatedStore !== "_none") {
      const hit = vendorForSalesOutletStore(vendors, relatedStore)
      if (hit) list = [hit, ...vendors.filter((v) => v.code !== hit.code)]
    }
    const q = vendorSearchQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (v) =>
        (v.code || "").toLowerCase().includes(q) ||
        (v.name || "").toLowerCase().includes(q)
    )
  }, [vendors, vendorSearchQuery, allowManualLines, relatedStore])

  const storeOutletVendor = React.useMemo(
    () =>
      allowManualLines && relatedStore !== "_none"
        ? vendorForSalesOutletStore(vendors, relatedStore)
        : null,
    [allowManualLines, relatedStore, vendors]
  )

  const accountingVendorRequirementMet = React.useMemo(() => {
    if (!allowManualLines) return false
    if (vendorSelect) return true
    if (vendorSearchQuery.trim()) return true
    return !!storeOutletVendor
  }, [allowManualLines, vendorSelect, vendorSearchQuery, storeOutletVendor])

  const billingMonthYm = React.useMemo(
    () => (billingStart.length >= 7 ? billingStart.slice(0, 7) : ''),
    [billingStart]
  )

  React.useEffect(() => {
    setBillingIntentMode(null)
  }, [billingMonthYm, relatedStore])

  React.useEffect(() => {
    if (!allowManualLines) return
    const { startStr, endStr } = monthBoundsFromYm(bangkokYearMonth())
    setBillingStart(startStr)
    setBillingEnd(endStr)
  }, [allowManualLines])

  /** 회계 PO: 매장 선택 시 sales_outlet 일치 거래처(법인) 자동 설정 */
  React.useEffect(() => {
    if (!allowManualLines) return
    if (relatedStore === "_none") return
    const hit = vendorForSalesOutletStore(vendors, relatedStore)
    if (!hit) return
    setVendorSelect((prev) => (prev?.code === hit.code ? prev : hit))
    setVendorSearchQuery("")
  }, [allowManualLines, relatedStore, vendors])

  const addManualLineToCart = React.useCallback(() => {
    const name = manualLineName.trim()
    if (!name) return
    const price = Number(String(manualLinePrice).replace(/,/g, "")) || 0
    const qty = Math.max(0.0001, Number(String(manualLineQty).replace(/,/g, "")) || 1)
    const code = `SVC-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    setBillingIntentMode(null)
    setCart((prev) => [...prev, { code, name, price, qty, taxType: "taxable" }])
    setManualLineName("")
    setManualLinePrice("")
    setManualLineQty("1")
  }, [manualLineName, manualLinePrice, manualLineQty])

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [loc, ven, ho] = await Promise.all([
        getPurchaseLocations(),
        getVendorsForPurchase(),
        allowManualLines
          ? getHeadOfficeInfo().catch(() => ({
              companyName: "",
              taxId: "",
              address: "",
              phone: "",
              bankInfo: "",
            }))
          : Promise.resolve({ companyName: "", taxId: "", address: "", phone: "", bankInfo: "" }),
      ])
      if (cancelled) return
      setVendors(ven || [])
      if (allowManualLines) {
        const hqAddr = String(ho?.address || "").trim()
        const hq: PurchaseLocation = { name: "본사", address: hqAddr, location_code: "본사" }
        const rest = (loc || []).filter(
          (l) =>
            String(l.location_code || "").toLowerCase() !== "본사" &&
            !String(l.name || "").toLowerCase().includes("본사")
        )
        setLocations([hq, ...rest])
        setLocationSelect(hq)
      } else {
        setLocations(loc || [])
        setLocationSelect((prev) => (prev == null && (loc || []).length > 0 ? loc![0]! : prev))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [allowManualLines])

  React.useEffect(() => {
    if (!transferToPo || transferToPo.cart.length === 0) return
    const matched = vendors.find(
      (v) =>
        v.code === transferToPo!.vendorCode ||
        v.name === transferToPo!.vendorName ||
        v.code.toLowerCase() === transferToPo!.vendorCode.toLowerCase() ||
        v.name.toLowerCase() === transferToPo!.vendorName.toLowerCase()
    )
    const vendorToUse = matched ?? {
      code: transferToPo.vendorCode,
      name: transferToPo.vendorName,
      address: "",
    }
    pendingTransferCart.current = transferToPo.cart as CartItem[]
    setCartGroupByStore(!!transferToPo.groupByStore)
    setVendorSelect(vendorToUse)
    if (transferToPo.outboundLocation && locations.length > 0) {
      const locMatch = locations.find((l) => l.location_code === transferToPo!.outboundLocation)
      if (locMatch) setLocationSelect(locMatch)
    }
    setHasSearched(true)
    if (!matched) {
      setVendors((prev) =>
        prev.some((v) => v.code === vendorToUse.code || v.name === vendorToUse.name)
          ? prev
          : [...prev, vendorToUse]
      )
    }
    setTransferToPo?.(null)
  }, [transferToPo, vendors, locations, setTransferToPo, allowManualLines])

  React.useEffect(() => {
    if (!locationSelect) {
      setItems([])
      setStock({})
      setLoading(false)
      return
    }

    if (!vendorSelect) {
      setItems([])
      setStock({})
      setLoading(false)
      if (!allowManualLines) {
        setCart([])
        appliedTransferRef.current = false
        prevVendorRef.current = null
        prevLocationCodeRef.current = null
      } else {
        prevVendorRef.current = null
      }
      return
    }

    if (allowManualLines) {
      setItems([])
      setStock({})
      setLoading(false)
      setSelectedItem(null)
      const locKey = locationSelect.location_code
      const prevV = prevVendorRef.current
      const prevLoc = prevLocationCodeRef.current
      const vendorChanged = prevV?.code !== vendorSelect.code
      const locChanged = prevLoc !== locKey
      prevVendorRef.current = vendorSelect
      prevLocationCodeRef.current = locKey
      if (pendingTransferCart.current) {
        setCart(pendingTransferCart.current)
        pendingTransferCart.current = null
        appliedTransferRef.current = true
      } else if ((vendorChanged && prevV != null) || (locChanged && prevLoc != null)) {
        setCart([])
      }
      return
    }

    if (!hasSearched && !pendingTransferCart.current) return

    const vendorChanged = prevVendorRef.current?.code !== vendorSelect.code
    prevVendorRef.current = vendorSelect
    if (vendorChanged && !pendingTransferCart.current) {
      appliedTransferRef.current = false
    }
    setLoading(true)
    Promise.all([
      getItemsByVendor(
        vendorSelect.code,
        vendorSelect.name,
        locationSelect.location_code !== "본사" ? locationSelect.location_code : undefined,
        locationSelect.location_code !== "본사" ? locationSelect.name : undefined
      ),
      getHqStockByLocation(locationSelect.location_code),
    ])
      .then(([itms, st]) => {
        setItems(itms || [])
        setStock(st || {})
        if (pendingTransferCart.current) {
          setCart(pendingTransferCart.current)
          pendingTransferCart.current = null
          appliedTransferRef.current = true
        } else if (!appliedTransferRef.current) {
          setCart([])
        } else {
          appliedTransferRef.current = false
        }
        setSelectedItem(null)
      })
      .catch(() => {
        setItems([])
        setStock({})
      })
      .finally(() => setLoading(false))
  }, [vendorSelect, locationSelect?.location_code, hasSearched, allowManualLines])

  const addToCart = () => {
    if (!selectedItem) return
    const qty = parsePositiveIntQty(quantityInput)
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + qty } : x
        )
      }
      return [
        ...prev,
        {
          code: selectedItem.code,
          name: selectedItem.name,
          price: selectedItem.cost > 0 ? selectedItem.cost : selectedItem.price,
          qty,
          taxType: selectedItem.taxType ?? 'taxable',
        },
      ]
    })
    setSelectedItem(null)
    setQuantityInput("1")
  }

  const removeFromCart = (codeOrIdx: string | number) => {
    setBillingIntentMode(null)
    if (typeof codeOrIdx === "number") {
      setCart((prev) => prev.filter((_, i) => i !== codeOrIdx))
    } else {
      setCart((prev) => prev.filter((x) => x.code !== codeOrIdx))
    }
  }

  const onQuotationPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    setPoQuotationUploading(true)
    try {
      const res = await uploadPoQuotationFile({ file: f })
      if (res.success && res.publicUrl) {
        setPoQuotation({ url: res.publicUrl, name: f.name })
      } else {
        await appAlert(res.message || t("msg_upload_fail"))
      }
    } catch (err) {
      await appAlert(
        t("msg_upload_fail") + (err instanceof Error ? ": " + err.message : "")
      )
    } finally {
      setPoQuotationUploading(false)
    }
  }

  const applyBillingMonthBangkok = () => {
    const { startStr, endStr } = monthBoundsFromYm(bangkokYearMonth())
    setBillingStart(startStr)
    setBillingEnd(endStr)
  }

  const appendBillingFromPos = async (mode: "all" | "royalty" | "delivery_gp" | "grab_gp") => {
    if (relatedStore === "_none") {
      await appAlert(t("poBillingSelectStoreFirst"))
      return
    }
    if (!billingStart || !billingEnd) return
    setBillingLoad(true)
    try {
      const res = await getPoBillingDraft({
        store: relatedStore,
        startStr: billingStart,
        endStr: billingEnd,
        mode,
        labelRoyalty: t("poLineLabelRoyalty"),
        labelDelivery: t("poLineLabelDelGp"),
        labelGrab: t("poLineLabelGrab"),
      })
      if (res.snapshot) setBillingSnap(res.snapshot)
      if (!res.success || !res.lines?.length) {
        await appAlert(res.message || t("poBillingDraftEmpty"))
        return
      }
      const tag: CartItem["poBillingKind"] = mode
      setBillingIntentMode(mode)
      setCart((prev) => {
        const filtered = prev.filter((c) => c.poBillingKind !== tag)
        const added = res.lines!.map((ln) => ({
          code: ln.code,
          name: ln.name,
          price: ln.price,
          qty: ln.qty,
          taxType: (ln.taxType as CartItem["taxType"]) || "taxable",
          poBillingKind: tag,
        }))
        return [...filtered, ...added]
      })
      if (res.truncated) await appAlert(t("poBillingTruncatedWarning"))
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setBillingLoad(false)
    }
  }

  /** 청구 비율이 0%가 아닌 매장만, 매장당 초안 PO 1건 저장 */
  const bulkSavePoBillingAllStores = async (mode: "royalty" | "delivery_gp" | "grab_gp") => {
    if (!billingStart || !billingEnd) return
    if (!vendorSelect || !locationSelect) {
      await appAlert(t("poBillingBulkNeedVendor"))
      return
    }
    if (!auth?.user) {
      await appAlert(t("poBillingBulkNeedAuth"))
      return
    }
    const ok = await appConfirm(t("poBillingBulkConfirm"))
    if (!ok) return
    const ym = billingMonthYm
    if (ym.length !== 7) {
      await appAlert(t("poBillingBulkNeedPeriod"))
      return
    }
    setBillingLoad(true)
    let created = 0
    let updated = 0
    let truncatedAny = false
    try {
      for (const store of storeList) {
        const res = await getPoBillingDraft({
          store,
          startStr: billingStart,
          endStr: billingEnd,
          mode,
          labelRoyalty: t("poLineLabelRoyalty"),
          labelDelivery: t("poLineLabelDelGp"),
          labelGrab: t("poLineLabelGrab"),
        })
        if (res.truncated) truncatedAny = true
        if (!res.success || !res.lines?.length) continue
        const saveRes = await savePurchaseOrder({
          vendorCode: vendorSelect.code,
          vendorName: vendorSelect.name,
          locationName: locationSelect.name,
          locationAddress: locationSelect.address,
          locationCode: locationSelect.location_code,
          cart: res.lines.map((ln) => ({
            code: ln.code,
            name: ln.name,
            price: ln.price,
            qty: ln.qty,
            taxType: ln.taxType,
          })),
          userName: auth.user,
          relatedStore: store,
          billingMonthYm: ym,
          billingKind: mode,
          orderDate: poOrderDate || undefined,
        })
        if (saveRes.success) {
          if (saveRes.updated) updated += 1
          else created += 1
        } else {
          await appAlert(
            t("purchaseOrderFail") +
              (saveRes.message ? ": " + translateApiMessage(saveRes.message, t) : "")
          )
          return
        }
      }
      if (truncatedAny) await appAlert(t("poBillingTruncatedWarning"))
      if (created + updated > 0) void invalidatePurchaseOrdersListCache()
      const total = created + updated
      if (total === 0) await appAlert(t("poBillingBulkSkipped"))
      else if (updated === 0)
        await appAlert(t("poBillingBulkDone").replace("{n}", String(created)))
      else if (created === 0)
        await appAlert(t("poBillingBulkDoneUpdated").replace("{n}", String(updated)))
      else
        await appAlert(
          t("poBillingBulkDoneSplit")
            .replace("{c}", String(created))
            .replace("{u}", String(updated))
        )
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e))
    } finally {
      setBillingLoad(false)
    }
  }

  const resolveVendorForSave = React.useCallback((): VendorForPurchase | null => {
    if (vendorSelect) return vendorSelect
    const q = vendorSearchQuery.trim()
    if (!q) return null
    const exactMatch = vendors.find(
      (v) =>
        (v.code || "").toLowerCase() === q.toLowerCase() ||
        (v.name || "").toLowerCase() === q.toLowerCase()
    )
    const partialMatch =
      exactMatch ??
      vendors.find(
        (v) =>
          (v.code || "").toLowerCase().includes(q.toLowerCase()) ||
          (v.name || "").toLowerCase().includes(q.toLowerCase())
      )
    return partialMatch ?? { code: q, name: q, address: "" }
  }, [vendorSelect, vendorSearchQuery, vendors])

  const handleSave = async () => {
    if (!locationSelect) {
      await appAlert(t("purchaseOrderSelectLocation"))
      return
    }
    const vendorFromOutlet =
      allowManualLines && relatedStore !== "_none"
        ? vendorForSalesOutletStore(vendors, relatedStore)
        : null
    const vendorToUse = resolveVendorForSave() ?? vendorFromOutlet
    if (!vendorToUse) {
      await appAlert(
        allowManualLines ? t("purchaseOrderSelectVendorOrStore") : t("purchaseOrderSelectVendor")
      )
      return
    }
    if (!auth?.user) {
      await appAlert(t("poBillingBulkNeedAuth"))
      return
    }
    if (cart.length === 0) {
      await appAlert(t("noCartItems"))
      return
    }
    setSubmitting(true)
    try {
      const passBillingUpsert =
        allowManualLines &&
        relatedStore &&
        relatedStore !== "_none" &&
        billingMonthYm.length === 7 &&
        billingIntentMode != null
      const res = await savePurchaseOrder({
        vendorCode: vendorToUse.code,
        vendorName: vendorToUse.name,
        locationName: locationSelect.name,
        locationAddress: locationSelect.address,
        locationCode: locationSelect.location_code,
        cart: cart.map((c) => ({ code: c.code, name: c.name, price: c.price, qty: c.qty, store: c.store, taxType: c.taxType })),
        userName: auth.user,
        withholdingTaxAmount: Number(withholdingTaxAmount?.replace(/,/g, "")) || 0,
        relatedStore:
          allowManualLines && relatedStore && relatedStore !== "_none" ? relatedStore : undefined,
        billingMonthYm: passBillingUpsert ? billingMonthYm : undefined,
        billingKind: passBillingUpsert ? billingIntentMode! : undefined,
        orderDate: allowManualLines && poOrderDate ? poOrderDate : undefined,
        referenceNo: poReferenceNo.trim() || undefined,
        ...(poQuotation
          ? { quotationFileUrl: poQuotation.url, quotationFileName: poQuotation.name }
          : {}),
      })
      if (res.success) {
        void invalidatePurchaseOrdersListCache()
        setVendorSelect(vendorToUse)
        setVendorSearchQuery("")
        const msg =
          res.updated === true
            ? t("purchaseOrderSuccessUpdated")
            : t("purchaseOrderSuccess")
        await appAlert(msg + (res.poNo ? ` (${res.poNo})` : ""))
        setCart([])
        setPoReferenceNo("")
        setWithholdingTaxAmount("")
        setPoQuotation(null)
        setBillingIntentMode(null)
      } else {
        await appAlert(t("purchaseOrderFail") + (res.message ? ": " + translateApiMessage(res.message, t) : ""))
      }
    } catch (e) {
      await appAlert(t("purchaseOrderFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${allowManualLines ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("purchaseOrderLocation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={locationSelect?.location_code ?? ""}
              onValueChange={(v) => {
                const loc = locations.find((l) => l.location_code === v)
                setLocationSelect(loc || null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("purchaseOrderSelectLocation")} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.location_code} value={loc.location_code}>
                    {loc.name} — {loc.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {allowManualLines ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("poRelatedStore")}</CardTitle>
              <p className="mt-1 text-xs font-normal text-muted-foreground">
                {t("poAccountingRelatedStoreFirstHint")}
              </p>
              <p className="mt-1 text-xs font-normal text-muted-foreground">
                {t("poVendorOrStoreHintAccounting")}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <label className="text-xs text-muted-foreground">{t("expenseStoreSelect")}</label>
              <Select value={relatedStore} onValueChange={setRelatedStore}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("expenseStoreSelect")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t("poRelatedStoreNone")}</SelectItem>
                  {storeList.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {relatedStore !== "_none" ? (
                storeOutletVendor ? (
                  <p className="text-xs text-foreground">
                    {t("poStoreResolvedVendor").replace("{name}", storeOutletVendor.name)}
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-500">{t("poStoreNoVendorMatch")}</p>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {allowManualLines ? t("poAccountingCounterpartyTitle") : t("purchaseOrderVendor")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={vendorContainerRef} className="relative">
              <div className="flex rounded-md border border-input bg-background">
                <Input
                  ref={vendorInputRef}
                  type="text"
                  placeholder={
                    allowManualLines
                      ? t("poAccountingVendorSearchPh")
                      : t("vendorSearchPh") || "거래처 검색 또는 직접 입력 (코드, 이름)"
                  }
                  value={vendorDropdownOpen ? vendorSearchQuery : (vendorSelect?.name ?? vendorSearchQuery)}
                  onChange={(e) => {
                    setVendorSearchQuery(e.target.value)
                    setVendorDropdownOpen(true)
                    if (!e.target.value.trim()) setVendorSelect(null)
                  }}
                  onFocus={() => setVendorDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const q = vendorSearchQuery.trim()
                      if (q) {
                        const matched = vendors.find(
                          (v) =>
                            (v.code || "").toLowerCase() === q.toLowerCase() ||
                            (v.name || "").toLowerCase() === q.toLowerCase()
                        )
                        if (matched) {
                          setVendorSelect(matched)
                          setVendorSearchQuery("")
                          setHasSearched(true)
                        } else {
                          setVendorSelect({ code: q, name: q, address: "" })
                          setVendorSearchQuery("")
                          setHasSearched(true)
                        }
                        setVendorDropdownOpen(false)
                      }
                    }
                  }}
                  className="flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                <button
                  type="button"
                  onClick={() => setVendorDropdownOpen((o) => !o)}
                  className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              {vendorDropdownOpen && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {filteredVendors.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {vendorSearchQuery.trim()
                        ? (t("vendorSearchHint") || "조회 버튼으로 직접 검색")
                        : t("purchaseOrderSelectVendor")}
                    </div>
                  ) : (
                    filteredVendors.map((v) => (
                      <button
                        key={v.code}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setVendorSelect(v)
                          setVendorSearchQuery("")
                          setVendorDropdownOpen(false)
                          setHasSearched(true)
                        }}
                      >
                        <span className="font-medium">{v.name}</span>
                        {v.code && v.code !== v.name && (
                          <span className="ml-1.5 text-xs text-muted-foreground">({v.code})</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {allowManualLines ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("poStoreVendorHint")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
        <label className="text-xs font-medium text-foreground">{t("poReferenceNoLabel")}</label>
        <Input
          className="h-9 max-w-md"
          value={poReferenceNo}
          onChange={(e) => setPoReferenceNo(e.target.value)}
          placeholder={t("poReferenceNoPlaceholder")}
          autoComplete="off"
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">{t("poReferenceNoHint")}</p>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
        <label className="text-xs font-medium text-foreground">{t("poQuotationLabel")}</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={quotationFileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*,application/pdf"
            onChange={(e) => void onQuotationPicked(e)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={poQuotationUploading}
            onClick={() => quotationFileInputRef.current?.click()}
          >
            <Paperclip className="mr-1.5 h-3.5 w-3.5" />
            {poQuotationUploading ? t("poQuotationUploading") : t("poQuotationChoose")}
          </Button>
          {poQuotation ? (
            <span className="max-w-[200px] truncate text-xs text-muted-foreground" title={poQuotation.name}>
              {poQuotation.name}
            </span>
          ) : null}
          {poQuotation ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setPoQuotation(null)}
            >
              {t("poQuotationClear")}
            </Button>
          ) : null}
          {poQuotation ? (
            <a
              href={poQuotation.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {t("poQuotationView")}
            </a>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t("poQuotationHint")}</p>
      </div>

      {allowManualLines ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">{t("poOrderDateLabel")}</label>
            <Input
              type="date"
              className="h-9 w-[11rem]"
              value={poOrderDate}
              onChange={(e) => setPoOrderDate(e.target.value)}
            />
          </div>
          <p className="max-w-xl text-xs text-muted-foreground sm:pb-0.5">{t("poOrderDateHint")}</p>
        </div>
      ) : null}

      {allowManualLines ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("poBillingBulkCreateTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("poBillingBulkStandaloneHint")}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-10 flex-1 gap-1.5 sm:min-w-[10rem]"
              disabled={billingLoad}
              onClick={() => void bulkSavePoBillingAllStores("royalty")}
            >
              {billingLoad ? t("loading") : t("poBillingBulkRoyalty")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-10 flex-1 gap-1.5 sm:min-w-[10rem]"
              disabled={billingLoad}
              onClick={() => void bulkSavePoBillingAllStores("delivery_gp")}
            >
              {billingLoad ? t("loading") : t("poBillingBulkDeliveryGp")}
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-10 flex-1 gap-1.5 sm:min-w-[10rem]"
              disabled={billingLoad}
              onClick={() => void bulkSavePoBillingAllStores("grab_gp")}
            >
              {billingLoad ? t("loading") : t("poBillingBulkGrabGp")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {allowManualLines ? (
        <Card id="po-manual-line-section">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-sm font-semibold">{t("poManualLineSection")}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("poManualLineLead")}</p>
                <p className="text-xs text-muted-foreground">{t("poManualLineHint")}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  document.getElementById("po-manual-line-name-input")?.focus()
                }}
              >
                {t("poBillingAddOrderLineBtn")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">{t("poManualLineName")}</label>
              <Input
                id="po-manual-line-name-input"
                value={manualLineName}
                onChange={(e) => setManualLineName(e.target.value)}
                placeholder={t("poManualLineName")}
                className="h-9"
              />
            </div>
            <div className="w-full space-y-1 sm:w-28">
              <label className="text-xs text-muted-foreground">{t("poManualLinePrice")}</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={manualLinePrice}
                onChange={(e) => setManualLinePrice(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-full space-y-1 sm:w-24">
              <label className="text-xs text-muted-foreground">{t("poManualLineQty")}</label>
              <Input
                type="number"
                min={0.0001}
                step={0.01}
                value={manualLineQty}
                onChange={(e) => setManualLineQty(e.target.value)}
                className="h-9"
              />
            </div>
            <Button type="button" variant="secondary" className="h-9 w-full sm:w-auto" onClick={addManualLineToCart}>
              {t("poManualLineAdd")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {allowManualLines ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("poBillingFromSales")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("poBillingFromSalesHint")}</p>
              <p className="text-xs text-muted-foreground">{t("poBillingUpsertExplain")}</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-[10rem] space-y-1">
                  <label className="text-xs text-muted-foreground">{t("poBillingMonthPicker")}</label>
                  <Input
                    type="month"
                    className="h-9"
                    value={billingStart ? billingStart.slice(0, 7) : ""}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) {
                        const { startStr, endStr } = monthBoundsFromYm(v)
                        setBillingStart(startStr)
                        setBillingEnd(endStr)
                      }
                    }}
                  />
                </div>
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">{t("poBillingPeriodStart")}</label>
                  <Input
                    type="date"
                    className="h-9"
                    value={billingStart}
                    onChange={(e) => setBillingStart(e.target.value)}
                  />
                </div>
                <div className="min-w-[10rem] flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">{t("poBillingPeriodEnd")}</label>
                  <Input
                    type="date"
                    className="h-9"
                    value={billingEnd}
                    onChange={(e) => setBillingEnd(e.target.value)}
                  />
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 w-full sm:w-auto" onClick={applyBillingMonthBangkok}>
                  {t("poBillingMonthQuick")}
                </Button>
              </div>
              <p className="text-xs font-medium text-foreground">{t("poBillingAddToCartTitle")}</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 flex-1 gap-1.5 sm:min-w-[9rem]"
                  disabled={billingLoad || relatedStore === "_none"}
                  onClick={() => void appendBillingFromPos("royalty")}
                >
                  <Calculator className="h-3.5 w-3.5 shrink-0" />
                  {billingLoad ? t("loading") : t("poBillingAddRoyalty")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 flex-1 gap-1.5 sm:min-w-[9rem]"
                  disabled={billingLoad || relatedStore === "_none"}
                  onClick={() => void appendBillingFromPos("delivery_gp")}
                >
                  <Calculator className="h-3.5 w-3.5 shrink-0" />
                  {billingLoad ? t("loading") : t("poBillingAddDeliveryGp")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-10 flex-1 gap-1.5 sm:min-w-[9rem]"
                  disabled={billingLoad || relatedStore === "_none"}
                  onClick={() => void appendBillingFromPos("grab_gp")}
                >
                  <Calculator className="h-3.5 w-3.5 shrink-0" />
                  {billingLoad ? t("loading") : t("poBillingAddGrabGp")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 flex-1 gap-1.5 sm:min-w-[9rem]"
                  disabled={billingLoad || relatedStore === "_none"}
                  onClick={() => void appendBillingFromPos("all")}
                >
                  {billingLoad ? t("loading") : t("poBillingLoadDraft")}
                </Button>
              </div>
              {billingSnap ? (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t("poBillingSnapshot")}: </span>
                  {t("poBillingTotalSales")} {Math.round(billingSnap.totalSales).toLocaleString()} ·{" "}
                  {t("poBillingDelSales")} {Math.round(billingSnap.deliverySales).toLocaleString()} ·{" "}
                  {t("poBillingGrabSales")} {Math.round(billingSnap.grabSales).toLocaleString()}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {!allowManualLines && locationSelect && (vendorSelect || vendorSearchQuery.trim()) && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              const q = vendorSearchQuery.trim()
              if (q) {
                const exactMatch = vendors.find(
                  (v) =>
                    (v.code || "").toLowerCase() === q.toLowerCase() ||
                    (v.name || "").toLowerCase() === q.toLowerCase()
                )
                const partialMatch = exactMatch ?? vendors.find(
                  (v) =>
                    (v.code || "").toLowerCase().includes(q.toLowerCase()) ||
                    (v.name || "").toLowerCase().includes(q.toLowerCase())
                )
                const matched = exactMatch ?? partialMatch
                setVendorSelect(matched ?? { code: q, name: q, address: "" })
                if (!matched) {
                  setVendors((prev) =>
                    prev.some((x) => x.code === q || x.name === q) ? prev : [...prev, { code: q, name: q, address: "" }]
                  )
                }
                setVendorSearchQuery("")
              }
              setHasSearched(true)
            }}
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <Search className="h-4 w-4" />
            {t("orderBtnSearch")}
          </Button>
        </div>
      )}

      {!allowManualLines ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("ordNew")}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {t("purchaseOrderSelectLocationFirst")} • {t("purchaseOrderSelectVendor")} • {t("orderStockHq")} 표시
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {!vendorSelect || !locationSelect ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {!vendorSelect ? t("purchaseOrderSelectVendor") : t("purchaseOrderSelectLocation")}
                </div>
              ) : !hasSearched ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {t("orderSearchHint") || "조회 버튼을 눌러 주세요."}
                </div>
              ) : loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</div>
              ) : items.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <p>{t("purchaseOrderNoItems")}</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {categories.map(([catName, catItems]) => (
                    <AccordionItem
                      key={catName}
                      value={catName}
                      className="border-b border-border/60 last:border-0"
                    >
                      <AccordionTrigger className="px-4 py-3.5 text-sm font-semibold hover:no-underline">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          {catName}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="flex flex-col gap-1.5">
                          {catItems.map((item) => {
                            const qty = stock[item.code] ?? 0
                            const price = item.cost > 0 ? item.cost : item.price
                            return (
                              <div
                                key={item.code}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedItem(item)}
                                onKeyDown={(e) => e.key === "Enter" && setSelectedItem(item)}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                                  selectedItem?.code === item.code
                                    ? "bg-primary/10 font-medium text-primary"
                                    : "text-foreground hover:bg-muted"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold">{item.name}</span>
                                    <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                    <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                      {t("orderStockHq")}:{qty}
                                    </span>
                                  </div>
                                </div>
                                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                                  {price}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>

          {vendorSelect && items.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-border bg-card">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-l-xl text-primary"
                  onClick={() =>
                    setQuantityInput(String(Math.max(1, parsePositiveIntQty(quantityInput) - 1)))
                  }
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label={t("qty")}
                  className="h-10 w-[4.5rem] min-w-[3.25rem] max-w-[7rem] rounded-none border-0 border-x border-border bg-transparent text-center text-sm font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => setQuantityInput(String(parsePositiveIntQty(quantityInput)))}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-r-xl text-primary"
                  onClick={() =>
                    setQuantityInput(String(parsePositiveIntQty(quantityInput) + 1))
                  }
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button className="h-10 flex-1 font-semibold" onClick={addToCart} disabled={!selectedItem}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                {t("addCart")}
              </Button>
            </div>
          )}
        </>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold">{t("ordCartItems")}</CardTitle>
            {allowManualLines ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("poCartLeadAccounting")}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {allowManualLines ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() =>
                  document.getElementById("po-manual-line-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {t("poBillingAddOrderLineBtn")}
              </Button>
            ) : null}
            <Badge variant="secondary" className="text-xs">
              {cart.length}
              {t("countUnit")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {cart.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("noCartItems")}</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {cartGroupByStore && (
                        <th className="px-3 py-2 text-left font-medium">{t("orderColStore")}</th>
                      )}
                      <th className="px-3 py-2 text-left font-medium">{t("item")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("price")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("qty")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("sub")}</th>
                      <th className="w-9 px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((c, idx) => (
                      <tr key={cartGroupByStore ? `${c.code}-${c.store || ""}-${idx}` : c.code} className="border-b border-border/60 last:border-0">
                        {cartGroupByStore && (
                          <td className="px-3 py-2 font-medium">{c.store || "-"}</td>
                        )}
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoneyComma(c.price)}</td>
                        <td className="px-3 py-2 text-right">{c.qty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary tabular-nums">
                          {formatMoneyComma(c.price * c.qty)}
                        </td>
                        <td className="px-1 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => removeFromCart(cartGroupByStore ? idx : c.code)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 rounded-md border border-border/70 bg-muted/20 p-2 space-y-1.5 text-xs text-muted-foreground">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
                  {t("poTaxSummaryHint") || "부가세·원천징수"}
                </div>
                <div className="flex justify-between">
                  <span>{t("subtotal")}</span>
                  <span className="tabular-nums">{formatMoneyComma(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("vat")}</span>
                  <span className="tabular-nums">{formatMoneyComma(vat)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-1.5">
                  <span className="whitespace-nowrap">{t("poWithholdingTax") || "원천징수세"}</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="0"
                    value={withholdingTaxAmount}
                    onChange={(e) => setWithholdingTaxAmount(e.target.value)}
                    className="h-8 w-28 text-right text-sm bg-background"
                  />
                </div>
                <div className="flex justify-between border-t border-border/50 pt-1.5 font-semibold text-foreground">
                  <span>{t("total")}</span>
                  <span className="tabular-nums">{formatMoneyComma(total)}</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-foreground/90">
                  <span>{t("poNetAmount") || "실지급액"}</span>
                  <span className="tabular-nums">
                    {formatMoneyComma(
                      total - (Number(String(withholdingTaxAmount).replace(/,/g, "")) || 0)
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-1"
          onClick={() => void handleSave()}
          disabled={
            cart.length === 0 ||
            submitting ||
            !locationSelect ||
            (allowManualLines ? !accountingVendorRequirementMet : !vendorSelect && !vendorSearchQuery.trim())
          }
        >
          {submitting ? t("loading") : t("purchaseOrderSave")}
        </Button>
      </div>
    </div>
  )
}
