const { supabaseSelect, supabaseSelectFilter, supabaseInsert } = require('../../lib/supabase');

const TZ = 'Asia/Bangkok';

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

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

function parsePlanTimeToDate(dateStr, planVal) {
  if (!dateStr || planVal == null || (typeof planVal === 'string' && planVal.trim() === '')) return null;
  if (planVal instanceof Date && !isNaN(planVal.getTime())) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setHours(planVal.getHours(), planVal.getMinutes(), planVal.getSeconds(), 0);
    return d;
  }
  const s = String(planVal).trim();
  if (!s) return null;
  let h, mn, sec;
  let m = s.match(/오후\s*(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/);
  if (m) {
    h = parseInt(m[1], 10);
    if (h !== 12) h += 12;
    mn = parseInt(m[2], 10);
    sec = m[3] ? parseInt(m[3], 10) : 0;
  } else {
    m = s.match(/오전\s*(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/);
    if (m) {
      h = parseInt(m[1], 10);
      if (h === 12) h = 0;
      mn = parseInt(m[2], 10);
      sec = m[3] ? parseInt(m[3], 10) : 0;
    } else {
      m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/);
      if (!m) return null;
      h = parseInt(m[1], 10);
      mn = parseInt(m[2], 10);
      sec = m[3] ? parseInt(m[3], 10) : 0;
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(h, mn, sec, 0);
  return isNaN(d.getTime()) ? null : d;
}

function safeMinutes(val) {
  const n = Number(val);
  if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return 0;
  return Math.floor(n);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const todayStrVal = todayStr();
    const nowTime = new Date();
    const storeName = String(data.storeName || '').trim();
    const empName = String(data.name || '').trim();
    const logType = String(data.type || '').trim();

    const oncePerDayTypes = ['출근', '퇴근', '휴식시작', '휴식종료'];
    if (oncePerDayTypes.indexOf(logType) !== -1) {
      const logRows = await supabaseSelect('attendance_logs', { order: 'log_at.asc' }) || [];
      for (let i = 0; i < logRows.length; i++) {
        const r = logRows[i];
        const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
        if (rowDate === todayStrVal && String(r.store_name || '').trim() === storeName && String(r.name || '').trim() === empName && String(r.log_type || '').trim() === logType) {
          return res.status(200).json({ success: false, message: '오늘 이미 [' + logType + '] 기록이 있습니다. 하루에 한 번만 기록할 수 있습니다.' });
        }
      }
    }

    let targetLat = 0, targetLng = 0, locationOk = false;
    const vendors = await supabaseSelect('vendors', { limit: 2000 }) || [];
    for (let i = 0; i < vendors.length; i++) {
      const v = vendors[i];
      const gpsName = String(v.gps_name || '').trim();
      const name = String(v.name || '').trim();
      if (gpsName === storeName || (gpsName === '' && name === storeName)) {
        targetLat = Number(v.lat);
        targetLng = Number(v.lng);
        if (targetLat !== 0 || targetLng !== 0) break;
      }
    }
    if ((targetLat !== 0 || targetLng !== 0) && data.lat !== 'Unknown' && data.lat !== '' && data.lng !== '' && data.lng !== 'Unknown') {
      const dist = calcDistance(targetLat, targetLng, Number(data.lat), Number(data.lng));
      if (dist <= 100) locationOk = true;
    }
    const needManagerApproval = !locationOk;

    let planIn = '', planOut = '', planBS = '', planBE = '';
    const schRows = await supabaseSelect('schedules', { order: 'schedule_date.asc' }) || [];
    for (let j = 0; j < schRows.length; j++) {
      const rowDate = schRows[j].schedule_date ? new Date(schRows[j].schedule_date).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
      if (rowDate === todayStrVal && String(schRows[j].name || '').trim() === empName) {
        planIn = schRows[j].plan_in || '';
        planOut = schRows[j].plan_out || '';
        planBS = schRows[j].break_start || '';
        planBE = schRows[j].break_end || '';
        break;
      }
    }

    let lateMin = 0, earlyMin = 0, otMin = 0, breakMin = 0, status = '정상', planTime = '';
    if (logType === '출근' && planIn) {
      planTime = planIn;
      const pInDate = parsePlanTimeToDate(todayStrVal, planIn);
      if (pInDate && nowTime > pInDate) {
        lateMin = safeMinutes((nowTime - pInDate) / (1000 * 60));
        if (lateMin > 1) status = '지각';
      }
    } else if (logType === '퇴근' && planOut) {
      planTime = planOut;
      const pOutDate = parsePlanTimeToDate(todayStrVal, planOut);
      if (pOutDate) {
        if (nowTime < pOutDate) {
          earlyMin = safeMinutes((pOutDate - nowTime) / (1000 * 60));
          status = '조퇴';
        } else {
          otMin = safeMinutes((nowTime - pOutDate) / (1000 * 60));
          if (otMin >= 30) status = '연장';
        }
      }
    } else if (logType === '휴식종료') {
      const allLogs = await supabaseSelect('attendance_logs', { order: 'log_at.asc' }) || [];
      for (let k = allLogs.length - 1; k >= 0; k--) {
        const r = allLogs[k];
        const rowDate = r.log_at ? new Date(r.log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
        if (rowDate === todayStrVal && String(r.name || '').trim() === empName && String(r.log_type || '').trim() === '휴식시작') {
          const actualStart = new Date(r.log_at);
          breakMin = isNaN(actualStart.getTime()) ? 0 : safeMinutes((nowTime - actualStart) / (1000 * 60));
          if (planBS && planBE) {
            const pBSDate = parsePlanTimeToDate(todayStrVal, planBS);
            const pBEDate = parsePlanTimeToDate(todayStrVal, planBE);
            if (pBSDate && pBEDate) {
              const planDur = safeMinutes((pBEDate - pBSDate) / (1000 * 60));
              status = breakMin > planDur ? '휴게초과' : '휴게정상';
            }
          }
          break;
        }
      }
    }

    if (needManagerApproval) status = '위치미확인(승인대기)';

    await supabaseInsert('attendance_logs', {
      log_at: nowTime.toISOString(),
      store_name: storeName,
      name: empName,
      log_type: logType,
      lat: String(data.lat != null ? data.lat : '').trim(),
      lng: String(data.lng != null ? data.lng : '').trim(),
      planned_time: planTime.trim(),
      late_min: safeMinutes(lateMin),
      early_min: safeMinutes(earlyMin),
      ot_min: safeMinutes(otMin),
      break_min: safeMinutes(breakMin),
      reason: '',
      status,
      approved: '대기',
    });

    if (needManagerApproval) {
      return res.status(200).json({ success: true, code: 'ATT_GPS_PENDING', message: '위치 확인 대기 중입니다.' });
    }
    return res.status(200).json({ success: true, message: '✅ ' + logType + ' 완료! (' + status + ')' });
  } catch (e) {
    console.error('submitAttendance:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
