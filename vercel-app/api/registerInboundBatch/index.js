const { supabaseInsertMany } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const list = Array.isArray(req.body) ? req.body : (typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})).list || [];
    const rows = list.map((item) => ({
      location: '입고등록',
      item_code: item.code,
      item_name: item.name || '',
      spec: item.spec || '',
      qty: parseFloat(String(item.qty).replace(/,/g, '')) || 0,
      log_date: (item.date ? new Date(item.date) : new Date()).toISOString(),
      vendor_target: item.vendor || '',
      log_type: 'Inbound',
    }));
    if (rows.length) await supabaseInsertMany('stock_logs', rows);
    return res.status(200).json({ success: true, message: '✅ ' + list.length + '건 입고 완료!' });
  } catch (e) {
    console.error('registerInboundBatch:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
