/** กรมสรรพากร VAT Service — 공개 조회 (anonymous) */

export type RdVatCompany = {
  taxId: string
  name: string
  branchNo: string
  branchTitle: string
  address: string
  province: string
  amphur: string
  thumbol: string
  postCode: string
}

const RD_VAT_SOAP_URL = 'https://rdws.rd.go.th/serviceRD3/vatserviceRD3.asmx'
const RD_TIMEOUT_MS = 25000

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractAnyTypeValues(xml: string, fieldTag: string): string[] {
  const blockRe = new RegExp(`<${fieldTag}[^>]*>([\\s\\S]*?)</${fieldTag}>`, 'i')
  const block = xml.match(blockRe)?.[1] || ''
  if (!block.trim()) return []
  const values: string[] = []
  const anyRe = /<(?:\w+:)?anyType[^>]*>([\s\S]*?)<\/(?:\w+:)?anyType>/gi
  let m: RegExpExecArray | null
  while ((m = anyRe.exec(block)) != null) {
    values.push(decodeXmlEntities(String(m[1] || '').trim()))
  }
  if (values.length === 0) {
    const plain = decodeXmlEntities(block.replace(/<[^>]+>/g, '').trim())
    if (plain) values.push(plain)
  }
  return values
}

function joinAddressParts(parts: {
  buildingName?: string
  roomNumber?: string
  floorNumber?: string
  villageName?: string
  houseNumber?: string
  mooNumber?: string
  soiName?: string
  streetName?: string
  thumbol?: string
  amphur?: string
  province?: string
  postCode?: string
}): string {
  const chunks: string[] = []
  if (parts.buildingName) chunks.push(parts.buildingName)
  if (parts.roomNumber) chunks.push(`ห้อง ${parts.roomNumber}`)
  if (parts.floorNumber) chunks.push(`ชั้น ${parts.floorNumber}`)
  if (parts.villageName) chunks.push(parts.villageName)
  if (parts.houseNumber) chunks.push(parts.houseNumber)
  if (parts.mooNumber) chunks.push(`หมู่ ${parts.mooNumber}`)
  if (parts.soiName) chunks.push(`ซ.${parts.soiName}`)
  if (parts.streetName) chunks.push(`ถ.${parts.streetName}`)
  if (parts.thumbol) chunks.push(`ต.${parts.thumbol}`)
  if (parts.amphur) chunks.push(`อ.${parts.amphur}`)
  if (parts.province) chunks.push(`จ.${parts.province}`)
  if (parts.postCode) chunks.push(parts.postCode)
  return chunks.filter(Boolean).join(' ')
}

function buildSoapBody(params: { tin: string; name: string }): string {
  const tin = params.tin.replace(/[<>&]/g, '')
  const name = params.name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:vat="https://rdws.rd.go.th/serviceRD3/vatserviceRD3">
  <soap:Header/>
  <soap:Body>
    <vat:Service>
      <vat:username>anonymous</vat:username>
      <vat:password>anonymous</vat:password>
      <vat:TIN>${tin}</vat:TIN>
      <vat:Name>${name}</vat:Name>
      <vat:ProvinceCode>0</vat:ProvinceCode>
      <vat:BranchNumber>0</vat:BranchNumber>
      <vat:AmphurCode>0</vat:AmphurCode>
    </vat:Service>
  </soap:Body>
</soap:Envelope>`
}

export function parseRdVatSoapResponse(xml: string): RdVatCompany[] {
  const nids = extractAnyTypeValues(xml, 'vNID')
  if (nids.length === 0) {
    // 일부 응답은 vTin / NID 변형
    const alt = extractAnyTypeValues(xml, 'vTin')
    if (alt.length === 0) return []
    nids.push(...alt)
  }
  const branchNumbers = extractAnyTypeValues(xml, 'vBranchNumber')
  const branchTitles = extractAnyTypeValues(xml, 'vBranchTitle')
  const names = extractAnyTypeValues(xml, 'vName')
  const buildingNames = extractAnyTypeValues(xml, 'vBuildingName')
  const roomNumbers = extractAnyTypeValues(xml, 'vRoomNumber')
  const floorNumbers = extractAnyTypeValues(xml, 'vFloorNumber')
  const villageNames = extractAnyTypeValues(xml, 'vVillageName')
  const houseNumbers = extractAnyTypeValues(xml, 'vHouseNumber')
  const mooNumbers = extractAnyTypeValues(xml, 'vMooNumber')
  const soiNames = extractAnyTypeValues(xml, 'vSoiName')
  const streetNames = extractAnyTypeValues(xml, 'vStreetName')
  const thumbols = extractAnyTypeValues(xml, 'vThumbolName')
  const amphurs = extractAnyTypeValues(xml, 'vAmphurName')
  const provinces = extractAnyTypeValues(xml, 'vProvinceName')
  const postCodes = extractAnyTypeValues(xml, 'vPostCode')

  const count = Math.max(nids.length, names.length)
  const out: RdVatCompany[] = []
  for (let i = 0; i < count; i++) {
    const taxId = String(nids[i] || '').replace(/\D/g, '').slice(0, 13)
    const name = String(names[i] || '').trim()
    if (!taxId && !name) continue
    const title = String(branchTitles[i] || '').trim()
    const displayName = [title, name].filter(Boolean).join(' ').trim() || name || taxId
    out.push({
      taxId,
      name: displayName,
      branchNo: String(branchNumbers[i] || '').trim() || '0',
      branchTitle: title,
      address: joinAddressParts({
        buildingName: buildingNames[i],
        roomNumber: roomNumbers[i],
        floorNumber: floorNumbers[i],
        villageName: villageNames[i],
        houseNumber: houseNumbers[i],
        mooNumber: mooNumbers[i],
        soiName: soiNames[i],
        streetName: streetNames[i],
        thumbol: thumbols[i],
        amphur: amphurs[i],
        province: provinces[i],
        postCode: postCodes[i],
      }),
      province: String(provinces[i] || '').trim(),
      amphur: String(amphurs[i] || '').trim(),
      thumbol: String(thumbols[i] || '').trim(),
      postCode: String(postCodes[i] || '').trim(),
    })
  }
  return out
}

export async function searchRdVatCompanies(params: {
  tin?: string
  name?: string
}): Promise<RdVatCompany[]> {
  const tin = String(params.tin || '').replace(/\D/g, '').slice(0, 13)
  const name = String(params.name || '').trim()
  if (!tin && name.length < 2) {
    throw new Error('TIN(13자리) 또는 상호명(2자 이상)을 입력해 주세요.')
  }
  if (tin && tin.length !== 13 && !name) {
    throw new Error('세금식별번호(TIN)는 13자리여야 합니다.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RD_TIMEOUT_MS)
  try {
    const res = await fetch(RD_VAT_SOAP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        SOAPAction: 'https://rdws.rd.go.th/serviceRD3/vatserviceRD3/Service',
      },
      body: buildSoapBody({ tin: tin.length === 13 ? tin : '', name }),
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`กรมสรรพากร 응답 오류 (${res.status})`)
    }
    if (/faultstring|ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง/i.test(text)) {
      throw new Error('กรมสรรพากร 인증·서비스 오류입니다. 잠시 후 다시 시도해 주세요.')
    }
    return parseRdVatSoapResponse(text)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('กรมสรรพากร 응답이 지연됩니다. 잠시 후 다시 시도해 주세요.')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
