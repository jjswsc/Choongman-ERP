const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let store = '';
    let role = '';
    let name = '';
    if (req.method === 'GET') {
      store = String(req.query.store || '').trim();
      role = String(req.query.role || '').trim();
      name = String(req.query.name || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      store = String(body.store || '').trim();
      role = String(body.role || '').trim().toLowerCase();
      name = String(body.name || '').trim();
    }
    const myStore = store;
    const myRole = role.toLowerCase();

    const readMap = {};
    try {
      const readRows = await supabaseSelectFilter(
        'notice_reads',
        'store=eq.' + encodeURIComponent(myStore) + '&name=eq.' + encodeURIComponent(name)
      ) || [];
      for (let i = 0; i < readRows.length; i++) {
        readMap[readRows[i].notice_id] = readRows[i].status || '확인';
      }
    } catch (_) {}

    const list = [];
    const rows = await supabaseSelect('notices', { order: 'created_at.desc' }) || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const targetStores = String(row.target_store || '전체').trim();
      const targetRoles = String(row.target_role || '전체').trim();
      const storeMatch = targetStores === '전체' || targetStores.indexOf(myStore) > -1;
      const roleMatch = targetRoles === '전체' || targetRoles.toLowerCase().indexOf(myRole) > -1;
      if (!storeMatch || !roleMatch) continue;
      let att = [];
      if (row.attachments) {
        try { att = JSON.parse(row.attachments); } catch (_) {}
      }
      const created = row.created_at ? (typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString()) : '';
      const dateStr = created ? created.slice(0, 10) : '';
      list.push({
        id: row.id,
        date: dateStr,
        title: row.title || '',
        content: row.content || '',
        sender: row.sender || '',
        status: readMap[row.id] || 'New',
        attachments: att,
      });
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getMyNotices:', e.message);
    return res.status(200).json([]);
  }
};
