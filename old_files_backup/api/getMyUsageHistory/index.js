const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let store = '', startStr = '', endStr = '';
    if (req.method === 'GET') { store = req.query.store || ''; startStr = req.query.startStr || ''; endStr = req.query.endStr || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); store = b.store || ''; startStr = b.startStr || ''; endStr = b.endStr || ''; }
    const itemRows = await supabaseSelect('items', { order: 'id.asc' }) || [];
    const priceByCode = {}; itemRows.forEach((it) => { priceByCode[it.code] = it.price || 0; });
    const logs = await supabaseSelectFilter('stock_logs', 'location=eq.' + encodeURIComponent(store) + '&log_type=eq.Usage', { order: 'log_date.desc', limit: 200 }) || [];
    const startD = new Date(startStr); startD.setHours(0, 0, 0, 0);
    const endD = new Date(endStr); endD.setHours(23, 59, 59, 999);
    const list = [];
    logs.forEach((row) => {
      const rowDate = new Date(row.log_date);
      if (rowDate < startD || rowDate > endD) return;
      const qty = Math.abs(Number(row.qty) || 0);
      const price = priceByCode[row.item_code] != null ? priceByCode[row.item_code] : 0;
      list.push({ date: rowDate.toISOString().slice(0, 10), dateTime: rowDate.toISOString().slice(0, 16).replace('T', ' '), item: String(row.item_name || '').trim(), qty, amount: price * qty });
    });
    return res.status(200).json(list);
  } catch (e) { console.error('getMyUsageHistory:', e.message); return res.status(200).json([]); }
};
