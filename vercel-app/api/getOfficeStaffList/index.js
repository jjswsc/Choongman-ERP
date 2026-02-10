const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let callerName = '';
    if (req.method === 'GET') callerName = String(req.query.callerName || '').trim();
    else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      callerName = String(body.callerName || '').trim();
    }
    const data = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const list = [];
    let isAdmin = false;
    const adminTitles = ['Manager', 'Director', 'CEO', 'GM', 'Head', 'Admin', '점장', '관리자', '대표', 'ผจก', 'MD', 'Owner', 'Office'];
    const cleanCaller = String(callerName || '').toLowerCase().replace(/\s+/g, '');
    for (let i = 0; i < data.length; i++) {
      const st = String(data[i].store || '').toLowerCase();
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
      const rowFullName = String(data[i].name || '').trim();
      const rowNickName = String(data[i].nick || '').trim();
      const rowDept = String(data[i].job || '').trim();
      if (!rowFullName && !rowNickName) continue;
      const nameToShow = rowNickName || rowFullName;
      const deptToShow = rowDept || 'Staff';
      list.push({ name: nameToShow, dept: deptToShow });
      const cleanFull = rowFullName.toLowerCase().replace(/\s+/g, '');
      const cleanNick = rowNickName.toLowerCase().replace(/\s+/g, '');
      if (cleanCaller.includes(cleanFull) || cleanFull.includes(cleanCaller) || (cleanNick && (cleanCaller.includes(cleanNick) || cleanNick.includes(cleanCaller)))) {
        for (let k = 0; k < adminTitles.length; k++) {
          if (rowDept.toLowerCase().indexOf(adminTitles[k].toLowerCase()) !== -1) { isAdmin = true; break; }
        }
      }
    }
    return res.status(200).json({ list, isAdmin });
  } catch (e) {
    console.error('getOfficeStaffList:', e.message);
    return res.status(200).json({ list: [], isAdmin: false });
  }
};
