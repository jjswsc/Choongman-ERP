const { supabaseSelectFilter, supabaseInsert, supabaseUpdate } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const store = String(b.store || '').trim();
    const code = String(b.code || '').trim();
    const qty = Number(b.qty) || 0;
    const existing = await supabaseSelectFilter('store_settings', 'store=eq.' + encodeURIComponent(store) + '&code=eq.' + encodeURIComponent(code)) || [];
    if (existing.length > 0) { await supabaseUpdate('store_settings', existing[0].id, { safe_qty: qty }); return res.status(200).json({ success: true, message: '수정됨' }); }
    await supabaseInsert('store_settings', { store, code, safe_qty: qty });
    return res.status(200).json({ success: true, message: '저장됨' });
  } catch (e) { console.error('saveStoreSafetyStock:', e.message); return res.status(200).json({ success: false, message: '❌ 오류' }); }
};
