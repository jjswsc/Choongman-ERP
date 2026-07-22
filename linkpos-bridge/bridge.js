#!/usr/bin/env node
/**
 * Standalone CLI — prefers shared Windows POS bridge module when available.
 */
const path = require('path')
const fs = require('fs')

const embedded = path.join(__dirname, '..', 'vercel-app', 'windows-pos', 'linkpos-bridge-server.js')
const { startLinkposBridge } = require(fs.existsSync(embedded) ? embedded : './bridge-fallback.js')

startLinkposBridge({
  verbose: process.argv.includes('--verbose'),
  configPath: path.join(__dirname, 'config.json'),
}).then((r) => {
  if (!r.ok) {
    console.error('[BRIDGE] start failed:', r.error)
    process.exit(1)
  }
})
