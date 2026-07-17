/** 회원 등급 카드·젬·진행바 — 등급별 디자인 단일 소스 */

export type TierFamily = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'vip' | 'default'

export type TierVisual = {
  family: TierFamily
  label: string
  gradient: string
  accent: string
  chip: string
  glow: string
  border: string
  gem: string
  gemGlow: string
  progressBar: string
  progressPercent: string
  ambientTop: string
  ambientBottom: string
  titleClass: string
  statPanel: string
}

export function resolveTierFamily(codeRaw: string): TierFamily {
  const code = String(codeRaw || 'BRONZE').toUpperCase()
  if (code.includes('VIP')) return 'vip'
  if (code.includes('DIAMOND')) return 'diamond'
  if (code.includes('PLATINUM')) return 'platinum'
  if (code.includes('GOLD')) return 'gold'
  if (code.includes('SILVER')) return 'silver'
  if (code.includes('BRONZE')) return 'bronze'
  return 'default'
}

const TIER_VISUALS: Record<TierFamily, Omit<TierVisual, 'family' | 'label'>> = {
  bronze: {
    gradient: 'from-[#24160e] via-[#3d2616] to-[#6b4428]',
    accent: 'text-amber-100',
    chip: 'bg-amber-700/20 text-amber-50 border-amber-600/35',
    glow: 'shadow-[0_0_40px_rgba(180,120,60,0.2)]',
    border: 'border-amber-700/35',
    gem: 'from-[#f0c89a] via-[#cd7f32] to-[#8b5a2b]',
    gemGlow: 'shadow-[0_8px_20px_rgba(205,127,50,0.45)]',
    progressBar: 'from-[#cd7f32] via-amber-500 to-[#f5d78e]',
    progressPercent: 'text-amber-200',
    ambientTop: 'bg-amber-600/12',
    ambientBottom: 'bg-black/35',
    titleClass:
      'bg-gradient-to-br from-[#fff3e0] via-amber-100 to-amber-300 bg-clip-text text-transparent',
    statPanel: 'border-amber-900/25 bg-black/35',
  },
  silver: {
    gradient: 'from-[#161a1f] via-[#2a3139] to-[#4a5563]',
    accent: 'text-slate-100',
    chip: 'bg-slate-300/15 text-slate-100 border-slate-200/30',
    glow: 'shadow-[0_0_36px_rgba(203,213,225,0.18)]',
    border: 'border-slate-300/25',
    gem: 'from-slate-50 via-slate-300 to-slate-500',
    gemGlow: 'shadow-[0_8px_20px_rgba(148,163,184,0.4)]',
    progressBar: 'from-slate-400 via-slate-200 to-white',
    progressPercent: 'text-slate-100',
    ambientTop: 'bg-slate-300/10',
    ambientBottom: 'bg-black/30',
    titleClass:
      'bg-gradient-to-br from-white via-slate-100 to-slate-300 bg-clip-text text-transparent',
    statPanel: 'border-slate-400/20 bg-black/32',
  },
  gold: {
    gradient: 'from-[#2a1f0d] via-[#4a3612] to-[#7a5c18]',
    accent: 'text-amber-100',
    chip: 'bg-amber-400/20 text-amber-100 border-amber-300/35',
    glow: 'shadow-[0_0_40px_rgba(251,191,36,0.24)]',
    border: 'border-amber-400/30',
    gem: 'from-amber-100 via-amber-400 to-amber-700',
    gemGlow: 'shadow-[0_8px_22px_rgba(245,158,11,0.45)]',
    progressBar: 'from-amber-700 via-amber-400 to-[#f5e6b8]',
    progressPercent: 'text-amber-100',
    ambientTop: 'bg-amber-300/14',
    ambientBottom: 'bg-black/32',
    titleClass:
      'bg-gradient-to-br from-[#fff7e6] via-amber-100 to-amber-300 bg-clip-text text-transparent',
    statPanel: 'border-amber-500/20 bg-black/30',
  },
  platinum: {
    gradient: 'from-[#141c28] via-[#243447] to-[#3d5168]',
    accent: 'text-sky-100',
    chip: 'bg-sky-200/15 text-sky-50 border-sky-200/30',
    glow: 'shadow-[0_0_42px_rgba(125,211,252,0.2)]',
    border: 'border-sky-200/25',
    gem: 'from-[#f8fafc] via-[#cbd5e1] to-[#64748b]',
    gemGlow: 'shadow-[0_8px_22px_rgba(148,163,184,0.5)]',
    progressBar: 'from-slate-500 via-sky-200 to-white',
    progressPercent: 'text-sky-100',
    ambientTop: 'bg-sky-300/12',
    ambientBottom: 'bg-black/28',
    titleClass:
      'bg-gradient-to-br from-white via-sky-100 to-slate-300 bg-clip-text text-transparent',
    statPanel: 'border-sky-300/18 bg-black/30',
  },
  diamond: {
    gradient: 'from-[#1a1a2e] via-[#2d2d52] to-[#4a3f6b]',
    accent: 'text-violet-200',
    chip: 'bg-violet-400/20 text-violet-100 border-violet-300/35',
    glow: 'shadow-[0_0_44px_rgba(167,139,250,0.28)]',
    border: 'border-violet-300/30',
    gem: 'from-violet-100 via-violet-400 to-violet-700',
    gemGlow: 'shadow-[0_10px_24px_rgba(139,92,246,0.5)]',
    progressBar: 'from-violet-600 via-violet-300 to-fuchsia-200',
    progressPercent: 'text-violet-100',
    ambientTop: 'bg-violet-400/14',
    ambientBottom: 'bg-black/30',
    titleClass:
      'bg-gradient-to-br from-[#faf5ff] via-violet-100 to-violet-300 bg-clip-text text-transparent',
    statPanel: 'border-violet-400/20 bg-black/32',
  },
  vip: {
    gradient: 'from-[#1a0808] via-[#331010] to-[#5c1818]',
    accent: 'text-rose-100',
    chip: 'bg-rose-400/20 text-rose-50 border-rose-300/35',
    glow: 'shadow-[0_0_44px_rgba(244,63,94,0.22)]',
    border: 'border-rose-400/30',
    gem: 'from-rose-100 via-rose-500 to-rose-900',
    gemGlow: 'shadow-[0_10px_24px_rgba(225,29,72,0.45)]',
    progressBar: 'from-rose-700 via-rose-400 to-rose-100',
    progressPercent: 'text-rose-100',
    ambientTop: 'bg-rose-400/12',
    ambientBottom: 'bg-black/35',
    titleClass:
      'bg-gradient-to-br from-[#fff1f2] via-rose-100 to-rose-300 bg-clip-text text-transparent',
    statPanel: 'border-rose-500/22 bg-black/34',
  },
  default: {
    gradient: 'from-[#1a1208] via-[#3d2a14] to-[#6b4e24]',
    accent: 'text-amber-100',
    chip: 'bg-amber-400/15 text-amber-50 border-amber-300/30',
    glow: 'shadow-[0_0_40px_rgba(212,175,55,0.18)]',
    border: 'border-amber-400/22',
    gem: 'from-amber-100 via-amber-500 to-amber-800',
    gemGlow: 'shadow-[0_8px_20px_rgba(180,120,20,0.4)]',
    progressBar: 'from-amber-600 via-amber-400 to-[#f5e6b8]',
    progressPercent: 'text-amber-200',
    ambientTop: 'bg-amber-300/10',
    ambientBottom: 'bg-black/30',
    titleClass:
      'bg-gradient-to-br from-[#fff7e6] via-amber-100 to-amber-300 bg-clip-text text-transparent',
    statPanel: 'border-amber-500/18 bg-black/30',
  },
}

export function tierVisual(codeRaw: string): TierVisual {
  const family = resolveTierFamily(codeRaw)
  const base = TIER_VISUALS[family]
  return {
    family,
    label: String(codeRaw || 'BRONZE').toUpperCase(),
    ...base,
  }
}

/** POS 결제·카트 — 등급별 배지 (라이트/다크) */
export const POS_TIER_BADGE: Record<TierFamily, string> = {
  bronze:
    'bg-amber-700/12 text-amber-950 ring-amber-700/25 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/35',
  silver:
    'bg-slate-500/12 text-slate-900 ring-slate-400/25 dark:bg-slate-400/15 dark:text-slate-100 dark:ring-slate-300/30',
  gold: 'bg-yellow-500/18 text-yellow-950 ring-yellow-600/25 dark:bg-yellow-500/20 dark:text-yellow-100 dark:ring-yellow-400/35',
  platinum:
    'bg-sky-500/12 text-sky-950 ring-sky-400/25 dark:bg-sky-400/15 dark:text-sky-100 dark:ring-sky-300/30',
  diamond:
    'bg-violet-500/12 text-violet-950 ring-violet-400/25 dark:bg-violet-500/20 dark:text-violet-100 dark:ring-violet-300/35',
  vip: 'bg-rose-500/12 text-rose-950 ring-rose-400/25 dark:bg-rose-500/20 dark:text-rose-100 dark:ring-rose-400/35',
  default:
    'bg-amber-500/12 text-amber-950 ring-amber-400/20 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/25',
}

/** POS — 선택된 회원 카드 배경·테두리 */
export const POS_TIER_CARD: Record<TierFamily, string> = {
  bronze:
    'border-amber-700/30 bg-gradient-to-br from-amber-50/95 via-card to-amber-100/35 dark:from-amber-950/35 dark:via-card dark:to-amber-950/10 dark:border-amber-700/35',
  silver:
    'border-slate-400/30 bg-gradient-to-br from-slate-50/95 via-card to-slate-100/40 dark:from-slate-900/40 dark:via-card dark:to-slate-900/15 dark:border-slate-500/30',
  gold: 'border-yellow-500/35 bg-gradient-to-br from-yellow-50/95 via-card to-amber-100/40 dark:from-yellow-950/30 dark:via-card dark:to-amber-950/10 dark:border-yellow-600/35',
  platinum:
    'border-sky-400/30 bg-gradient-to-br from-sky-50/95 via-card to-slate-50/40 dark:from-sky-950/30 dark:via-card dark:to-slate-900/15 dark:border-sky-500/30',
  diamond:
    'border-violet-400/35 bg-gradient-to-br from-violet-50/95 via-card to-fuchsia-50/30 dark:from-violet-950/35 dark:via-card dark:to-violet-950/10 dark:border-violet-500/35',
  vip: 'border-rose-400/35 bg-gradient-to-br from-rose-50/95 via-card to-rose-100/35 dark:from-rose-950/35 dark:via-card dark:to-rose-950/10 dark:border-rose-500/35',
  default:
    'border-amber-400/25 bg-gradient-to-br from-amber-50/90 via-card to-card dark:from-amber-950/25 dark:via-card dark:to-card dark:border-amber-600/25',
}

export function posTierBadgeClass(codeRaw: string): string {
  return POS_TIER_BADGE[resolveTierFamily(codeRaw)]
}

export function posTierCardClass(codeRaw: string): string {
  return POS_TIER_CARD[resolveTierFamily(codeRaw)]
}
