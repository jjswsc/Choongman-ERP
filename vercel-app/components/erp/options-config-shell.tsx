"use client"

import * as React from "react"

type OptionsConfigShellProps = {
  menuListPanel: React.ReactNode
  optionGroupPanel: React.ReactNode
  editorPanel: React.ReactNode
}

export function OptionsConfigShell({ menuListPanel, optionGroupPanel, editorPanel }: OptionsConfigShellProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[280px_260px_1fr]">
      <div className="xl:sticky xl:top-0 xl:self-start">{menuListPanel}</div>
      <div className="xl:sticky xl:top-0 xl:self-start">{optionGroupPanel}</div>
      <div>{editorPanel}</div>
    </div>
  )
}
