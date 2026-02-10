const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let dateStr = '', name = '';
    if (req.method === 'GET') { dateStr = req.query.dateStr || req.query.date || ''; name = req.query.name || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); dateStr = b.dateStr || b.date || ''; name = b.name || ''; }
    const staffList = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    let targetName = name;
    const searchKey = String(name).toLowerCase().replace(/\s+/g, '');
    for (let k = 0; k < staffList.length; k++) {
      const fName = String(staffList[k].name || '').toLowerCase().replace(/\s+/g, '');
      const nName = String(staffList[k].nick || '').toLowerCase().replace(/\s+/g, '');
      if (searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
        targetName = (staffList[k].nick && String(staffList[k].nick).trim()) ? staffList[k].nick : staffList[k].name;
        break;
      }
    }
    const finish = [], continueItems = [], todayItems = [];
    const rows = await supabaseSelectFilter('work_logs', 'name=eq.' + encodeURIComponent(targetName), { order: 'log_date.desc' }) || [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowDateStr = r.log_date ? (typeof r.log_date === 'string' ? r.log_date.slice(0, 10) : String(r.log_date).slice(0, 10)) : '';
      if (!rowDateStr || String(r.name) !== String(targetName)) continue;
      const item = { id: r.id, content: r.content || '', progress: Number(r.progress) || 0, status: String(r.status || ''), priority: r.priority || '', managerCheck: r.manager_check || '', managerComment: r.manager_comment || '' };
      if (rowDateStr === dateStr) {
        if (item.status === 'Finish' || item.progress >= 100) finish.push(item);
        else if (item.status === 'Continue') continueItems.push(item);
        else todayItems.push(item);
      }
    }
    let existingContent = continueItems.map((x) => x.content);
    for (let j = 0; j < rows.length; j++) {
      const r2 = rows[j];
      const rowDateStr2 = r2.log_date ? (typeof r2.log_date === 'string' ? r2.log_date.slice(0, 10) : String(r2.log_date).slice(0, 10)) : '';
      if (String(r2.name) !== String(targetName) || rowDateStr2 >= dateStr || String(r2.status) !== 'Continue') continue;
      if (existingContent.indexOf(r2.content || '') !== -1) continue;
      continueItems.push({ id: r2.id, content: r2.content || '', progress: Number(r2.progress) || 0, priority: r2.priority || '', status: 'Continue', managerComment: '⚡ 이월됨 (' + rowDateStr2 + ')' });
      existingContent.push(r2.content || '');
      if (continueItems.length >= 20) break;
    }
    return res.status(200).json({ finish, continueItems, todayItems });
  } catch (e) {
    console.error('getWorkLogData:', e.message);
    return res.status(200).json({ finish: [], continueItems: [], todayItems: [] });
  }
};
