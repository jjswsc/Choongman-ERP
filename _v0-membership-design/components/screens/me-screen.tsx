"use client"

import { ChevronRight, CreditCard, Gift, History, Crown } from "lucide-react"
import { StatusBar } from "@/components/phone-frame"
import { TierGem } from "@/components/tier-gem"
import { member } from "@/lib/data"

const menu = [
  { id: "card", icon: CreditCard, title: "บัตรสมาชิก", desc: "แสดง QR เพื่อสะสม/ใช้คะแนน" },
  { id: "rewards", icon: Gift, title: "แคตตาล็อกของรางวัล", desc: "แลกคะแนนเป็นรางวัล" },
  { id: "history", icon: History, title: "ประวัติการใช้งาน", desc: "คะแนน รางวัล และคูปอง" },
  { id: "benefits", icon: Crown, title: "สิทธิประโยชน์ของฉัน", desc: "ดูสิทธิพิเศษตามระดับ" },
]

export function MeScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div className="flex flex-col">
      <StatusBar />
      <header className="px-4 py-2">
        <h1 className="text-center text-base font-bold">บัญชีของฉัน</h1>
      </header>

      <div className="flex flex-col gap-5 px-4 pb-6">
        {/* profile summary */}
        <div className="flex items-center gap-3 rounded-3xl bg-surface-dark p-5 text-surface-dark-foreground">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-xl font-bold">
            {member.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-bold">{member.name}</h2>
              <Crown className="h-4 w-4 text-primary" fill="currentColor" />
            </div>
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider">
              <TierGem tier={member.tier} className="h-3 w-3" />
              {member.tier}
            </span>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-widest text-surface-dark-foreground/50">POINTS</p>
            <p className="text-xl font-bold text-primary">{member.points} P</p>
          </div>
        </div>

        {/* menu */}
        <ul className="overflow-hidden rounded-3xl bg-card ring-1 ring-border">
          {menu.map((item, i) => {
            const Icon = item.icon
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex w-full items-center gap-3 px-4 py-4 text-left ${
                    i !== 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
