"use client"

import * as React from "react"

export interface TransferToPoItem {
  code: string
  name: string
  price: number
  qty: number
  store?: string
}

export interface TransferToPo {
  vendorCode: string
  vendorName: string
  cart: TransferToPoItem[]
  groupByStore?: boolean
}

interface OrderCreateContextValue {
  activeTab: string
  setActiveTab: (v: string) => void
  transferToPo: TransferToPo | null
  setTransferToPo: (v: TransferToPo | null) => void
}

const OrderCreateContext = React.createContext<OrderCreateContextValue | null>(null)

export function OrderCreateProvider({
  children,
  defaultTab = "store",
}: {
  children: React.ReactNode
  defaultTab?: string
}) {
  const [activeTab, setActiveTab] = React.useState(defaultTab)
  const [transferToPo, setTransferToPo] = React.useState<TransferToPo | null>(null)
  const value: OrderCreateContextValue = {
    activeTab,
    setActiveTab,
    transferToPo,
    setTransferToPo,
  }
  return (
    <OrderCreateContext.Provider value={value}>
      {children}
    </OrderCreateContext.Provider>
  )
}

export function useOrderCreate() {
  const ctx = React.useContext(OrderCreateContext)
  return ctx
}
