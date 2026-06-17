import { ChevronRight } from "lucide-react"
import { TierGem } from "@/components/tier-gem"
import { member, progressPercent } from "@/lib/data"

export function MembershipCard({ onViewBenefits }: { onViewBenefits?: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface-dark p-5 text-surface-dark-foreground">
      {/* subtle facet glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/15 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium tracking-[0.2em] text-surface-dark-foreground/60">
              CHOONGMAN MEMBERSHIP
            </p>
            <h2 className="mt-1 text-2xl font-bold">{member.name}</h2>
            <p className="mt-0.5 font-mono text-sm tracking-wider text-surface-dark-foreground/70">
              {member.phone}
            </p>
          </div>
          <TierGem tier={member.tier} className="h-12 w-12 drop-shadow-lg" />
        </div>

        {/* points & member no */}
        <div className="mt-5 flex items-stretch rounded-2xl bg-white/5 ring-1 ring-white/10">
          <button
            type="button"
            className="flex flex-1 items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="text-[10px] tracking-widest text-surface-dark-foreground/50">
                POINTS
              </p>
              <p className="mt-0.5 text-xl font-bold">{member.points} P</p>
            </div>
            <ChevronRight className="h-4 w-4 text-primary" />
          </button>
          <div className="my-3 w-px bg-white/10" />
          <div className="flex-1 px-4 py-3">
            <p className="text-[10px] tracking-widest text-surface-dark-foreground/50">
              MEMBER NO.
            </p>
            <p className="mt-0.5 font-mono text-lg font-semibold">{member.memberNo}</p>
          </div>
        </div>

        {/* next tier */}
        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-[11px] tracking-widest text-surface-dark-foreground/50">
            NEXT TIER : <span className="text-surface-dark-foreground/80">{member.nextTier}</span>
            <TierGem tier={member.nextTier} className="h-3.5 w-3.5" />
          </div>
          <p className="mt-1 text-sm text-surface-dark-foreground/80">
            คุณอยู่ห่างจากระดับถัดไปอีก{" "}
            <span className="font-semibold text-primary">{member.pointsToNextTier}</span> คะแนน
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-xs text-surface-dark-foreground/60">
              {member.currentPoints.toLocaleString()} / {member.nextTierPoints.toLocaleString()} P (
              {progressPercent}%)
            </span>
            <button
              type="button"
              onClick={onViewBenefits}
              className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium"
            >
              ดูสิทธิประโยชน์ <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
