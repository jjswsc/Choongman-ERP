const { supabaseUpsertMany } = require('../../lib/supabase');

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
    const id = Number(body.id);
    const store = String(body.store || '').trim();
    const name = String(body.name || '').trim();
    const action = String(body.action || '확인').trim();

    if (isNaN(id)) {
      return res.status(200).json({ success: false, message: '잘못된 공지 ID입니다.' });
    }

    await supabaseUpsertMany('notice_reads', [{
      notice_id: id,
      store,
      name,
      read_at: new Date().toISOString(),
      status: action,
    }], 'notice_id,store,name');

    return res.status(200).json({ success: true, message: '처리되었습니다.' });
  } catch (e) {
    console.error('logNoticeRead:', e.message);
    return res.status(200).json({ success: false, message: '처리 실패: ' + e.message });
  }
};
