const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

function toDateStr(val) {
  if (!val) return '-';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '-' : (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0') + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let noticeId = '', storeFilter = '';
    if (req.method === 'GET') {
      noticeId = req.query.noticeId || req.query.id || '';
      storeFilter = req.query.storeFilter || '';
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      noticeId = body.noticeId || body.id || '';
      storeFilter = body.storeFilter || '';
    }
    const nId = Number(noticeId);
    let targetStores = '', targetRoles = '';
    const noticeRows = await supabaseSelectFilter('notices', 'id=eq.' + encodeURIComponent(nId), { limit: 1 }) || [];
    if (!noticeRows || noticeRows.length === 0) return res.status(200).json([]);
    targetStores = String(noticeRows[0].target_store || '');
    targetRoles = String(noticeRows[0].target_role || '');
    if (!targetStores && !targetRoles) return res.status(200).json([]);
    const readMap = {};
    const readRows = await supabaseSelectFilter('notice_reads', 'notice_id=eq.' + encodeURIComponent(nId)) || [];
    for (let i = 0; i < readRows.length; i++) {
      const key = (readRows[i].store || '') + '_' + (readRows[i].name || '');
      readMap[key] = readRows[i].read_at ? toDateStr(readRows[i].read_at) : '-';
    }
    const empList = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const result = [];
    const filterStore = (storeFilter && String(storeFilter).trim()) ? String(storeFilter).trim() : '';
    for (let i = 0; i < empList.length; i++) {
      const e = empList[i];
      const eStore = String(e.store || '').trim();
      const eName = String(e.name || '').trim();
      const resignDate = e.resign_date ? String(e.resign_date).trim() : '';
      if (!eName || (resignDate && resignDate !== '')) continue;
      if (!eStore || eStore === '매장명') continue;
      if (filterStore && eStore !== filterStore) continue;
      const eRole = (String(e.role || '').trim() || 'Staff');
      const isStoreTarget = targetStores === '전체' || targetStores.indexOf(eStore) > -1;
      const isRoleTarget = targetRoles === '전체' || targetRoles.toLowerCase().indexOf(eRole.toLowerCase()) > -1;
      const key = eStore + '_' + eName;
      const readTime = readMap[key];
      if ((isStoreTarget && isRoleTarget) || readTime) {
        result.push({ store: eStore, name: eName, role: eRole, status: readTime ? '확인' : '미확인', date: readTime || '-' });
      }
    }
    result.sort((a, b) => (a.status === b.status ? 0 : (a.status === '확인' ? 1 : -1)));
    return res.status(200).json(result);
  } catch (e) {
    console.error('adminGetNoticeStats:', e.message);
    return res.status(200).json([]);
  }
};
