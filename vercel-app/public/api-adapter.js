/**
 * Vercel API 어댑터
 * - GAS의 google.script.run 대신 fetch('/api/함수명') 호출
 * - 페이지에서 먼저 로드한 뒤 다른 스크립트가 runApi 사용
 */
(function() {
  var BASE = typeof window.API_BASE !== 'undefined' ? window.API_BASE : '';
  window.runApi = function(method, apiName, body) {
    var url = BASE + '/api/' + apiName;
    var opts = { method: method === 'GET' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' } };
    if (method === 'GET' && body && typeof body === 'object') {
      var q = Object.keys(body).map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(body[k] == null ? '' : body[k]); }).join('&');
      if (q) url += '?' + q;
    } else if (body && typeof body === 'object' && (method !== 'GET')) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function(r) { return r.text(); }).then(function(t) {
      try { return JSON.parse(t); } catch (e) { return t; }
    });
  };
})();
