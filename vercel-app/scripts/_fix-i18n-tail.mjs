import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'i18n.ts')
let t = fs.readFileSync(p, 'utf8')
const lines = t.split(/\r?\n/)
const block = '\n' + lines.slice(16671, 16693).join('\n')
const parts = t.split(block)
if (parts.length > 1) {
  t = parts.join('')
  fs.writeFileSync(p, t, 'utf8')
}
const after = fs.readFileSync(p, 'utf8')
const bad =
  "posSetTabMarketingCampaignContextNote: 'This screen saves only to the campaign selected above. Promo codes are auto-numbered from the campaign ID.',\n    posDeliveryPayDineIn"
console.log('removed blocks', parts.length - 1, 'bad count after', after.split(bad).length - 1)
