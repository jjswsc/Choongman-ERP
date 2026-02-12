const { supabaseDelete } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = Number(body.row != null ? body.row : body.id);
    if (!id) return res.status(200).json({ success: false, message: '❌ 잘못된 행 번호' });
    await supabaseDelete('vendors', id);
    return res.status(200).json({ success: true, message: '🗑️ 삭제 완료' });
  } catch (e) {
    console.error('deleteVendor:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
