const { supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let startStr = '', endStr = '', storeFilter = '', visitPath = '', typeFilter = '', statusFilter = '';
    if (req.method === 'GET') {
      startStr = String(req.query.startStr || req.query.startDate || '').trim();
      endStr = String(req.query.endStr || req.query.endDate || '').trim();
      storeFilter = String(req.query.storeFilter || '').trim();
      visitPath = String(req.query.visitPath || '').trim();
      typeFilter = String(req.query.typeFilter || '').trim();
      statusFilter = String(req.query.statusFilter || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startStr = String(body.startStr || body.startDate || '').trim();
      endStr = String(body.endStr || body.endDate || '').trim();
      storeFilter = String(body.storeFilter || '').trim();
      visitPath = String(body.visitPath || '').trim();
      typeFilter = String(body.typeFilter || '').trim();
      statusFilter = String(body.statusFilter || '').trim();
    }
    const filters = [];
    if (startStr) filters.push('log_date=gte.' + startStr.substring(0, 10));
    if (endStr) filters.push('log_date=lte.' + endStr.substring(0, 10));
    if (storeFilter && storeFilter !== 'All') filters.push('store_name=eq.' + encodeURIComponent(storeFilter));
    if (visitPath) filters.push('visit_path=eq.' + encodeURIComponent(visitPath));
    if (typeFilter) filters.push('complaint_type=eq.' + encodeURIComponent(typeFilter));
    if (statusFilter) filters.push('status=eq.' + encodeURIComponent(statusFilter));
    const filterStr = filters.length ? filters.join('&') : 'id=gt.0';
    const list = await supabaseSelectFilter('complaint_logs', filterStr, { order: 'log_date.desc,id.desc', limit: 2000 }) || [];
    const result = list.map((d) => ({
      row: d.id,
      id: d.id,
      number: String(d.number || ''),
      date: d.log_date ? String(d.log_date).substring(0, 10) : '',
      time: String(d.log_time || ''),
      store: String(d.store_name || ''),
      writer: String(d.writer || ''),
      customer: String(d.customer || ''),
      contact: String(d.contact || ''),
      visitPath: String(d.visit_path || ''),
      platform: String(d.platform || ''),
      type: String(d.complaint_type || ''),
      menu: String(d.menu || ''),
      title: String(d.title || ''),
      content: String(d.content || ''),
      severity: String(d.severity || ''),
      action: String(d.action || ''),
      status: String(d.status || ''),
      handler: String(d.handler || ''),
      doneDate: d.done_date ? String(d.done_date).substring(0, 10) : '',
      photoUrl: String(d.photo_url || ''),
      remark: String(d.remark || ''),
    }));
    result.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    return res.status(200).json(result);
  } catch (e) {
    console.error('getComplaintLogList:', e.message);
    return res.status(200).json([]);
  }
};
