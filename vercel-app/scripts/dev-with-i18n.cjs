const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")

const root = path.resolve(__dirname, "..")
const scriptsDir = path.join(root, "scripts")

const STRIP_FROM_NEXT = new Set(["--no-i18n-watch", "--no-i18n-startup"])

const rawArgs = process.argv.slice(2)
const noI18nWatch = rawArgs.includes("--no-i18n-watch")
const noI18nStartup = rawArgs.includes("--no-i18n-startup")
const nextArgs = rawArgs.filter((a) => !STRIP_FROM_NEXT.has(a))

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
  if (noI18nWatch || noI18nStartup) {
    const parts = []
    if (noI18nWatch) parts.push("저장 시 i18n 자동 동기화 없음")
    if (noI18nStartup) parts.push("시작 시 i18n 검사 생략")
    console.log(`[dev] 빠른 모드: ${parts.join(" · ")} (배포 전에는 npm run i18n:pos:sync 또는 npm run build 권장)`)
  }

  await runNodeScript("generate-firebase-sw.cjs")
  if (!noI18nStartup) {
    await syncI18n(true)
  }

  /** @type {fs.FSWatcher | null} */
  let watcher = null
  if (!noI18nWatch) {
    watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
      if (shouldSync(filename)) scheduleSync()
    })
  }

  const isWin = process.platform === "win32"
  const nextBin = path.join(root, "node_modules", ".bin", isWin ? "next.cmd" : "next")

  let nextProc
  if (isWin) {
    // Node v24 on Windows may throw EINVAL when spawning .cmd directly.
    // Use shell mode only on Windows for next.cmd compatibility.
    nextProc = spawn(nextBin, ["dev", ...nextArgs], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    })
  } else {
    nextProc = spawn(nextBin, ["dev", ...nextArgs], {
      cwd: root,
      stdio: "inherit",
      shell: false,
    })
  }

  const shutdown = () => {
    if (watcher) watcher.close()
    nextProc.kill()
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
  nextProc.on("exit", (code) => {
    if (watcher) watcher.close()
    process.exit(code ?? 0)
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
