/**
 * Android Capacitor sync with explicit internal vs external POS URL profile.
 * Usage: node scripts/cap-sync-android-profile.cjs <internal|external>
 */
const { spawnSync } = require("child_process");

const PROFILES = {
  internal: {
    CAPACITOR_POS_URL: "https://choongman-erp.vercel.app/pos/login",
    DEPLOY_PUBLIC_ORIGIN: "https://choongman-erp.vercel.app",
  },
  external: {
    CAPACITOR_POS_URL: "https://app.omnifoodtech.com/pos/login",
    DEPLOY_PUBLIC_ORIGIN: "https://app.omnifoodtech.com",
  },
};

const profile = (process.argv[2] || "").trim().toLowerCase();
if (!PROFILES[profile]) {
  console.error("Usage: node scripts/cap-sync-android-profile.cjs <internal|external>");
  process.exit(1);
}

const env = { ...process.env, ...PROFILES[profile] };
const r = spawnSync("npx", ["cap", "sync", "android"], {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(typeof r.status === "number" ? r.status : 1);
