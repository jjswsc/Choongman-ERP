/**
 * Supabase REST 호출 (Node 18+ fetch)
 * GAS S_Supabase.js와 동일한 동작을 위한 헬퍼
 */
const path = require('path');
const fs = require('fs');
// .env 위치 여러 군데 시도 (vercel dev / 로컬 둘 다)
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '..', '.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    require('dotenv').config({ path: p });
    break;
  }
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL 또는 SUPABASE_ANON_KEY가 없습니다.');
  const base = url.replace(/\/$/, '').replace(/^http:\/\//, 'https://');
  return { url: base, key };
}

async function supabaseSelect(table, options = {}) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}`;
  const query = ['select=*'];
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`);
  if (options.limit != null) query.push(`limit=${Number(options.limit)}`);
  if (options.offset != null) query.push(`offset=${Number(options.offset)}`);
  const rangeEnd = options.limit != null ? Number(options.limit) - 1 : 1999;
  const res = await fetch(path + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `0-${rangeEnd}`,
    },
  });
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()));
  return res.json();
}

async function supabaseSelectFilter(table, filter, options = {}) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}`;
  const query = ['select=*', filter];
  if (options.order) query.push(`order=${encodeURIComponent(options.order)}`);
  if (options.limit != null) query.push(`limit=${Number(options.limit)}`);
  const rangeEnd = (options.limit != null ? Number(options.limit) : 2000) - 1;
  const res = await fetch(path + '?' + query.join('&'), {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `0-${rangeEnd}`,
    },
  });
  if (!res.ok) throw new Error('Supabase select failed: ' + (await res.text()));
  return res.json();
}

async function supabaseUpdate(table, id, patch) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Supabase update failed: ' + (await res.text()));
  return true;
}

async function supabaseInsert(table, row) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}`;
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error('Supabase insert failed: ' + (await res.text()));
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function supabaseInsertMany(table, rows) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}`;
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error('Supabase insert many failed: ' + (await res.text()));
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function supabaseUpdateByFilter(table, filter, patch) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}?${filter}`;
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Supabase update failed: ' + (await res.text()));
  return true;
}

async function supabaseDelete(table, id) {
  const { url, key } = getConfig();
  const path = `${url}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`;
  const res = await fetch(path, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error('Supabase delete failed: ' + (await res.text()));
  return true;
}

/** UPSERT: onConflict 컬럼 문자열 예 "notice_id,store,name" */
async function supabaseUpsertMany(table, rows, onConflict) {
  const { url, key } = getConfig();
  let path = `${url}/rest/v1/${encodeURIComponent(table)}`;
  if (onConflict) path += '?on_conflict=' + encodeURIComponent(onConflict);
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error('Supabase upsert many failed: ' + (await res.text()));
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

module.exports = {
  getConfig,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdate,
  supabaseUpdateByFilter,
  supabaseInsert,
  supabaseInsertMany,
  supabaseDelete,
  supabaseUpsertMany,
};
