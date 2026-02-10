const { supabaseSelect, supabaseSelectFilter, supabaseInsert } = require('../../lib/supabase');

const TZ = 'Asia/Bangkok';

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const radLat1 = (lat1 * Math.PI) / 180;
  const radLat2 = (lat2 * Math.PI) / 180;
  const diffLat = ((lat2 - lat1) * Math.PI) / 180;
  const diffLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(diffLat / 2) ** 2 + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(diffLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const storeNameTrim = String(data.storeName || '').trim();
    if (storeNameTrim && data.lat !== 'Unknown' && data.lat !== '' && data.lng !== '') {
      const vendors = await supabaseSelect('vendors', { limit: 2000 }) || [];
      let targetLat = 0, targetLng = 0;
      for (let i = 0; i < vendors.length; i++) {
        const v = vendors[i];
        const gpsName = String(v.gps_name || '').trim();
        const name = String(v.name || '').trim();
        if (gpsName === storeNameTrim || (gpsName === '' && name === storeNameTrim)) {
          targetLat = Number(v.lat);
          targetLng = Number(v.lng);
          if (targetLat !== 0 || targetLng !== 0) break;
        }
      }
      if (targetLat !== 0 || targetLng !== 0) {
        const distance = calcDistance(targetLat, targetLng, Number(data.lat), Number(data.lng));
        if (distance > 100) {
          return res.status(200).json({ success: false, msg: '❌ 위치 부적합! 매장 근처(100m 이내)가 아닙니다.\n(현재 거리: ' + Math.round(distance) + 'm)' });
        }
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: TZ });
    const timeStr = now.toLocaleTimeString('en-GB', { timeZone: TZ, hour12: false });
    let durationMin = null;

    if (data.type === '방문종료') {
      const searchName = String(data.userName || '').trim();
      const searchStore = String(data.storeName || '').trim();
      const filters = 'name=eq.' + encodeURIComponent(searchName) + '&store_name=eq.' + encodeURIComponent(searchStore) + '&visit_type=eq.방문시작';
      const recent = await supabaseSelectFilter('store_visits', filters, { order: 'visit_date.desc,visit_time.desc', limit: 1 }) || [];
      if (recent && recent.length > 0) {
        const startRow = recent[0];
        const startDateStr = String(startRow.visit_date || '').substring(0, 10);
        const startTimeStr = String(startRow.visit_time || '').trim();
        const startDateTime = new Date(startDateStr + 'T' + (startTimeStr.length >= 8 ? startTimeStr : startTimeStr + '00').substring(0, 8));
        const diffMs = isNaN(startDateTime.getTime()) ? 0 : (now.getTime() - startDateTime.getTime());
        durationMin = diffMs > 0 ? Math.floor(diffMs / (1000 * 60)) : 0;
      } else {
        durationMin = 0;
      }
    }

    const row = {
      id: 'V' + now.getTime(),
      visit_date: dateStr,
      name: data.userName,
      store_name: data.storeName,
      visit_type: data.type,
      purpose: data.purpose || '',
      visit_time: timeStr,
      lat: data.lat || '',
      lng: data.lng || '',
      duration_min: durationMin !== null ? durationMin : 0,
      memo: '',
    };
    await supabaseInsert('store_visits', row);
    let msg = '✅ ' + data.type + ' 완료!';
    if (durationMin !== null && durationMin > 0) msg += ' (' + durationMin + '분 체류)';
    return res.status(200).json({ success: true, msg });
  } catch (e) {
    console.error('submitStoreVisit:', e.message);
    return res.status(200).json({ success: false, msg: '❌ 서버 저장 오류: ' + e.message });
  }
};
