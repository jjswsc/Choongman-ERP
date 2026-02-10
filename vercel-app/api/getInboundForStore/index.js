const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let storeName = '', startStr = '', endStr = '';
    if (req.method === 'GET') { storeName = req.query.storeName || req.query.store || ''; startStr = req.query.startStr || req.query.start || ''; endStr = req.query.endStr || req.query.end || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); storeName = b.storeName || b.store || ''; startStr = b.startStr || b.start || ''; endStr = b.endStr || b.end || ''; }
    const itemRows = await supabaseSelect('items', { order: 'id.asc' }) || [];
    const itemMap = {};
    for (let k = 0; k < itemRows.length; k++) itemMap[itemRows[k].code] = { spec: itemRows[k].spec || '-', cost: itemRows[k].cost || 0 };
    const logs = await supabaseSelectFilter('stock_logs', 'location=eq.' + encodeURIComponent(String(storeName).trim()), { order: 'log_date.desc', limit: 400 }) || [];
    const startD = new Date(startStr); startD.setHours(0, 0, 0, 0);
    const endD = new Date(endStr); endD.setHours(23, 59, 59, 999);
    const list = [];
    for (let i = 0; i < logs.length; i++) {
      const row = logs[i];
      const type = String(row.log_type || '');
      const note = String(row.vendor_target || '').trim();
      const isFromHq = (type === 'ForcePush' && note === 'HQ') || (type === 'Inbound' && note === 'From HQ');
      if (!isFromHq) continue;
      const rowDate = new Date(row.log_date);
      const rowDateStr = rowDate.toISOString().slice(0, 10);
      if (rowDate < startD || rowDate > endD) continue;
      const code = String(row.item_code || '');
      const info = itemMap[code] || { spec: '-', cost: 0 };
      list.push({ date: rowDateStr, vendor: note === 'From HQ' ? '주문승인' : '본사출고', name: row.item_name || '', spec: info.spec, qty: Number(row.qty), amount: info.cost * Number(row.qty) });
      if (list.length >= 300) break;
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getInboundForStore:', e.message);
    return res.status(200).json([]);
  }
};
