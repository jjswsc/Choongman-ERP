"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

/** 경량 Markdown — 목록·헤딩·굵게·코드 (외부 의존성 없음) */
export function AiSimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = String(text || "").split("\n")
  const nodes: React.ReactNode[] = []
  let listItems: string[] = []
  let listOrdered = false

  const flushList = () => {
    if (!listItems.length) return
    const Tag = listOrdered ? "ol" : "ul"
    nodes.push(
      <Tag
        key={`list-${nodes.length}`}
        className={cn("my-2 space-y-1 pl-5 text-sm", listOrdered ? "list-decimal" : "list-disc")}
      >
        {listItems.map((item, idx) => (
          <li key={idx} className="leading-6">
            {renderInline(item)}
          </li>
        ))}
      </Tag>
    )
    listItems = []
    listOrdered = false
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const ul = line.match(/^[-*]\s+(.+)$/)
    const ol = line.match(/^\d+\.\s+(.+)$/)
    const h3 = line.match(/^###\s+(.+)$/)
    const h2 = line.match(/^##\s+(.+)$/)
    const h1 = line.match(/^#\s+(.+)$/)

    if (ul) {
      if (listOrdered && listItems.length) flushList()
      listOrdered = false
      listItems.push(ul[1])
      continue
    }
    if (ol) {
      if (!listOrdered && listItems.length) flushList()
      listOrdered = true
      listItems.push(ol[1])
      continue
    }
    flushList()

    if (!line.trim()) {
      nodes.push(<div key={`sp-${nodes.length}`} className="h-2" />)
      continue
    }
    if (h1) {
      nodes.push(
        <h3 key={`h-${nodes.length}`} className="mt-3 text-base font-semibold">
          {renderInline(h1[1])}
        </h3>
      )
      continue
    }
    if (h2) {
      nodes.push(
        <h4 key={`h-${nodes.length}`} className="mt-2 text-sm font-semibold">
          {renderInline(h2[1])}
        </h4>
      )
      continue
    }
    if (h3) {
      nodes.push(
        <p key={`h-${nodes.length}`} className="mt-2 text-sm font-medium">
          {renderInline(h3[1])}
        </p>
      )
      continue
    }
    nodes.push(
      <p key={`p-${nodes.length}`} className="text-sm leading-6 text-foreground/90">
        {renderInline(line)}
      </p>
    )
  }
  flushList()

  return <div className={cn("space-y-0.5", className)}>{nodes}</div>
}
