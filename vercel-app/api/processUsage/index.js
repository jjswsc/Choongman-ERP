const { supabaseInsertMany } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const items = Array.isArray(body.items) ? body.items : [];
    const storeName = String(body.storeName || '').trim();

    const now = new Date().toISOString();
    const rows = items.map((k) => ({
      location: storeName,
      item_code: k.code,
      item_name: k.name || '',
      spec: 'Usage',
      qty: -Number(k.qty),
      log_date: now,
      vendor_target: 'Store',
      log_type: 'Usage',
    }));

    if (rows.length) await supabaseInsertMany('stock_logs', rows);

    return res.status(200).json({ success: true, message: '✅ 출고 등록 완료' });
  } catch (e) {
    console.error('processUsage:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
