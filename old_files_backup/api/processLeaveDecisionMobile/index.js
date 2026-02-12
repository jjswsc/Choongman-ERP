const { supabaseSelectFilter, supabaseUpdate } = require('../../lib/supabase');

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
    const row = body.row != null ? Number(body.row) : NaN;
    const decision = String(body.decision || '').trim();
    const userStore = String(body.userStore || '').trim();
    const userRole = String(body.userRole || '').toLowerCase();

    if (!row || isNaN(row)) {
      return res.status(200).json({ success: false, message: '❌ 잘못된 행' });
    }

    const rows = await supabaseSelectFilter('leave_requests', 'id=eq.' + row) || [];
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: false, message: '❌ 해당 휴가 신청을 찾을 수 없습니다.' });
    }
    const rowStore = String(rows[0].store || '').trim();
    const isOffice = userRole.indexOf('director') !== -1 || userRole.indexOf('officer') !== -1 || userRole.indexOf('ceo') !== -1 || userRole.indexOf('hr') !== -1;
    if (!isOffice && rowStore !== userStore) {
      return res.status(200).json({ success: false, message: '❌ 해당 매장만 승인할 수 있습니다.' });
    }

    await supabaseUpdate('leave_requests', row, { status: decision });
    return res.status(200).json({ success: true, message: '처리되었습니다.' });
  } catch (e) {
    console.error('processLeaveDecisionMobile:', e.message);
    return res.status(200).json({ success: false, message: '❌ 처리 실패: ' + e.message });
  }
};
