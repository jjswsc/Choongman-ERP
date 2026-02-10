const { supabaseSelect } = require('../../lib/supabase');

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
    let storeFilter = '';
    if (req.method === 'GET') {
      startStr = String(req.query.startStr || req.query.startDate || '').trim();
      endStr = String(req.query.endStr || req.query.endDate || '').trim();
      storeFilter = String(req.query.storeFilter || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startStr = String(body.startStr || body.startDate || '').trim();
      endStr = String(body.endStr || body.endDate || '').trim();
      storeFilter = String(body.storeFilter || '').trim();
    }
    if (!startStr || !endStr) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      startStr = first.toISOString().slice(0, 10);
      endStr = now.toISOString().slice(0, 10);
    }

    const allLogs = await supabaseSelect('stock_logs', { order: 'log_date.desc', limit: 500 });
    const startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    const list = [];
    for (let i = 0; i < (allLogs || []).length; i++) {
      const row = allLogs[i];
      const type = String(row.log_type || '');
      if (type !== 'Outbound' && type !== 'ForceOut' && type !== 'ForcePush') continue;
      const rowDate = new Date(row.log_date);
      if (isNaN(rowDate.getTime()) || rowDate < startDate || rowDate > endDate) continue;
      const targetStore = String(row.vendor_target || '').replace('To ', '');
      if (storeFilter && storeFilter !== 'All' && storeFilter !== '전체' && targetStore !== storeFilter) continue;
      const summary = (type === 'ForceOut' || type === 'ForcePush') ? '[강제] ' + (row.item_name || '') : (row.item_name || '');
      list.push({
        date: rowDate.toISOString().slice(0, 10),
        store: targetStore,
        type: (type === 'ForceOut' || type === 'ForcePush') ? '⚡강제출고' : '📦일반출고',
        summary,
        qty: Math.abs(Number(row.qty)),
      });
      if (list.length >= 300) break;
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getOutboundHistory:', e.message);
    return res.status(200).json([]);
  }
};
