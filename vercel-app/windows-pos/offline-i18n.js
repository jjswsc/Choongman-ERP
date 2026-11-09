/**
 * Windows POS offline.html 문구 (앱 번들 없이 셸만으로 표시).
 * CommonJS + 브라우저 전역 모두 지원.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CmPosOfflineI18n = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  var LANGS = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"];

  var STRINGS = {
    ko: {
      htmlLang: "ko",
      docTitle: "Choongman POS - Offline",
      title: "네트워크 연결을 확인해주세요.",
      body1: "서버 접속이 불안정합니다. 인터넷·Wi‑Fi 연결 후 다시 시도하세요.",
      cacheHintHtml:
        "이 PC에서 POS를 한 번이라도 온라인으로 연 적이 있으면, <span class=\"emphasis\">「캐시로 열기」</span>로 오프라인 모드(저장된 로그인·주문 동기화)에 들어갈 수 있습니다.",
      syncNote: "오프라인 중 저장된 주문은 연결 복구 후 자동 동기화됩니다.",
      offlineHintHtml:
        "Wi‑Fi/인터넷이 없을 때는 <span class=\"emphasis\">초록 「캐시로 열기」</span>만 사용하세요. 「다시 시도」는 연결될 때까지 기다립니다.",
      retryHint:
        "다시 시도 후에도 같으면 앱을 완전히 종료한 뒤 실행하거나, 인터넷 연결 후 POS를 한 번 열어 캐시를 갱신해 주세요.",
      cacheBtn: "캐시로 열기 (오프라인)",
      retryBtn: "다시 시도 (온라인)",
      connecting: "연결 중…",
      loadingCache: "캐시 불러오는 중… (최대 30초)",
    },
    en: {
      htmlLang: "en",
      docTitle: "Choongman POS - Offline",
      title: "Please check your network connection.",
      body1: "Server connection is unstable. Connect to the internet/Wi‑Fi and try again.",
      cacheHintHtml:
        "If POS has been opened online on this PC before, use <span class=\"emphasis\">「Open from cache」</span> to enter offline mode (saved login · order sync).",
      syncNote: "Orders saved while offline will sync automatically after the connection is restored.",
      offlineHintHtml:
        "When there is no Wi‑Fi/internet, use only the green <span class=\"emphasis\">「Open from cache」</span>. 「Retry」 waits until a connection is available.",
      retryHint:
        "If it still fails after retry, fully quit the app and reopen, or connect to the internet and open POS once to refresh the cache.",
      cacheBtn: "Open from cache (offline)",
      retryBtn: "Retry (online)",
      connecting: "Connecting…",
      loadingCache: "Loading cache… (up to 30s)",
    },
    th: {
      htmlLang: "th",
      docTitle: "Choongman POS - Offline",
      title: "กรุณาตรวจสอบการเชื่อมต่อเครือข่าย",
      body1: "การเชื่อมต่อเซิร์ฟเวอร์ไม่เสถียร กรุณาเชื่อมต่ออินเทอร์เน็ตหรือ Wi‑Fi แล้วลองอีกครั้ง",
      cacheHintHtml:
        "หากเคยเปิด POS แบบออนไลน์บนเครื่องนี้แล้ว สามารถกด <span class=\"emphasis\">「เปิดจากแคช」</span> เพื่อเข้าโหมดออฟไลน์ (ล็อกอินที่บันทึกไว้ · ซิงก์ออเดอร์)",
      syncNote: "ออเดอร์ที่บันทึกตอนออฟไลน์จะซิงก์อัตโนมัติเมื่อเชื่อมต่อกลับมา",
      offlineHintHtml:
        "เมื่อไม่มี Wi‑Fi/อินเทอร์เน็ต ให้ใช้ปุ่มเขียว <span class=\"emphasis\">「เปิดจากแคช」</span> เท่านั้น 「ลองอีกครั้ง」จะรอจนกว่าจะเชื่อมต่อได้",
      retryHint:
        "หากลองแล้วยังเหมือนเดิม ให้ปิดแอปทั้งหมดแล้วเปิดใหม่ หรือเชื่อมต่ออินเทอร์เน็ตแล้วเปิด POS สักครั้งเพื่ออัปเดตแคช",
      cacheBtn: "เปิดจากแคช (ออฟไลน์)",
      retryBtn: "ลองอีกครั้ง (ออนไลน์)",
      connecting: "กำลังเชื่อมต่อ…",
      loadingCache: "กำลังโหลดแคช… (สูงสุด 30 วินาที)",
    },
    mm: {
      htmlLang: "my",
      docTitle: "Choongman POS - Offline",
      title: "နက်ဝက်ချိတ်ဆက်မှုကို စစ်ဆေးပါ။",
      body1: "ဆာဗာချိတ်ဆက်မှု မတည်ငြိမ်ပါ။ အင်တာနက်/Wi‑Fi ချိတ်ဆက်ပြီး ထပ်မံကြိုးစားပါ။",
      cacheHintHtml:
        "ဤကွန်ပျူတာတွင် POS ကို အွန်လိုင်းဖွင့်ဖူးပါက <span class=\"emphasis\">「ကက်ရှ်ဖြင့် ဖွင့်」</span> ဖြင့် အော့ဖ်လိုင်းမုဒ် (သိမ်းထားသော လော့ဂ်အင် · အော်ဒါ စင့်ခ်) သို့ ဝင်နိုင်သည်။",
      syncNote: "အော့ဖ်လိုင်းတွင် သိမ်းထားသော အော်ဒါများသည် ချိတ်ဆက်မှု ပြန်ရသောအခါ အလိုအလျောက် စင့်ခ်လုပ်ပါမည်။",
      offlineHintHtml:
        "Wi‑Fi/အင်တာနက် မရှိသည့်အခါ အစိမ်းရောင် <span class=\"emphasis\">「ကက်ရှ်ဖြင့် ဖွင့်」</span> ကိုသာ သုံးပါ။ 「ထပ်ကြိုးစား」 သည် ချိတ်ဆက်မှုရသည်အထိ စောင့်သည်။",
      retryHint:
        "ထပ်ကြိုးစားပြီးနောက် တူညီနေသေးလျှင် အက်ပ်ကို လုံးဝပိတ်ပြီး ပြန်ဖွင့်ပါ၊ သို့မဟုတ် အင်တာနက်ချိတ်ဆက်ပြီး POS ကို တစ်ကြိမ်ဖွင့်ကာ ကက်ရှ် အသစ်တင်ပါ။",
      cacheBtn: "ကက်ရှ်ဖြင့် ဖွင့် (အော့ဖ်လိုင်း)",
      retryBtn: "ထပ်ကြိုးစား (အွန်လိုင်း)",
      connecting: "ချိတ်ဆက်နေသည်…",
      loadingCache: "ကက်ရှ် တင်နေသည်… (အများဆုံး ၃၀ စက္ကန့်)",
    },
    la: {
      htmlLang: "lo",
      docTitle: "Choongman POS - Offline",
      title: "ກະລຸນາກວດສອບການເຊື່ອມຕໍ່ເຄືອຂ່າຍ",
      body1: "ການເຊື່ອມຕໍ່ເຊີບເວີບໍ່ສະຖຽນ ກະລຸນາເຊື່ອມຕໍ່ອິນເຕີເນັດ/Wi‑Fi ແລ້ວລອງໃໝ່",
      cacheHintHtml:
        "ຖ້າເຄີຍເປີດ POS ອອນລາຍໃນເຄື່ອງນີ້ແລ້ວ ສາມາດກົດ <span class=\"emphasis\">「ເປີດຈາກແຄຊ」</span> ເພື່ອເຂົ້າໂໝດອອບລາຍ (ລ็อกອິນທີ່ບັນທຶກ · ຊິງຄ໌ອໍເດີ)",
      syncNote: "ອໍເດີທີ່ບັນທຶກໃນໂໝດອອບລາຍຈະຊິງຄ໌ອັດຕະໂນມັດເມື່ອເຊື່ອມຕໍ່ຄືນ",
      offlineHintHtml:
        "ເມື່ອບໍ່ມີ Wi‑Fi/ອິນເຕີເນັດ ໃຫ້ໃຊ້ປຸ່ມຂຽວ <span class=\"emphasis\">「ເປີດຈາກແຄຊ」</span> ເທົ່ານັ້ນ 「ລອງໃໝ່」 ຈະລໍຖ້າຈົນກວ່າເຊື່ອມຕໍ່ໄດ້",
      retryHint:
        "ຖ້າລອງແລ້ວຍັງຄືເກົ່າ ໃຫ້ປິດແອັບໃຫ້ຫມົດແລ້ວເປີດໃໝ່ ຫຼືເຊື່ອມຕໍ່ອິນເຕີເນັດແລ້ວເປີດ POS ສັກຄັ້ງເພື່ອອັບເດດແຄຊ",
      cacheBtn: "ເປີດຈາກແຄຊ (ອອບລາຍ)",
      retryBtn: "ລອງໃໝ່ (ອອນລາຍ)",
      connecting: "ກຳລັງເຊື່ອມຕໍ່…",
      loadingCache: "ກຳລັງໂຫຼດແຄຊ… (ສູງສຸດ 30 ວິນາທີ)",
    },
    kh: {
      htmlLang: "km",
      docTitle: "Choongman POS - Offline",
      title: "សូមពិនិត្យការតភ្ជាប់បណ្តាញ។",
      body1: "ការតភ្ជាប់ម៉ាស៊ីនមេមិនស្ថិតស្ថេរ។ សូមតភ្ជាប់អ៊ីនធឺណិត/Wi‑Fi រួចព្យាយាមម្តងទៀត។",
      cacheHintHtml:
        "ប្រសិនបើធ្លាប់បើក POS អនឡាញលើកុំព្យូទ័រនេះ សូមចុច <span class=\"emphasis\">「បើកពីឃ្លាំងសម្ងាត់」</span> ដើម្បីចូលម៉ូដក្រៅបណ្តាញ (ចូលប្រព័ន្ធដែលរក្សាទុក · ធ្វើសមកាលកម្មការកម្មង់)។",
      syncNote: "ការកម្មង់ដែលរក្សាទុកពេលក្រៅបណ្តាញនឹងធ្វើសមកាលកម្មដោយស្វ័យប្រវត្តិពេលតភ្ជាប់វិញ។",
      offlineHintHtml:
        "ពេលគ្មាន Wi‑Fi/អ៊ីនធឺណិត សូមប្រើតែប៊ូតុងបៃតង <span class=\"emphasis\">「បើកពីឃ្លាំងសម្ងាត់」</span>។ 「ព្យាយាមម្តងទៀត」 នឹងរង់ចាំរហូតដល់មានការតភ្ជាប់។",
      retryHint:
        "ប្រសិនបើព្យាយាមហើយនៅដដែល សូមបិទកម្មវិធីទាំងស្រុងរួចបើកឡើងវិញ ឬតភ្ជាប់អ៊ីនធឺណិតរួចបើក POS ម្តងដើម្បីធ្វើបច្ចុប្បន្នភាពឃ្លាំងសម្ងាត់។",
      cacheBtn: "បើកពីឃ្លាំងសម្ងាត់ (ក្រៅបណ្តាញ)",
      retryBtn: "ព្យាយាមម្តងទៀត (អនឡាញ)",
      connecting: "កំពុងតភ្ជាប់…",
      loadingCache: "កំពុងផ្ទុកឃ្លាំងសម្ងាត់… (អតិបរមា ៣០ វិនាទី)",
    },
    vi: {
      htmlLang: "vi",
      docTitle: "Choongman POS - Offline",
      title: "Vui lòng kiểm tra kết nối mạng.",
      body1: "Kết nối máy chủ không ổn định. Hãy kết nối internet/Wi‑Fi rồi thử lại.",
      cacheHintHtml:
        "Nếu POS đã từng mở online trên máy này, dùng <span class=\"emphasis\">「Mở từ bộ nhớ đệm」</span> để vào chế độ ngoại tuyến (đăng nhập đã lưu · đồng bộ đơn).",
      syncNote: "Đơn lưu khi ngoại tuyến sẽ tự đồng bộ sau khi kết nối được khôi phục.",
      offlineHintHtml:
        "Khi không có Wi‑Fi/internet, chỉ dùng nút xanh <span class=\"emphasis\">「Mở từ bộ nhớ đệm」</span>. 「Thử lại」 sẽ chờ đến khi có kết nối.",
      retryHint:
        "Nếu vẫn vậy sau khi thử lại, hãy thoát hẳn ứng dụng rồi mở lại, hoặc kết nối internet và mở POS một lần để làm mới bộ nhớ đệm.",
      cacheBtn: "Mở từ bộ nhớ đệm (ngoại tuyến)",
      retryBtn: "Thử lại (trực tuyến)",
      connecting: "Đang kết nối…",
      loadingCache: "Đang tải bộ nhớ đệm… (tối đa 30 giây)",
    },
    ms: {
      htmlLang: "ms",
      docTitle: "Choongman POS - Offline",
      title: "Sila semak sambungan rangkaian.",
      body1: "Sambungan pelayan tidak stabil. Sambung internet/Wi‑Fi kemudian cuba lagi.",
      cacheHintHtml:
        "Jika POS pernah dibuka dalam talian pada PC ini, guna <span class=\"emphasis\">「Buka dari cache」</span> untuk masuk mod luar talian (log masuk tersimpan · segerak pesanan).",
      syncNote: "Pesanan yang disimpan semasa luar talian akan disegerakkan secara automatik selepas sambungan dipulihkan.",
      offlineHintHtml:
        "Apabila tiada Wi‑Fi/internet, guna hanya butang hijau <span class=\"emphasis\">「Buka dari cache」</span>. 「Cuba lagi」 menunggu sehingga sambungan tersedia.",
      retryHint:
        "Jika masih sama selepas cuba lagi, tutup aplikasi sepenuhnya kemudian buka semula, atau sambung internet dan buka POS sekali untuk kemas kini cache.",
      cacheBtn: "Buka dari cache (luar talian)",
      retryBtn: "Cuba lagi (dalam talian)",
      connecting: "Menyambung…",
      loadingCache: "Memuatkan cache… (maks. 30s)",
    },
  };

  function normalizeLang(lang) {
    var s = String(lang || "")
      .trim()
      .toLowerCase()
      .split(/[-_]/)[0];
    if (LANGS.indexOf(s) >= 0) return s;
    return null;
  }

  function guessLangFromNavigator(language) {
    return normalizeLang(language);
  }

  /** persisted(POS UI) → OS 언어 → en (태국 매장에서 한국어 고정 방지) */
  function resolveOfflineLang(opts) {
    var o = opts && typeof opts === "object" ? opts : {};
    var fromPersisted = normalizeLang(o.persisted);
    if (fromPersisted) return fromPersisted;
    var fromNav = guessLangFromNavigator(o.navigatorLanguage);
    if (fromNav) return fromNav;
    return "en";
  }

  function getStrings(lang) {
    var code = normalizeLang(lang) || "en";
    return STRINGS[code] || STRINGS.en;
  }

  function applyOfflineI18n(doc, lang) {
    var d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return getStrings(lang);
    var s = getStrings(lang);
    try {
      if (d.documentElement) d.documentElement.lang = s.htmlLang || "en";
      if (d.title !== undefined) d.title = s.docTitle;
      var title = d.getElementById("offlineTitle");
      if (title) title.textContent = s.title;
      var body1 = d.getElementById("offlineBody1");
      if (body1) body1.textContent = s.body1;
      var cacheHint = d.getElementById("offlineCacheHint");
      if (cacheHint) cacheHint.innerHTML = s.cacheHintHtml;
      var syncNote = d.getElementById("offlineSyncNote");
      if (syncNote) syncNote.textContent = s.syncNote;
      var offlineHint = d.getElementById("offlineHint");
      if (offlineHint) offlineHint.innerHTML = s.offlineHintHtml;
      var retryHint = d.getElementById("retryHint");
      if (retryHint) retryHint.innerHTML = s.retryHint;
      var cacheBtn = d.getElementById("cacheBtn");
      if (cacheBtn && !cacheBtn.disabled) cacheBtn.textContent = s.cacheBtn;
      var retryBtn = d.getElementById("retryBtn");
      if (retryBtn && !retryBtn.disabled) retryBtn.textContent = s.retryBtn;
      d.documentElement.setAttribute("data-offline-lang", normalizeLang(lang) || "en");
    } catch (e) {
      /* ignore */
    }
    return s;
  }

  return {
    LANGS: LANGS,
    STRINGS: STRINGS,
    normalizeLang: normalizeLang,
    guessLangFromNavigator: guessLangFromNavigator,
    resolveOfflineLang: resolveOfflineLang,
    getStrings: getStrings,
    applyOfflineI18n: applyOfflineI18n,
  };
});
