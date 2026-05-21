"use client"

import * as React from "react"

type OptionsConfigShellProps = {
  menuListPanel: React.ReactNode
  optionGroupPanel: React.ReactNode
  editorPanel: React.ReactNode
}

export function OptionsConfigShell({ menuListPanel, optionGroupPanel, editorPanel }: OptionsConfigShellProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_260px]">
      <div className="xl:sticky xl:top-0 xl:self-start">{menuListPanel}</div>
      <div>{editorPanel}</div>
      <div className="xl:col-span-2 2xl:col-span-1 xl:sticky xl:top-0 xl:self-start">{optionGroupPanel}</div>
    </div>
  )
}
