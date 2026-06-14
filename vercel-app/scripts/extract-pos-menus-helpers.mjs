import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const p = path.join(__dirname, '..', 'app', 'admin', 'pos-menus', 'page.tsx')
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/)

const startMarker = '/** 원가 분석 화면 이동 후 복귀 시 편집 중이던 메뉴·노출 매장 복원 */'
const endMarker = 'export default function PosMenusPage() {'
const start = lines.findIndex((l) => l.includes(startMarker))
const end = lines.findIndex((l) => l.includes(endMarker))
if (start < 0 || end < 0) {
  console.error('markers not found', start, end)
  process.exit(1)
}

const importNames = [
  'POS_MENUS_EDIT_RESUME_KEY',
  'menuScopeStoreCodes',
  'storeScopeCodesEqual',
  'CODE_AUTO_MAINS',
  'OPTION_SIZE_VALUES',
  'OPTION_PART_VALUES',
  'formatPosMenuBulkPickLabel',
  'formatChickenOptionStepDisplayLabel',
  'hasCustomGroupLabel',
  'applyChickenDeliveryRulesToConfig',
  'isChickenMenu',
  'isChickenDefaultOption',
  'parseOptionGroupsFromText',
  'isSizePartGroups',
  'optionStepOrderAfterSwap',
  'inferChickenOptionPartValue',
  'shouldInferChickenPartFromName',
  'optionStepValueForGroupFilter',
  'optionMatchesGroupFilter',
  'groupChickenMenuOptionsByPartValue',
  'groupChickenMenuOptionsBySizeValue',
  'normalizeOptionSelectionConfig',
  'additiveOptionLinkSuffix',
  'buildOptionCode',
  'resolveOptionCode',
  'emptyForm',
  'newPackagingChecklistRow',
]

const importBlock = [
  'import {',
  ...importNames.map((n) => `  ${n},`),
  '  type PackagingChecklistDraftRow,',
  "} from './pos-menus-page-helpers'",
].join('\n')

const out = [...lines.slice(0, start), importBlock, '', ...lines.slice(end)]
fs.writeFileSync(p, out.join('\n'))
console.log('removed lines', start, '..', end - 1, 'count', end - start)
