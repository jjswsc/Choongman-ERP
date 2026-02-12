const { supabaseInsert, supabaseUpdate } = require('../../lib/supabase');
function toDateStr(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.trim().slice(0, 10) || null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const d = body.d || body;
    const userStore = String(body.userStore || '').trim();
    const userRole = String(body.userRole || '').toLowerCase();
    const isTop = userRole.indexOf('director') !== -1 || userRole.indexOf('officer') !== -1 || userRole.indexOf('ceo') !== -1 || userRole.indexOf('hr') !== -1;
    if (!isTop && userStore && String(d.store || '').trim() !== userStore) return res.status(200).json({ success: false, message: '❌ 해당 매장 직원만 수정할 수 있습니다.' });
    const payload = { store: String(d.store || '').trim(), name: String(d.name || '').trim(), nick: String(d.nick || '').trim(), phone: String(d.phone || '').trim(), job: String(d.job || '').trim(), birth: toDateStr(d.birth), nation: String(d.nation || '').trim(), join_date: toDateStr(d.join), resign_date: toDateStr(d.resign), sal_type: String(d.salType || 'Monthly').trim(), sal_amt: Number(d.salAmt) || 0, password: String(d.pw || '').trim(), role: String(d.role || 'Staff').trim(), email: String(d.email || '').trim(), annual_leave_days: (d.annualLeaveDays != null && d.annualLeaveDays !== '') ? Number(d.annualLeaveDays) : 15, bank_name: (d.bankName != null ? String(d.bankName).trim() : '') || '', account_number: (d.accountNumber != null ? String(d.accountNumber).trim() : '') || '', position_allowance: (d.positionAllowance != null ? Number(d.positionAllowance) : 0) || 0, grade: (d.grade != null ? String(d.grade).trim() : '') || '', photo: (d.photo != null ? String(d.photo).trim() : '') || '' };
    const rowId = Number(d.row);
    if (rowId === 0) { await supabaseInsert('employees', payload); return res.status(200).json({ success: true, message: '✅ 신규 직원이 등록되었습니다.' }); }
    await supabaseUpdate('employees', rowId, payload);
    return res.status(200).json({ success: true, message: '✅ 직원 정보가 수정되었습니다.' });
  } catch (e) { console.error('saveAdminEmployee:', e.message); return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message }); }
};
