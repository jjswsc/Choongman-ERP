const { supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let startStr = '', endStr = '', filterStore = '', filterInspector = '';
    if (req.method === 'GET') {
      startStr = String(req.query.startStr || req.query.startDate || '2000-01-01').trim();
      endStr = String(req.query.endStr || req.query.endDate || '2100-12-31').trim();
      filterStore = String(req.query.filterStore || '').trim();
      filterInspector = String(req.query.filterInspector || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startStr = String(body.startStr || body.startDate || '2000-01-01').trim();
      endStr = String(body.endStr || body.endDate || '2100-12-31').trim();
      filterStore = String(body.filterStore || '').trim();
      filterInspector = String(body.filterInspector || '').trim();
    }
    const startStr2 = startStr.substring(0, 10);
    const endStr2 = endStr.substring(0, 10);
    const filters = ['check_date=gte.' + startStr2, 'check_date=lte.' + endStr2];
    if (filterStore && filterStore !== 'All') filters.push('store_name=eq.' + encodeURIComponent(filterStore));
    const list = await supabaseSelectFilter('check_results', filters.join('&'), { order: 'check_date.desc', limit: 2000 }) || [];
    const searchName = filterInspector ? filterInspector.toLowerCase().trim() : '';
    const result = list
      .filter((d) => !searchName || String(d.inspector || '').toLowerCase().includes(searchName))
      .map((d) => ({
        id: d.id,
        date: String(d.check_date || '').substring(0, 10),
        store: d.store_name,
        inspector: String(d.inspector || '').trim(),
        result: d.summary,
        json: d.json_data,
      }));
    return res.status(200).json(result);
  } catch (e) {
    console.error('getCheckHistory:', e.message);
    return res.status(200).json([]);
  }
};
