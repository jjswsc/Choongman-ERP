"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { getRuntimeDialogLabels } from "@/lib/runtime-ui-strings"
import { registerAppMessage, unregisterAppMessage } from "@/lib/app-message"

type QueueItem =
  | { kind: "alert"; message: string; resolve: () => void }
  | {
      kind: "confirm"
      message: string
      resolve: (ok: boolean) => void
      options?: import("@/lib/app-message").AppConfirmOptions
    }
  | {
      kind: "prompt"
      message: string
      defaultValue: string
      resolve: (value: string | null) => void
    }

export function AppMessageProvider({ children }: { children: React.ReactNode }) {
  const { lang } = useLang()
  const labels = React.useMemo(() => getRuntimeDialogLabels(lang), [lang])
  const queueRef = React.useRef<QueueItem[]>([])
  const showingRef = React.useRef(false)
  const [open, setOpen] = React.useState(false)
  const [current, setCurrent] = React.useState<QueueItem | null>(null)
  const [promptDraft, setPromptDraft] = React.useState("")

  const showNext = React.useCallback(() => {
    if (showingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    showingRef.current = true
    setCurrent(next)
    if (next.kind === "prompt") setPromptDraft(next.defaultValue)
    setOpen(true)
  }, [])

  const enqueue = React.useCallback(
    (item: QueueItem) => {
      queueRef.current.push(item)
      showNext()
    },
    [showNext]
  )

  React.useEffect(() => {
    const h: import("@/lib/app-message").AppMessageEnqueue = {
      alert: (message) =>
        new Promise<void>((resolve) => {
          enqueue({ kind: "alert", message, resolve })
        }),
      confirm: (message, options) =>
        new Promise<boolean>((resolve) => {
          enqueue({ kind: "confirm", message, resolve, options })
        }),
      prompt: (message, defaultValue = "") =>
        new Promise<string | null>((resolve) => {
          enqueue({ kind: "prompt", message, defaultValue, resolve })
        }),
    }
    registerAppMessage(h)
    return () => unregisterAppMessage(h)
  }, [enqueue])

  const finishCurrent = React.useCallback(() => {
    showingRef.current = false
    setOpen(false)
    setCurrent(null)
    queueMicrotask(() => showNext())
  }, [showNext])

  const onAlertOk = () => {
    if (current?.kind !== "alert") return
    const r = current.resolve
    finishCurrent()
    r()
  }

  const onConfirm = (ok: boolean) => {
    if (current?.kind !== "confirm") return
    const r = current.resolve
    finishCurrent()
    r(ok)
  }

  const onPromptOk = () => {
    if (current?.kind !== "prompt") return
    const r = current.resolve
    const v = promptDraft
    finishCurrent()
    r(v)
  }

  const onPromptCancel = () => {
    if (current?.kind !== "prompt") return
    const r = current.resolve
    finishCurrent()
    r(null)
  }

  const title =
    current?.kind === "confirm"
      ? current.options?.title || labels.confirmTitle
      : labels.alertTitle

  return (
    <>
      {children}
      <Dialog
        open={open && !!current}
        onOpenChange={(v) => {
          if (!v && current) {
            if (current.kind === "alert") onAlertOk()
            else if (current.kind === "confirm") onConfirm(false)
            else onPromptCancel()
          }
        }}
      >
        <DialogContent
          className="z-[10050] max-w-lg"
          overlayClassName="z-[10050]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {current && current.kind !== "prompt" ? (
              <DialogDescription className="max-h-[min(70vh,32rem)] overflow-y-auto whitespace-pre-wrap pr-1 text-left text-sm">
                {current.message}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {current?.kind === "prompt" ? (
            <div className="grid gap-3 py-1">
              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                {current.message}
              </p>
              <Input
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    onPromptOk()
                  }
                }}
                autoFocus
              />
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            {current?.kind === "confirm" ? (
              <>
                <Button type="button" variant="outline" onClick={() => onConfirm(false)}>
                  {current.options?.cancelLabel || labels.cancel}
                </Button>
                <Button type="button" onClick={() => onConfirm(true)}>
                  {current.options?.confirmLabel || labels.ok}
                </Button>
              </>
            ) : current?.kind === "prompt" ? (
              <>
                <Button type="button" variant="outline" onClick={onPromptCancel}>
                  {labels.cancel}
                </Button>
                <Button type="button" onClick={onPromptOk}>
                  {labels.ok}
                </Button>
              </>
            ) : (
              <Button type="button" onClick={onAlertOk}>
                {labels.ok}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
