const { supabaseInsert } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const d = body.d || body;
    await supabaseInsert('leave_requests', {
      store: String(d.store || '').trim(),
      name: String(d.name || '').trim(),
      type: String(d.type || '').trim(),
      leave_date: String(d.date || d.leave_date || '').trim().slice(0, 10),
      reason: String(d.reason || '').trim(),
      status: '대기',
    });
    return res.status(200).json({ success: true, message: '✅ 신청 완료' });
  } catch (e) {
    console.error('requestLeave:', e.message);
    return res.status(200).json({ success: false, message: '❌ 신청 실패: ' + e.message });
  }
};
