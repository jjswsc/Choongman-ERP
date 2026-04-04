const fs = require('fs')
const path = require('path')

const root = path.resolve(process.cwd(), 'android', 'app', 'src', 'main', 'assets', 'public')

function walk(dir, out) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.gz')) {
      out.push(full)
    }
  }
  return out
}

const targets = walk(root, [])
let removed = 0
for (const file of targets) {
  try {
    fs.unlinkSync(file)
    removed++
  } catch {
    // ignore delete failures
  }
}

console.log(`strip-android-gzip-assets: removed ${removed} files`)
