const { supabaseUpsertMany } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const store = String(b.store || '').trim();
    const name = String(b.name || '').trim();
    const perm = b.perm || b.permissions || {};
    if (!store || !name) return res.status(200).json({ success: false, message: '매장과 이름을 입력해 주세요.' });
    await supabaseUpsertMany('menu_permissions', [{ store, name, permissions: JSON.stringify(typeof perm === 'object' ? perm : {}) }], 'store,name');
    return res.status(200).json({ success: true, message: '✅ 메뉴 권한이 저장되었습니다.' });
  } catch (e) { console.error('setMenuPermission:', e.message); return res.status(200).json({ success: false, message: '저장 실패: ' + e.message }); }
};
