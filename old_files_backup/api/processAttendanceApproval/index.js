const { supabaseSelectFilter, supabaseUpdate } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const row = body.row != null ? Number(body.row) : NaN;
    const decision = String(body.decision || body.status || '').trim();
    const optOtMinutes = body.optOtMinutes != null ? body.optOtMinutes : body.optOt;
    const userStore = String(body.userStore || '').trim();
    const userRole = String(body.userRole || '').toLowerCase();

    const rows = await supabaseSelectFilter('attendance_logs', 'id=eq.' + encodeURIComponent(row), { limit: 1 }) || [];
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: false, message: '❌ 해당 기록을 찾을 수 없습니다.' });
    }
    const rowStore = String(rows[0].store_name || '').trim();
    const isManager = userRole === 'manager';
    if (isManager && userStore && rowStore !== userStore) {
      return res.status(200).json({ success: false, message: '❌ 해당 매장만 승인할 수 있습니다.' });
    }

    const patch = { approved: decision };
    if (decision === '승인완료') patch.status = '정상(승인)';
    else if (decision === '반려') patch.status = '반려';
    if (decision === '승인완료' && optOtMinutes != null && optOtMinutes !== '' && !isNaN(Number(optOtMinutes))) {
      patch.ot_min = Math.max(0, Math.min(9999, Math.round(Number(optOtMinutes))));
    }
    await supabaseUpdate('attendance_logs', row, patch);
    return res.status(200).json({ success: true, message: '✅ 처리가 완료되었습니다.' });
  } catch (e) {
    console.error('processAttendanceApproval:', e.message);
    return res.status(200).json({ success: false, message: '❌ ' + (e && e.message ? e.message : String(e)) });
  }
};
