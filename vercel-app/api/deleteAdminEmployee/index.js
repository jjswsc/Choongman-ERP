const { supabaseSelectFilter, supabaseDelete } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const r = Number(body.r != null ? body.r : body.row);
    const userStore = String(body.userStore || '').trim();
    const userRole = String(body.userRole || '').toLowerCase();
    if (!r) return res.status(200).json({ success: false, message: '❌ 잘못된 행' });
    const rows = await supabaseSelectFilter('employees', 'id=eq.' + r) || [];
    if (!rows.length) return res.status(200).json({ success: false, message: '❌ 해당 직원을 찾을 수 없습니다.' });
    const rowStore = String(rows[0].store || '').trim();
    const isTop = userRole.indexOf('director') !== -1 || userRole.indexOf('officer') !== -1 || userRole.indexOf('ceo') !== -1 || userRole.indexOf('hr') !== -1;
    if (!isTop && rowStore !== userStore) return res.status(200).json({ success: false, message: '❌ 해당 매장 직원만 삭제할 수 있습니다.' });
    await supabaseDelete('employees', r);
    return res.status(200).json({ success: true, message: '✅ 삭제되었습니다.' });
  } catch (e) {
    console.error('deleteAdminEmployee:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
