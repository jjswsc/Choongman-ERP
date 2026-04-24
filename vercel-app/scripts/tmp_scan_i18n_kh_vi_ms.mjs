import fs from "node:fs"

const text = fs.readFileSync("lib/i18n.ts", "utf8")

function block(name, nxt) {
  const s = text.indexOf(`  ${name}: {`)
  const e = text.indexOf(`  ${nxt}: {`)
  if (s < 0 || e < 0) throw new Error(`missing ${name} or ${nxt}`)
  return text.slice(s, e)
}

for (const [lang, nxt] of [
  ["kh", "vi"],
  ["vi", "ms"],
  ["ms", "} as const"],
]) {
  const b = block(lang, nxt)
  const keys = [...b.matchAll(/^\s{4}((?:posTour|posDemo|posMainTour)\w*):/gm)]
  console.log(lang, "chars", b.length, "demo_tour_keys", keys.length)
}
