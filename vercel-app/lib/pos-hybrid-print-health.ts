export type PosHybridPrinterRow = { name: string; displayName: string; isDefault: boolean }

export type PosHybridPrintConfig = {
  silent?: boolean
  deviceName?: string | null
  receiptDeviceName?: string | null
  kitchen1DeviceName?: string | null
  kitchen2DeviceName?: string | null
  kitchen3DeviceName?: string | null
  kitchenDeviceName?: string | null
}

export type PosHybridConfiguredFieldKey =
  | 'deviceName'
  | 'receiptDeviceName'
  | 'kitchenDeviceName'
  | 'kitchen1DeviceName'
  | 'kitchen2DeviceName'
  | 'kitchen3DeviceName'

const PRINT_CONFIG_FIELDS: PosHybridConfiguredFieldKey[] = [
  'deviceName',
  'receiptDeviceName',
  'kitchenDeviceName',
  'kitchen1DeviceName',
  'kitchen2DeviceName',
  'kitchen3DeviceName',
]

type ConfiguredNameField = { key: PosHybridConfiguredFieldKey; value: string }

function getConfiguredNames(cfg: PosHybridPrintConfig | null): ConfiguredNameField[] {
  const out: ConfiguredNameField[] = []
  if (!cfg) return out
  for (const key of PRINT_CONFIG_FIELDS) {
    const value = String(cfg[key] || '').trim()
    if (!value) continue
    out.push({ key, value })
  }
  return out
}

export type PosHybridPrintHealthSummary = {
  mismatchFields: PosHybridConfiguredFieldKey[]
  hasExplicitPrintDevices: boolean
  usesOnlyWindowsDefault: boolean
  defaultPrinterLabel: string
}

export function inspectPosHybridPrintHealth(params: {
  printers: PosHybridPrinterRow[]
  config: PosHybridPrintConfig | null
}): PosHybridPrintHealthSummary {
  const printers = Array.isArray(params.printers) ? params.printers : []
  const config = params.config && typeof params.config === 'object' ? params.config : null
  const configured = getConfiguredNames(config)
  const hasExplicitPrintDevices = configured.length > 0

  const registeredPrinterNames = new Set(
    printers.map((p) => String(p.name || '').trim()).filter(Boolean)
  )
  const mismatchFields = configured
    .filter((item) => !registeredPrinterNames.has(item.value))
    .map((item) => item.key)

  const defaultPrinter = printers.find((p) => p.isDefault)
  const defaultPrinterLabel = defaultPrinter
    ? `${defaultPrinter.name}${
        defaultPrinter.displayName && defaultPrinter.displayName !== defaultPrinter.name
          ? ` (${defaultPrinter.displayName})`
          : ''
      }`
    : ''

  return {
    mismatchFields,
    hasExplicitPrintDevices,
    usesOnlyWindowsDefault: Boolean(config) && !hasExplicitPrintDevices && Boolean(defaultPrinterLabel),
    defaultPrinterLabel,
  }
}
