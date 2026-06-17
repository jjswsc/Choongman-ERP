"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronLeft } from "lucide-react"
import { StatusBar } from "@/components/phone-frame"
import {
  member,
  rewards,
  rewardCategories,
  type RewardCategory,
} from "@/lib/data"

export function RewardsScreen({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<RewardCategory>("all")

  const filtered =
    category === "all" ? rewards : rewards.filter((r) => r.category === category)

  return (
    <div className="flex flex-col">
      <StatusBar />
      <header className="flex items-center gap-2 px-4 py-2">
        <button type="button" onClick={onBack} aria-label="ย้อนกลับ" className="p-2 -ml-2">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="flex-1 text-base font-bold">แคตตาล็อกของรางวัล</h1>
        <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground">
          {member.points} P
        </span>
      </header>

      {/* category tabs */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2">
        {rewardCategories.map((cat) => {
          const isActive = cat.id === category
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground ring-1 ring-primary"
                  : "bg-card text-muted-foreground ring-1 ring-border"
              }`}
            >
              {cat.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pb-4 pt-2">
        {filtered.map((reward) => (
          <button
            key={reward.id}
            type="button"
            className="flex flex-col overflow-hidden rounded-2xl bg-card text-left ring-1 ring-border"
          >
            <div className="relative aspect-square w-full bg-muted">
              {reward.image ? (
                <Image
                  src={reward.image || "/placeholder.svg"}
                  alt={reward.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-accent">
                  <span className="text-4xl font-extrabold text-primary">
                    {reward.discount}
                  </span>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold leading-tight">{reward.name}</p>
              <p className="mt-1 text-base font-bold text-primary">{reward.points} P</p>
            </div>
          </button>
        ))}
      </div>

      <div className="px-4 pb-6">
        <button
          type="button"
          className="w-full rounded-full bg-accent py-3.5 text-sm font-bold text-accent-foreground"
        >
          ดูรางวัลทั้งหมด
        </button>
      </div>
    </div>
  )
}
