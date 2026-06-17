"use client"

import { ChevronLeft, MoreHorizontal, Crown } from "lucide-react"
import { StatusBar } from "@/components/phone-frame"
import { QrCode } from "@/components/qr-code"
import { TierGem } from "@/components/tier-gem"
import { member, progressPercent } from "@/lib/data"

export function CardScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col">
      <StatusBar />
      <header className="flex items-center px-4 py-2">
        <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="p-2 -ml-2">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 text-center text-base font-bold">บัตรสมาชิก</h1>
        <button type="button" aria-label="เพิ่มเติม" className="p-2 -mr-2">
          <MoreHorizontal className="h-6 w-6" />
        </button>
      </header>

      <div className="px-4 pb-6">
        <div className="overflow-hidden rounded-3xl bg-surface-dark text-surface-dark-foreground">
          {/* top: name + qr */}
          <div className="relative p-5">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/15 blur-2xl" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-[11px] font-medium tracking-[0.2em] text-surface-dark-foreground/60">
                  CHOONGMAN MEMBERSHIP
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <h2 className="text-2xl font-bold">{member.name}</h2>
                  <Crown className="h-4 w-4 text-primary" fill="currentColor" />
                </div>
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wider">
                  <TierGem tier={member.tier} className="h-3 w-3" />
                  {member.tier}
                </span>
                <p className="mt-3 font-mono text-sm tracking-wider text-surface-dark-foreground/70">
                  {member.phone} &nbsp; {member.memberNo}
                </p>
              </div>
              <QrCode className="h-24 w-24" />
            </div>
          </div>

          {/* bottom: points + next tier on light surface */}
          <div className="rounded-t-3xl bg-card p-5 text-card-foreground">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] tracking-widest text-muted-foreground">POINTS</p>
                <p className="mt-0.5 text-2xl font-bold">{member.points} P</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] tracking-widest text-muted-foreground">NEXT TIER</p>
                <div className="mt-0.5 flex items-center justify-end gap-1">
                  <span className="text-lg font-bold">{member.nextTier}</span>
                  <TierGem tier={member.nextTier} className="h-4 w-4" />
                </div>
              </div>
            </div>
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {member.currentPoints.toLocaleString()} /{" "}
                {member.nextTierPoints.toLocaleString()} P ({progressPercent}%)
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          แสดง QR code นี้ที่เคาน์เตอร์เพื่อสะสมหรือใช้คะแนน
        </p>
      </div>
    </div>
  )
}
