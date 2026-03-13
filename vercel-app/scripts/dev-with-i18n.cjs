const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")

const root = path.resolve(__dirname, "..")
const scriptsDir = path.join(root, "scripts")
const nextArgs = process.argv.slice(2)

function runNodeScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(scriptsDir, scriptName), ...args], {
      cwd: root,
      stdio: "inherit",
    })
    p.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${scriptName} failed with code ${code}`))
    })
  })
}

let syncing = false
let pending = false

async function syncI18n(strict = false) {
  if (syncing) {
    pending = true
    return
  }
  syncing = true
  try {
    await runNodeScript("fill-pos-i18n-from-en.cjs")
    await runNodeScript("check-pos-i18n.cjs", strict ? ["--strict"] : [])
  } catch (e) {
    console.error(`[i18n-sync] ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    syncing = false
    if (pending) {
      pending = false
      syncI18n(false)
    }
  }
}

function shouldSync(filename) {
  if (!filename) return false
  const f = filename.replace(/\\/g, "/")
  if (!/\.(ts|tsx)$/.test(f)) return false
  if (f.startsWith("node_modules/") || f.startsWith(".next/")) return false
  return f.startsWith("app/") || f.startsWith("components/") || f.startsWith("lib/")
}

let timer = null
function scheduleSync() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => syncI18n(false), 350)
}

async function main() {
  await runNodeScript("generate-firebase-sw.cjs")
  await syncI18n(true)

  const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
    if (shouldSync(filename)) scheduleSync()
  })

  const nextBin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next")
  const nextProc = spawn(nextBin, ["dev", ...nextArgs], {
    cwd: root,
    stdio: "inherit",
    shell: false,
  })

  const shutdown = () => {
    watcher.close()
    nextProc.kill()
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
  nextProc.on("exit", (code) => {
    watcher.close()
    process.exit(code ?? 0)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
