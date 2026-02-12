const { supabaseUpdate } = require('../../lib/supabase');

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
    const r = body.r != null ? Number(body.r) : (body.row != null ? Number(body.row) : NaN);
    const d = String((body.d != null ? body.d : body.decision) || '').trim();

    if (!r || isNaN(r)) {
      return res.status(200).json({ success: false, message: '잘못된 행' });
    }
    await supabaseUpdate('leave_requests', r, { status: d });
    return res.status(200).json({ success: true, message: '처리됨' });
  } catch (e) {
    console.error('processLeaveDecision:', e.message);
    return res.status(200).json({ success: false, message: '❌ 처리 실패: ' + e.message });
  }
};
