"use client"

import { useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Percent,
  Gift,
  Crown,
  Sparkles,
} from "lucide-react"
import { StatusBar } from "@/components/phone-frame"
import { TierGem } from "@/components/tier-gem"
import { tiers, benefits, type Tier } from "@/lib/data"

const benefitIcons: Record<string, typeof Percent> = {
  Percent,
  Cake: Gift,
  Crown,
  Sparkles,
}

export function BenefitsScreen({ onBack }: { onBack: () => void }) {
  const [activeTier, setActiveTier] = useState<Tier>("DIAMOND")

  return (
    <div className="flex flex-col">
      <StatusBar />
      <header className="flex items-center px-4 py-2">
        <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="p-2 -ml-2">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 text-center text-base font-bold">สิทธิประโยชน์ของฉัน</h1>
        <span className="w-6" />
      </header>

      <div className="flex flex-col gap-5 px-4 pb-6">
        {/* tier selector */}
        <div className="grid grid-cols-4 gap-2 rounded-3xl bg-card p-2 ring-1 ring-border">
          {tiers.map((tier) => {
            const isActive = tier.id === activeTier
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => setActiveTier(tier.id)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors ${
                  isActive ? "bg-accent ring-1 ring-primary" : ""
                }`}
              >
                <TierGem tier={tier.id} className="h-8 w-8" />
                <span
                  className={`text-[10px] font-bold tracking-wide ${
                    isActive ? "text-accent-foreground" : "text-muted-foreground"
                  }`}
                >
                  {tier.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* benefits panel */}
        <section className="rounded-3xl bg-surface-dark p-4 text-surface-dark-foreground">
          <h2 className="mb-3 text-sm font-bold">สิทธิพิเศษของคุณ</h2>
          <ul className="flex flex-col gap-2.5">
            {benefits.map((b) => {
              const Icon = benefitIcons[b.icon] ?? Percent
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-2xl bg-card px-3.5 py-3 text-left text-card-foreground"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary ring-1 ring-primary/30">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{b.title}</p>
                      <p className="text-xs text-muted-foreground">{b.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-1 rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground"
          >
            ดูสิทธิประโยชน์ทั้งหมด <ChevronRight className="h-4 w-4" />
          </button>
        </section>
      </div>
    </div>
  )
}
