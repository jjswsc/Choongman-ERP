/**
 * 태국 e-Tax Invoice XML 디지털 서명
 * .p12/.pfx 인증서로 XMLDSig enveloped 서명
 * ETDA 요구사항: CA 발급 인증서 + RSA-SHA256
 */
import * as forge from 'node-forge'
import { SignedXml } from 'xml-crypto'

export interface EtaxSignOptions {
  /** Base64 인코딩된 .p12/.pfx 인증서 */
  p12Base64: string
  /** 인증서 비밀번호 */
  password: string
}

/**
 * p12에서 private key와 certificate 추출
 */
function extractFromP12(p12Base64: string, password: string): {
  privateKey: string
  certificate: string
} {
  const p12Der = forge.util.decode64(p12Base64.replace(/\s/g, ''))
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
  const certBag = certBags[forge.pki.oids.certBag]?.[0]
  if (!keyBag?.key || !certBag?.cert) {
    throw new Error('ETAX_SIGN: Invalid p12 - missing private key or certificate')
  }
  const privateKeyPem = forge.pki.privateKeyToPem(keyBag.key)
  const certPem = forge.pki.certificateToPem(certBag.cert)
  return { privateKey: privateKeyPem, certificate: certPem }
}

/**
 * XML에 디지털 서명 적용 (enveloped, RSA-SHA256)
 */
export function signEtaxXml(xmlString: string, options: EtaxSignOptions): string {
  const { p12Base64, password } = options
  if (!p12Base64?.trim() || !password) {
    throw new Error('ETAX_SIGN: p12Base64 and password are required')
  }
  const { privateKey, certificate } = extractFromP12(p12Base64.trim(), password)
  const sig = new SignedXml({
    privateKey,
    publicCert: certificate,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  })
  sig.addReference({
    xpath: "//*[local-name()='CrossIndustryInvoice']",
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
  })
  const signOpts = {
    prefix: 'ds',
    location: { reference: "//*[local-name()='CrossIndustryInvoice']", action: 'append' as const },
  }
  sig.computeSignature(xmlString, signOpts)
  return sig.getSignedXml()
}
