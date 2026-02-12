const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

async function getCommonItemData() {
  const rows = await supabaseSelect('items', { order: 'id.asc' }) || [];
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name || ''),
    spec: String(row.spec || '-'),
    cost: Number(row.cost) || 0,
  }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let startStr = '';
    let endStr = '';
    let vendorFilter = '';
    if (req.method === 'GET') {
      startStr = String(req.query.startStr || req.query.startDate || '').trim();
      endStr = String(req.query.endStr || req.query.endDate || '').trim();
      vendorFilter = String(req.query.vendorFilter || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startStr = String(body.startStr || body.startDate || '').trim();
      endStr = String(body.endStr || body.endDate || '').trim();
      vendorFilter = String(body.vendorFilter || '').trim();
    }
    if (!startStr || !endStr) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      startStr = first.toISOString().slice(0, 10);
      endStr = now.toISOString().slice(0, 10);
    }

    const itemList = await getCommonItemData();
    const itemMap = {};
    for (let k = 0; k < itemList.length; k++) {
      const it = itemList[k];
      itemMap[it.code] = { spec: it.spec || '-', cost: it.cost || 0 };
    }

    const logs = await supabaseSelectFilter('stock_logs', 'log_type=eq.Inbound', { order: 'log_date.desc', limit: 400 }) || [];
    const startD = new Date(startStr); startD.setHours(0, 0, 0, 0);
    const endD = new Date(endStr); endD.setHours(23, 59, 59, 999);
    const list = [];
    for (let i = 0; i < logs.length; i++) {
      const row = logs[i];
      if (String(row.vendor_target || '').trim() === 'From HQ') continue;
      const rowDate = new Date(row.log_date);
      const rowDateStr = rowDate.toISOString().slice(0, 10);
      if (rowDate < startD || rowDate > endD) continue;
      const rowVendor = String(row.vendor_target || '').trim();
      if (vendorFilter && vendorFilter !== 'All' && vendorFilter !== '전체 매입처' && rowVendor !== vendorFilter) continue;
      const code = String(row.item_code || '');
      const info = itemMap[code] || { spec: '-', cost: 0 };
      const qty = Number(row.qty);
      list.push({
        date: rowDateStr,
        vendor: rowVendor,
        name: row.item_name || '',
        spec: info.spec,
        qty,
        amount: info.cost * qty,
      });
      if (list.length >= 300) break;
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getInboundHistory:', e.message);
    return res.status(200).json([]);
  }
};
