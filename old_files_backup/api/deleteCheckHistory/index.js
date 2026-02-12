const { supabaseDelete } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '').trim();
    if (!id) return res.status(200).json({ success: false, code: 'NOT_FOUND', message: 'ID 없음' });
    await supabaseDelete('check_results', id);
    return res.status(200).json({ success: true, code: 'DELETED', message: '삭제되었습니다.' });
  } catch (e) {
    if (String(e.message).indexOf('JWT') !== -1 || String(e.message).indexOf('0 rows') !== -1) {
      return res.status(200).json({ success: false, code: 'NOT_FOUND', message: 'NOT_FOUND' });
    }
    console.error('deleteCheckHistory:', e.message);
    return res.status(200).json({ success: false, code: 'NOT_FOUND', message: 'NOT_FOUND' });
  }
};
