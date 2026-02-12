const { supabaseSelect, supabaseSelectFilter, supabaseInsert, supabaseUpdate } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const date = String(body.date || '').trim();
    const name = String(body.name || '').trim();
    const logs = Array.isArray(body.logs) ? body.logs : (body.jsonStr ? JSON.parse(body.jsonStr) : []);
    const staffList = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    let savedName = name, savedDept = '기타';
    const sk = name.toLowerCase().replace(/\s+/g, '');
    for (let i = 0; i < staffList.length; i++) {
      const fn = String(staffList[i].name || '').toLowerCase().replace(/\s+/g, '');
      const nn = String(staffList[i].nick || '').toLowerCase().replace(/\s+/g, '');
      if (sk.includes(fn) || fn.includes(sk) || (nn && sk.includes(nn))) {
        savedName = (staffList[i].nick && String(staffList[i].nick).trim()) ? staffList[i].nick : staffList[i].name;
        savedDept = staffList[i].job || 'Staff';
        break;
      }
    }
    for (let idx = 0; idx < logs.length; idx++) {
      const item = logs[idx];
      const pv = Number(item.progress);
      const status = pv >= 100 ? 'Finish' : (item.type === 'continue' ? 'Continue' : 'Today');
      const ex = item.id ? (await supabaseSelectFilter('work_logs', 'id=eq.' + encodeURIComponent(String(item.id)), { limit: 1 }) || []) : [];
      const patch = { dept: savedDept, name: savedName, content: item.content || '', progress: pv, status, priority: item.priority || '' };
      if (ex.length > 0) await supabaseUpdate('work_logs', String(item.id), patch);
      else await supabaseInsert('work_logs', { id: date + '_' + savedName + '_' + Date.now() + '_' + Math.floor(Math.random() * 100), log_date: date, dept: savedDept, name: savedName, content: item.content || '', progress: pv, status, priority: item.priority || '', manager_check: '대기', manager_comment: '' });
    }
    return res.status(200).json({ success: true, message: 'SUCCESS' });
  } catch (e) {
    console.error('saveWorkLogData:', e.message);
    return res.status(200).json({ success: false, message: 'FAIL' });
  }
};
