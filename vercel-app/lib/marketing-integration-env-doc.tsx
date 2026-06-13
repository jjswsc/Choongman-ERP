import * as React from "react"

/** i18n env doc: `# header` · `code` · **bold** */
export function parseIntegrationEnvInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="text-xs">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part ? <React.Fragment key={i}>{part}</React.Fragment> : null
  })
}

export function IntegrationEnvDocList({ doc }: { doc: string }) {
  const lines = doc.split("\n").filter((l) => l.trim())
  return (
    <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
      {lines.map((line, i) => {
        const isHeader = line.startsWith("# ")
        const content = isHeader ? line.slice(2) : line.startsWith("• ") ? line.slice(2) : line
        return (
          <li key={i} className={isHeader ? "pt-2 font-medium text-foreground" : undefined}>
            {parseIntegrationEnvInline(content)}
          </li>
        )
      })}
    </ul>
  )
}
