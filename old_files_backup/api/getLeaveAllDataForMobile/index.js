const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

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
      userRole = String(body.userRole || '').trim();
    }

    const users = [];
    const nickMap = {};
    const empList = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    for (let u = 0; u < empList.length; u++) {
      const s = String(empList[u].store || '').trim();
      const n = String(empList[u].name || '').trim();
      if (s && n) {
        nickMap[s + '|' + n] = empList[u].nick || '';
        users.push({ store: s, name: n, nick: empList[u].nick || '' });
      }
    }

    const leaveRows = await supabaseSelect('leave_requests', { order: 'leave_date.desc' }) || [];
    const r = String(userRole || '').toLowerCase();
    const isOffice = r.indexOf('director') !== -1 || r.indexOf('officer') !== -1 || r.indexOf('ceo') !== -1 || r.indexOf('hr') !== -1;
    const leaves = leaveRows
      .filter((l) => isOffice || (l.store && String(l.store).trim() === userStore))
      .map((r) => ({
        row: r.id,
        store: String(r.store || '').trim(),
        name: String(r.name || '').trim(),
        nick: nickMap[String(r.store || '') + '|' + String(r.name || '')] || '',
        type: r.type || '',
        date: toDateStr(r.leave_date),
        reason: r.reason || '',
        status: r.status || '',
      }));

    return res.status(200).json({ users, leaves });
  } catch (e) {
    console.error('getLeaveAllDataForMobile:', e.message);
    return res.status(200).json({ users: [], leaves: [] });
  }
};
