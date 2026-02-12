const { supabaseSelectFilter, supabaseUpdate, supabaseUpdateByFilter, supabaseInsertMany } = require('../../lib/supabase');
const TZ = 'Asia/Bangkok';
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const orderId = Number(b.orderRowId != null ? b.orderRowId : b.row);
    if (!orderId) return res.status(200).json({ success: false, message: '❌ 잘못된 주문 번호입니다.' });
    const orders = await supabaseSelectFilter('orders', 'id=eq.' + orderId) || [];
    if (!orders.length) return res.status(200).json({ success: false, message: '❌ 해당 주문이 없습니다.' });
    const o = orders[0];
    if (o.status !== 'Approved') return res.status(200).json({ success: false, message: '❌ 승인된 주문만 수령 처리할 수 있습니다.' });
    if (o.delivery_status === '배송완료') return res.status(200).json({ success: false, message: '❌ 이미 수령 완료된 주문입니다.' });
    let cart = []; try { cart = JSON.parse(o.cart_json || '[]'); } catch (_) {}
    if (!cart.length) return res.status(200).json({ success: false, message: '❌ 주문 품목이 없습니다.' });
    const store = o.store_name;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const inboundRows = cart.map((item) => ({ location: store, item_code: item.code, item_name: item.name || '', spec: item.spec || '-', qty: Number(item.qty), log_date: today, vendor_target: 'From HQ', log_type: 'Inbound' }));
    if (inboundRows.length) await supabaseInsertMany('stock_logs', inboundRows);
    try { await supabaseUpdateByFilter('stock_logs', 'order_id=eq.' + orderId, { delivery_status: '배송완료' }); } catch (_) {}
    const patch = { delivery_status: '배송완료' };
    if (b.imageUrl && String(b.imageUrl).trim()) patch.image_url = String(b.imageUrl).trim();
    await supabaseUpdate('orders', orderId, patch);
    return res.status(200).json({ success: true, message: '완료되었습니다.' });
  } catch (e) { console.error('processOrderReceive:', e.message); return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message }); }
};
