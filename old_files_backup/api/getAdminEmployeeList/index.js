const { supabaseSelect } = require('../../lib/supabase');

function isOfficeStore(st) {
  const x = String(st || '').trim();
  return x === '본사' || x === 'Office' || x === '오피스' || x.toLowerCase() === 'office';
}

function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let userStore = '';
    let userRole = '';
    if (req.method === 'GET') {
      userStore = String(req.query.userStore || '').trim();
      userRole = String(req.query.userRole || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      userStore = String(body.userStore || '').trim();
      userRole = String(body.userRole || '').toLowerCase();
    }

    const rows = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const role = userRole.toLowerCase();
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.store && !r.name) continue;
      const empStore = String(r.store || '').trim();
      let include = false;
      if (role.includes('director')) include = true;
      else if (role.includes('officer')) { if (!isOfficeStore(empStore)) include = true; }
      else if (role.includes('manager')) { if (!isOfficeStore(empStore)) include = true; }
      else { if (empStore === userStore) include = true; }
      if (!include) continue;
      list.push({
        row: r.id,
        store: empStore,
        name: r.name,
        nick: r.nick || '',
        phone: r.phone || '',
        job: r.job || '',
        birth: toDateStr(r.birth),
        nation: r.nation || '',
        join: toDateStr(r.join_date),
        resign: toDateStr(r.resign_date),
        salType: r.sal_type || 'Monthly',
        salAmt: r.sal_amt || 0,
        pw: r.password,
        role: r.role || 'Staff',
        email: r.email || '',
        annualLeaveDays: (r.annual_leave_days != null && r.annual_leave_days !== '') ? Number(r.annual_leave_days) : 15,
        bankName: (r.bank_name != null ? String(r.bank_name).trim() : '') || '',
        accountNumber: (r.account_number != null ? String(r.account_number).trim() : '') || '',
        positionAllowance: (r.position_allowance != null ? Number(r.position_allowance) : 0) || 0,
        grade: (r.grade != null && r.grade !== '') ? String(r.grade).trim() : '',
        photo: (r.photo != null && r.photo !== '') ? String(r.photo).trim() : '',
      });
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getAdminEmployeeList:', e.message);
    return res.status(200).json([]);
  }
};
