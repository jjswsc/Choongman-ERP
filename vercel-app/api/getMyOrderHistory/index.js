const { supabaseSelectFilter } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let store = '', startStr = '', endStr = '';
    if (req.method === 'GET') { store = req.query.store || ''; startStr = req.query.startStr || req.query.start || ''; endStr = req.query.endStr || req.query.end || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); store = b.store || ''; startStr = b.startStr || b.start || ''; endStr = b.endStr || b.end || ''; }
    const endIso = endStr + 'T23:59:59.999Z';
    const filter = 'store_name=eq.' + encodeURIComponent(store) + '&order_date=gte.' + encodeURIComponent(startStr) + '&order_date=lte.' + encodeURIComponent(endIso);
    const orderRows = await supabaseSelectFilter('orders', filter, { order: 'order_date.desc', limit: 300 }) || [];
    const list = orderRows.map((o) => {
      let cart = []; try { cart = JSON.parse(o.cart_json || '[]'); } catch (_) {}
      const summary = cart.length ? cart[0].name + (cart.length > 1 ? ' 외 ' + (cart.length - 1) + '건' : '') : 'Items';
      const orderDate = o.order_date ? new Date(o.order_date) : new Date();
      return { id: o.id, orderRowId: o.id, date: orderDate.toISOString().slice(0, 10), deliveryDate: (o.delivery_date || '').trim(), summary, total: Number(o.total) || 0, status: o.status || 'Pending', deliveryStatus: o.delivery_status || (o.status === 'Approved' ? '배송중' : ''), items: cart };
    });
    return res.status(200).json(list);
  } catch (e) { console.error('getMyOrderHistory:', e.message); return res.status(200).json([]); }
};
