import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Kiosk",
}

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-[100dvh]">{children}</div>
}
