const { supabaseInsert, supabaseUpdate } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rowId = Number(data.row);
    const taxVal = (data.tax === '면세') ? '면세' : '과세';
    const payload = { code: String(data.code || '').trim(), category: String(data.category || '').trim(), name: String(data.name || '').trim(), spec: String(data.spec || '').trim(), price: Number(data.price) || 0, cost: Number(data.cost) || 0, tax: taxVal };
    if (rowId === 0) {
      payload.image = String(data.image || '').trim();
      payload.vendor = String(data.vendor || '').trim();
      await supabaseInsert('items', payload);
    } else await supabaseUpdate('items', rowId, payload);
    return res.status(200).json({ success: true, message: '✅ 저장 완료 (' + taxVal + ')' });
  } catch (e) {
    console.error('saveAdminItem:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
