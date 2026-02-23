/**
 * 태국 e-Tax Invoice XML 생성
 * ETDA UN/CEFACT Cross Industry Invoice 2.0 형식 기반
 * @see https://schemas.teda.th/ ETDA 스키마
 */

export interface EtaxSeller {
  id: string
  globalId?: string
  name: string
  taxId: string
  address?: string
  phone?: string
  email?: string
  postalCode?: string
}

export interface EtaxBuyer {
  id: string
  globalId?: string
  name: string
  taxId?: string
  address?: string
  phone?: string
  email?: string
  postalCode?: string
}

export interface EtaxLineItem {
  lineId: string
  name: string
  quantity: number
  unitCode?: string
  unitPrice: number
  lineTotalAmount: number
}

export interface EtaxInvoiceInput {
  documentId: string
  documentType: string
  issueDate: string
  invoiceNo?: string
  seller: EtaxSeller
  buyer: EtaxBuyer
  currency: string
  lineExtensionAmount: number
  taxBasisAmount: number
  taxAmount: number
  grandTotal: number
  lineItems: EtaxLineItem[]
  vatPercent?: number
}

function escapeXml(s: string): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatDateForXml(isoDate: string): string {
  if (!isoDate) return new Date().toISOString().replace('Z', '')
  const d = isoDate.slice(0, 10)
  return `${d}T00:00:00.0`
}

/**
 * Thai e-Tax Invoice XML 생성 (Cross Industry Invoice 2.0)
 */
export function generateEtaxXml(input: EtaxInvoiceInput): string {
  const {
    documentId,
    documentType,
    issueDate,
    invoiceNo,
    seller,
    buyer,
    currency,
    lineExtensionAmount,
    taxBasisAmount,
    taxAmount,
    grandTotal,
    lineItems,
    vatPercent = 7,
  } = input

  const docDate = formatDateForXml(issueDate)
  const docId = escapeXml(documentId)
  const docType = escapeXml(documentType)
  const invNo = escapeXml(invoiceNo || documentId)

  const sellerId = escapeXml(seller.id)
  const sellerGlobalId = seller.globalId ? `<ram:GlobalID schemeID="006">${escapeXml(seller.globalId)}</ram:GlobalID>` : ''
  const sellerName = escapeXml(seller.name)
  const sellerTaxId = escapeXml(seller.taxId)
  const sellerAddr = seller.address ? escapeXml(seller.address) : ''
  const sellerPostal = seller.postalCode || ''
  const sellerPhone = seller.phone ? escapeXml(seller.phone) : ''
  const sellerEmail = seller.email ? escapeXml(seller.email) : ''

  const buyerId = escapeXml(buyer.id)
  const buyerGlobalId = buyer.globalId ? `<ram:GlobalID schemeID="006">${escapeXml(buyer.globalId)}</ram:GlobalID>` : ''
  const buyerName = escapeXml(buyer.name)
  const buyerTaxId = escapeXml(buyer.taxId || '')
  const buyerAddr = buyer.address ? escapeXml(buyer.address) : ''
  const buyerPostal = buyer.postalCode || ''
  const buyerPhone = buyer.phone ? escapeXml(buyer.phone) : ''
  const buyerEmail = buyer.email ? escapeXml(buyer.email) : ''

  const lines = lineItems.map((item) => {
    const qty = Number(item.quantity)
    const price = Number(item.unitPrice)
    const total = Number(item.lineTotalAmount)
    const unitCode = item.unitCode || 'EA'
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${escapeXml(item.lineId)}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escapeXml(item.name)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode}">${qty}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${total.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
        <ram:SpecifiedTradeSettlementProductLineItem>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${price.toFixed(2)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedTradeSettlementProductLineItem>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${docId}</ram:ID>
    <ram:Name>${docType}</ram:Name>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime format="102">${docDate}</ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${invNo}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:ID>${sellerId}</ram:ID>
        ${sellerGlobalId}
        <ram:Name>${sellerName}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VAT">${sellerTaxId}</ram:ID>
        </ram:SpecifiedTaxRegistration>
        ${sellerAddr ? `<ram:PostalTradeAddress><ram:LineOne>${sellerAddr}</ram:LineOne>${sellerPostal ? `<ram:PostcodeCode>${escapeXml(sellerPostal)}</ram:PostcodeCode>` : ''}</ram:PostalTradeAddress>` : ''}
        ${sellerPhone ? `<ram:SpecifiedCommunication><ram:CompleteNumber>${sellerPhone}</ram:CompleteNumber></ram:SpecifiedCommunication>` : ''}
        ${sellerEmail ? `<ram:URIUniversalCommunication><ram:URIID>${sellerEmail}</ram:URIID></ram:URIUniversalCommunication>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:ID>${buyerId}</ram:ID>
        ${buyerGlobalId}
        <ram:Name>${buyerName}</ram:Name>
        ${buyerTaxId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VAT">${buyerTaxId}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
        ${buyerAddr ? `<ram:PostalTradeAddress><ram:LineOne>${buyerAddr}</ram:LineOne>${buyerPostal ? `<ram:PostcodeCode>${escapeXml(buyerPostal)}</ram:PostcodeCode>` : ''}</ram:PostalTradeAddress>` : ''}
        ${buyerPhone ? `<ram:SpecifiedCommunication><ram:CompleteNumber>${buyerPhone}</ram:CompleteNumber></ram:SpecifiedCommunication>` : ''}
        ${buyerEmail ? `<ram:URIUniversalCommunication><ram:URIID>${buyerEmail}</ram:URIID></ram:URIUniversalCommunication>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime format="102">${docDate}</ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${escapeXml(currency)}</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CategoryCode>VAT</ram:CategoryCode>
        <ram:RateApplicablePercent>${vatPercent.toFixed(2)}</ram:RateApplicablePercent>
        <ram:CalculatedAmount>${taxAmount.toFixed(2)}</ram:CalculatedAmount>
        <ram:BasisAmount>${taxBasisAmount.toFixed(2)}</ram:BasisAmount>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${lineExtensionAmount.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${taxBasisAmount.toFixed(2)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${currency}">${taxAmount.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${grandTotal.toFixed(2)}</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
    ${lines}
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`
}
