const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const list = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const stores = {};
    const jobs = {};
    for (let i = 0; i < list.length; i++) {
      const store = String(list[i].store || '').trim();
      const job = String(list[i].job || list[i].role || '').trim();
      if (store && store !== '매장명' && store !== 'Store') stores[store] = true;
      if (job && job !== '직급' && job !== 'Job' && job !== '부서') jobs[job] = true;
    }
    const JOB_ORDER = ['Assis Manager', 'Assistant Manager', 'Manager', 'Service', 'Kitchen'];
    const idxOf = (job) => {
      const j = (job || '').toLowerCase();
      return JOB_ORDER.findIndex((x) => {
        const k = (x || '').toLowerCase();
        return j === k || j.startsWith(k) || k.startsWith(j);
      });
    };
    const jobKeys = Object.keys(jobs);
    const jobList = jobKeys.sort((a, b) => {
      const ai = idxOf(a);
      const bi = idxOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return (a || '').localeCompare(b || '');
    });
    return res.status(200).json({ stores: Object.keys(stores).sort(), roles: jobList });
  } catch (e) {
    console.error('getNoticeOptions:', e.message);
    return res.status(200).json({ stores: [], roles: [] });
  }
};
