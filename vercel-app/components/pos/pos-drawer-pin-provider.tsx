'use client'

import * as React from 'react'
import { getPosPrinterSettings, verifyPosDrawerPin } from '@/lib/api-client'
import {
  openPosCashDrawer,
  type PosCashDrawerOpenParams,
  type PosCashDrawerOpenResult,
} from '@/lib/pos-cash-drawer'
import { drawerOpenRequiresPin } from '@/lib/pos-drawer-pin'
import { PosDrawerPinDialog } from '@/components/pos/pos-drawer-pin-dialog'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { translateApiMessage } from '@/lib/translate-api-message'

type PinResolver = (pin: string | null) => void

type RequestDrawerPinAuthOptions = {
  title?: string
  description?: string
}

type PosDrawerPinContextValue = {
  openPosCashDrawerSecure: (params: PosCashDrawerOpenParams) => Promise<PosCashDrawerOpenResult>
  refreshDrawerPinConfigured: (storeCode: string) => Promise<void>
  invalidateDrawerPinCache: (storeCode?: string) => void
  /**
   * 매장 서랍 PIN이 설정돼 있으면 입력·검증. 미설정이면 true.
   * 취소·실패 시 false.
   */
  requestDrawerPinAuth: (storeCode: string, options?: RequestDrawerPinAuthOptions) => Promise<boolean>
}

const PosDrawerPinContext = React.createContext<PosDrawerPinContextValue | null>(null)

export function PosDrawerPinProvider({ children }: { children: React.ReactNode }) {
  const t = useT(useLang().lang)
  const pinConfiguredByStoreRef = React.useRef<Map<string, boolean>>(new Map())
  const [pinDialogOpen, setPinDialogOpen] = React.useState(false)
  const [pinLoading, setPinLoading] = React.useState(false)
  const [pinError, setPinError] = React.useState<string | null>(null)
  const [pinDialogTitle, setPinDialogTitle] = React.useState<string | undefined>()
  const [pinDialogDescription, setPinDialogDescription] = React.useState<string | undefined>()
  const pinResolverRef = React.useRef<PinResolver | null>(null)
  const pendingStoreRef = React.useRef('')

  const refreshDrawerPinConfigured = React.useCallback(async (storeCode: string) => {
    const store = String(storeCode ?? '').trim()
    if (!store) return
    try {
      const s = await getPosPrinterSettings({ storeCode: store })
      pinConfiguredByStoreRef.current.set(store, Boolean(s.drawerPinConfigured))
    } catch {
      pinConfiguredByStoreRef.current.set(store, false)
    }
  }, [])

  const invalidateDrawerPinCache = React.useCallback((storeCode?: string) => {
    const store = String(storeCode ?? '').trim()
    if (!store) {
      pinConfiguredByStoreRef.current.clear()
      return
    }
    pinConfiguredByStoreRef.current.delete(store)
  }, [])

  const promptPin = React.useCallback((storeCode: string, options?: RequestDrawerPinAuthOptions) => {
    pendingStoreRef.current = storeCode
    setPinError(null)
    setPinDialogTitle(options?.title)
    setPinDialogDescription(options?.description)
    setPinDialogOpen(true)
    return new Promise<string | null>((resolve) => {
      pinResolverRef.current = resolve
    })
  }, [])

  const closePinDialog = React.useCallback((pin: string | null) => {
    setPinDialogOpen(false)
    setPinLoading(false)
    setPinError(null)
    setPinDialogTitle(undefined)
    setPinDialogDescription(undefined)
    const resolve = pinResolverRef.current
    pinResolverRef.current = null
    resolve?.(pin)
  }, [])

  const requestDrawerPinAuth = React.useCallback(
    async (storeCode: string, options?: RequestDrawerPinAuthOptions): Promise<boolean> => {
      const store = String(storeCode ?? '').trim()
      if (!store) return false
      if (!pinConfiguredByStoreRef.current.has(store)) {
        await refreshDrawerPinConfigured(store)
      }
      const configured = pinConfiguredByStoreRef.current.get(store) ?? false
      if (!configured) return true
      const pin = await promptPin(store, options)
      return Boolean(pin)
    },
    [promptPin, refreshDrawerPinConfigured]
  )

  const openPosCashDrawerSecure = React.useCallback(
    async (params: PosCashDrawerOpenParams): Promise<PosCashDrawerOpenResult> => {
      const store = String(params.storeCode ?? '').trim()
      if (!store) return { success: false, error: 'store_required' }

      if (!pinConfiguredByStoreRef.current.has(store)) {
        await refreshDrawerPinConfigured(store)
      }
      const configured = pinConfiguredByStoreRef.current.get(store) ?? false
      if (drawerOpenRequiresPin(params.source, configured)) {
        const pin = await promptPin(store)
        if (!pin) return { success: false, error: 'pin_cancelled' }
      }

      return openPosCashDrawer(params)
    },
    [promptPin, refreshDrawerPinConfigured]
  )

  const handlePinSubmit = React.useCallback(
    async (pin: string) => {
      const store = pendingStoreRef.current
      if (!store) {
        closePinDialog(null)
        return
      }
      setPinLoading(true)
      setPinError(null)
      try {
        const verify = await verifyPosDrawerPin({ storeCode: store, pin })
        if (!verify.success) {
          setPinError(
            translateApiMessage(verify.message, t) || t('posDrawerPinWrong') || 'PIN이 올바르지 않습니다.'
          )
          setPinLoading(false)
          return
        }
        closePinDialog(pin)
      } catch {
        setPinError(t('posDrawerPinWrong') || 'PIN이 올바르지 않습니다.')
        setPinLoading(false)
      }
    },
    [closePinDialog, t]
  )

  return (
    <PosDrawerPinContext.Provider
      value={{
        openPosCashDrawerSecure,
        refreshDrawerPinConfigured,
        invalidateDrawerPinCache,
        requestDrawerPinAuth,
      }}
    >
      {children}
      <PosDrawerPinDialog
        open={pinDialogOpen}
        onOpenChange={(open) => {
          if (!open) closePinDialog(null)
        }}
        onSubmit={handlePinSubmit}
        loading={pinLoading}
        errorMessage={pinError}
        title={pinDialogTitle}
        description={pinDialogDescription}
      />
    </PosDrawerPinContext.Provider>
  )
}

export function usePosCashDrawerOpen(): PosDrawerPinContextValue {
  const ctx = React.useContext(PosDrawerPinContext)
  if (!ctx) {
    return {
      openPosCashDrawerSecure: openPosCashDrawer,
      refreshDrawerPinConfigured: async () => {},
      invalidateDrawerPinCache: () => {},
      requestDrawerPinAuth: async () => true,
    }
  }
  return ctx
}
