#!/usr/bin/env node
/** move-only: cart-panel 2차 분해 — delivery/payment/amount card */
import fs from 'node:fs'
import path from 'node:path'

const cartPath = path.join(path.resolve(import.meta.dirname, '..'), 'components/pos/cart-panel.tsx')
let cart = fs.readFileSync(cartPath, 'utf8')

const importAnchor = "export { readPosCartItemsCache, writePosCartItemsCache } from '@/lib/pos-cart-items-cache'"
const newImports = `${importAnchor}
import { cartPanelDeliveryChannelContext, deliveryAppBrandClasses } from '@/components/pos/cart-panel-delivery-brand'
import {
  PosPaymentModalAmountCard,
  type CartPanelMenuLineDiscountMode,
} from '@/components/pos/cart-panel-payment-modal-amount-card'
import {
  buildPaymentPayloadForOrderSubmit,
  mergeCartPanelPaymentSnapshots,
  paymentTabTourTarget,
  sumCartPanelPaymentSnapshot,
  type CartPanelPaymentMethodTab,
} from '@/lib/cart-panel-payment-utils'
`

if (!cart.includes("cart-panel-delivery-brand")) {
  cart = cart.replace(importAnchor, newImports)
}

function removeBlock(startNeedle, endNeedle, label) {
  const start = cart.indexOf(startNeedle)
  const end = cart.indexOf(endNeedle, start)
  if (start < 0 || end < 0 || end <= start) {
    console.warn('skip', label, start, end)
    return
  }
  cart = cart.slice(0, start) + cart.slice(end)
  console.log('removed', label, end - start)
}

removeBlock('/** Grab 녹색', 'type TaxSearchField', 'delivery+payment utils')
removeBlock('/** POS 결제 모달 — 금액 요약', 'function resolveDineInTableNameForStorage', 'PosPaymentModalAmountCard')

cart = cart.replace(/type PaymentMethodTab = /g, 'type PaymentMethodTab = ')
cart = cart.replace(
  "type PaymentMethodTab = 'cash' | 'card' | 'qr' | 'delivery_app' | 'other'",
  'type PaymentMethodTab = CartPanelPaymentMethodTab'
)
cart = cart.replace(
  "type MenuLineDiscountMode = 'none' | 'discount' | 'service' | 'cancel'",
  'type MenuLineDiscountMode = CartPanelMenuLineDiscountMode'
)

fs.writeFileSync(cartPath, cart)
console.log('cart-panel patched')
