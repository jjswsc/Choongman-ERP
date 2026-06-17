import type { ReactNode } from "react"
import { Signal, Wifi, BatteryFull } from "lucide-react"

export function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-6 pt-3 pb-1 text-sm font-semibold ${
        dark ? "text-surface-dark-foreground" : "text-foreground"
      }`}
    >
      <span>15:11</span>
      <div className="flex items-center gap-1.5">
        <Signal className="h-4 w-4" />
        <Wifi className="h-4 w-4" />
        <div className="flex items-center gap-1 rounded-full bg-success px-1.5 py-0.5">
          <BatteryFull className="h-3 w-3 text-success-foreground" />
          <span className="text-[10px] leading-none text-success-foreground">100</span>
        </div>
      </div>
    </div>
  )
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background shadow-xl ring-1 ring-border/60 sm:my-4 sm:min-h-0 sm:rounded-[2.5rem] sm:overflow-hidden">
      {children}
    </div>
  )
}
