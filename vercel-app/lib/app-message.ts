export type AppConfirmOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type AppMessageEnqueue = {
  alert: (message: string) => Promise<void>
  confirm: (message: string, options?: AppConfirmOptions) => Promise<boolean>
  prompt: (message: string, defaultValue?: string) => Promise<string | null>
}

function asAlertText(message: unknown) {
  if (message == null) return ""
  return typeof message === "string" ? message : String(message)
}

let impl: AppMessageEnqueue | null = null

/** Root layout의 AppMessageProvider가 등록합니다. */
export function registerAppMessage(h: AppMessageEnqueue) {
  impl = h
}

export function unregisterAppMessage(h: AppMessageEnqueue) {
  if (impl === h) impl = null
}

export function appAlert(message: unknown): Promise<void> {
  const text = asAlertText(message)
  if (impl) return impl.alert(text)
  if (typeof window !== "undefined") window.alert(text)
  return Promise.resolve()
}

export function appConfirm(message: unknown, options?: AppConfirmOptions): Promise<boolean> {
  const text = asAlertText(message)
  if (impl) return impl.confirm(text, options)
  if (typeof window !== "undefined") return Promise.resolve(window.confirm(text))
  return Promise.resolve(false)
}

export function appPrompt(message: unknown, defaultValue = ""): Promise<string | null> {
  const text = asAlertText(message)
  if (impl) return impl.prompt(text, defaultValue)
  if (typeof window !== "undefined") {
    const r = window.prompt(text, defaultValue)
    return Promise.resolve(r)
  }
  return Promise.resolve(null)
}
