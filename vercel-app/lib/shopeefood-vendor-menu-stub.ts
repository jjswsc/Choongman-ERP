/** ShopeeFood Get Vendor Menu — UAT·초기 연동용 스텁 (실서비스 시 DB 메뉴로 교체) */

function dayHours() {
  return [{ start_time: '00:00', end_time: '23:59' }]
}

export function shopeeFoodStubVendorMenuPayload() {
  const sales_time = {
    monday: dayHours(),
    tuesday: dayHours(),
    wednesday: dayHours(),
    thursday: dayHours(),
    friday: dayHours(),
    saturday: dayHours(),
    sunday: dayHours(),
  }
  return {
    code: 0 as const,
    msg: 'OK',
    data: {
      catalogs: [
        {
          id: 'cm-stub-catalog',
          name: 'Default',
          dishes: [
            {
              id: 'cm-stub-dish',
              name: 'POS 메뉴 연동 전 스텁',
              price: 1,
              picture: 'https://placehold.co/120x120/png?text=Menu',
              description: 'Replace with real menu from ERP/POS.',
              available: false,
              listing_status: 0,
              sales_time,
              option_groups: [] as unknown[],
            },
          ],
        },
      ],
    },
  }
}
