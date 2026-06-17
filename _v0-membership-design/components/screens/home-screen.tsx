"use client"

import Image from "next/image"
import {
  Bell,
  ChevronRight,
  UtensilsCrossed,
  ShoppingCart,
  Gift,
  TicketPercent,
  MoreHorizontal,
  Percent,
  Cake,
  Crown,
  Drumstick,
} from "lucide-react"
import { StatusBar } from "@/components/phone-frame"
import { MembershipCard } from "@/components/membership-card"
import { TierGem } from "@/components/tier-gem"
import { member, quickActions, benefits, promos, stamp } from "@/lib/data"

const quickIcons: Record<string, typeof UtensilsCrossed> = {
  UtensilsCrossed,
  ShoppingCart,
  Gift,
  TicketPercent,
  MoreHorizontal,
}

const benefitIcons: Record<string, typeof Percent> = {
  Percent,
  Cake,
  Crown,
}

export function HomeScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  return (
    <div className="flex flex-col">
      <StatusBar />

      {/* header */}
      <header className="flex items-center justify-between px-4 pb-3 pt-1">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-xl ring-1 ring-border">
            <Image
              src="/images/logo.png"
              alt="โลโก้ Choongman Chicken"
              width={48}
              height={48}
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{member.greeting}</p>
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-bold leading-tight">{member.name}</h1>
              <Crown className="h-4 w-4 text-primary" fill="currentColor" />
            </div>
            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-wider text-accent-foreground">
              <TierGem tier={member.tier} className="h-3 w-3" />
              {member.tier}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="relative grid h-11 w-11 place-items-center rounded-full bg-card ring-1 ring-border"
          aria-label="การแจ้งเตือน"
        >
          <Bell className="h-5 w-5 text-foreground" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
        </button>
      </header>

      <div className="flex flex-col gap-5 px-4 pb-6">
        <MembershipCard onViewBenefits={() => onNavigate("benefits")} />

        {/* quick actions */}
        <div className="flex items-start justify-between rounded-3xl bg-card p-4 ring-1 ring-border">
          {quickActions.map((action) => {
            const Icon = quickIcons[action.icon]
            return (
              <button
                key={action.id}
                type="button"
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-[11px] font-medium leading-tight">{action.label}</span>
                {action.sub ? (
                  <span className="text-[9px] leading-none text-muted-foreground">
                    {action.sub}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        {/* promo */}
        {promos.map((promo) => (
          <div
            key={promo.id}
            className="relative overflow-hidden rounded-3xl bg-surface-dark text-surface-dark-foreground"
          >
            <div className="flex items-stretch">
              <div className="flex flex-1 flex-col justify-center p-5">
                <p className="text-sm font-medium text-primary">{promo.title}</p>
                <p className="mt-1 text-xs text-surface-dark-foreground/70">{promo.sub}</p>
                <p className="mt-1 text-4xl font-extrabold">{promo.price}</p>
                <button
                  type="button"
                  className="mt-3 inline-flex w-fit items-center gap-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  สั่งเลย <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="relative w-36 shrink-0">
                <Image
                  src={promo.image || "/placeholder.svg"}
                  alt={promo.title}
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div className="flex justify-center gap-1.5 pb-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === 0 ? "w-4 bg-primary" : "w-1.5 bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>
        ))}

        {/* benefits */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">สิทธิพิเศษสำหรับคุณ</h2>
            <button
              type="button"
              onClick={() => onNavigate("benefits")}
              className="flex items-center gap-0.5 text-xs font-medium text-primary"
            >
              ดูทั้งหมด <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {benefits.slice(0, 3).map((b) => {
              const Icon = benefitIcons[b.icon]
              return (
                <div
                  key={b.id}
                  className="flex flex-col items-center rounded-2xl bg-card p-3 text-center ring-1 ring-border"
                >
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-2 text-[11px] font-semibold leading-tight">{b.title}</p>
                  <p className="mt-1 text-[9px] leading-tight text-muted-foreground">{b.desc}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* stamp card */}
        <section className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
          <div className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <h3 className="text-sm font-bold">Stamp card อีกนิดเดียวครบ!</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                สะสมครบ 10 ดวง รับฟรี! {stamp.reward}
              </p>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {Array.from({ length: stamp.total }).map((_, i) => {
                  const filled = i < stamp.current
                  return (
                    <span
                      key={i}
                      className={`grid aspect-square place-items-center rounded-full ${
                        filled
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground/40"
                      }`}
                    >
                      <Drumstick className="h-4 w-4" />
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="relative h-24 w-24 shrink-0">
              <Image
                src="/images/single-chicken.png"
                alt={stamp.reward}
                fill
                className="rounded-2xl object-cover"
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-sm font-bold text-success">
              {stamp.current} / {stamp.total} ดวง
            </span>
            <button
              type="button"
              className="rounded-full bg-success px-4 py-1.5 text-xs font-semibold text-success-foreground"
            >
              ดูแสตมป์การ์ด
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
