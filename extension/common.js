// 팝업과 content script 가 공유하는 저장 계층.
// 추가 기능(다모앙 서버에 저장되지 않는 확장 자체 기능) 설정은 브라우저 계정 동기화(storage.sync)에
// 저장해 기기 간 연속성을 준다. 브라우저 동기화를 안 쓰면 local 처럼 동작하므로 스위치는 두지 않는다.
// sync 는 항목당 8KB 제한이 있어 JSON 문자열을 조각(키#0..n, 키#n = 조각 수)으로 나눠 저장한다.
// 0.3.0 까지는 storage.local 에 저장했으므로 sync 에 없으면 local 을 읽고, 저장할 때 local 사본을 지운다

const DUI_CHUNK = 2000;
const DUI_CHUNK_MAX = 40;

async function duiRead(key) {
  try {
    const meta = await chrome.storage.sync.get(key + "#n");
    const n = meta[key + "#n"];
    if (typeof n === "number" && n > 0) {
      const names = [];
      for (let i = 0; i < n; i++) names.push(key + "#" + i);
      const r = await chrome.storage.sync.get(names);
      const v = JSON.parse(names.map(k => r[k] || "").join(""));
      if (v && typeof v === "object") return v;
    }
  } catch (_) {
    // sync 를 못 읽으면 local 로
  }
  const r = await chrome.storage.local.get(key);
  return r[key];
}

// Safari 는 storage.sync 가 기기 간 로밍을 하지 않아 확장 앱(iCloud 키-값 저장소)으로 따로 동기화한다.
// 갱신 시각(키#t)으로 최신 쪽이 이긴다. content script 는 네이티브 메시지를 못 보내므로
// 요청은 runtime.sendMessage 로 Safari 전용 백그라운드(background.js)에 맡긴다
const DUI_SYNC = {
  enabled: (() => {
    const ua = navigator.userAgent;
    return /Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox|Android/.test(ua);
  })()
};

async function duiReadT(key) {
  try {
    const r = await chrome.storage.sync.get(key + "#t");
    if (typeof r[key + "#t"] === "number") return r[key + "#t"];
  } catch (_) {}
  const r = await chrome.storage.local.get(key + "#t");
  return typeof r[key + "#t"] === "number" ? r[key + "#t"] : 0;
}

function duiSyncSend(message) {
  if (!DUI_SYNC.enabled) return Promise.resolve(null);
  try {
    return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}

function duiSyncPush(items) {
  return duiSyncSend({ dui: "push", items });
}

// 앱(iCloud)에서 최신 값을 받아 로컬에 병합한다. 바뀐 키는 storage.onChanged 로 전파된다
// wait: iCloud 에서 내려오는 변경을 기다릴 초. 팝업처럼 최신 값이 중요하면 길게, 페이지 로드는 짧게
function duiSyncPull(wait) {
  return duiSyncSend({ dui: "pull", wait: typeof wait === "number" ? wait : 0 });
}

// 팝업·백그라운드에서 쓴 설정을 열린 damoang 탭에 알린다. Safari 는 content script 에 storage.onChanged 가
// 오지 않아 탭이 옛 설정으로 그린다 (2026-09-03 iOS 확인). content script 자신은 tabs API 가 없어 건너뛴다
// 메시지와 함께, 확실히 닿는 경로로 탭 문서에 DOM 이벤트도 쏜다 (executeScript 는 설정 저장에 이미 쓰는 경로)
function duiNotifyTabs(key) {
  try {
    if (!chrome.tabs || !chrome.tabs.query) return;
    Promise.resolve(chrome.tabs.query({})).then((tabs) => {
      for (const t of tabs || []) {
        if (!t || typeof t.url !== "string" || !t.url.startsWith("https://damoang.net")) continue;
        try { Promise.resolve(chrome.tabs.sendMessage(t.id, { dui: "changed", key })).catch(() => {}); } catch (_) {}
        try {
          if (chrome.scripting && chrome.scripting.executeScript) {
            Promise.resolve(chrome.scripting.executeScript({
              target: { tabId: t.id },
              func: () => { window.dispatchEvent(new Event("dui-cfg-changed")); }
            })).catch(() => {});
          }
        } catch (_) {}
      }
    }).catch(() => {});
  } catch (_) {}
}

async function duiWrite(key, value, opts) {
  const o = opts || {};
  const t = typeof o.t === "number" ? o.t : Date.now();
  const s = JSON.stringify(value);
  const obj = {};
  const parts = [];
  for (let i = 0; i < s.length; i += DUI_CHUNK) parts.push(s.slice(i, i + DUI_CHUNK));
  parts.forEach((p, i) => { obj[key + "#" + i] = p; });
  obj[key + "#n"] = parts.length;
  obj[key + "#t"] = t;
  await chrome.storage.sync.set(obj);
  const stale = [];
  for (let i = parts.length; i < DUI_CHUNK_MAX; i++) stale.push(key + "#" + i);
  await chrome.storage.sync.remove(stale);
  await chrome.storage.local.remove([key, key + "#t"]);
  if (!o.fromSync) duiSyncPush([{ key, json: s, t }]);
  duiNotifyTabs(key);
}

async function duiRemove(key, opts) {
  const o = opts || {};
  const t = typeof o.t === "number" ? o.t : Date.now();
  const names = [key + "#n"];
  for (let i = 0; i < DUI_CHUNK_MAX; i++) names.push(key + "#" + i);
  await chrome.storage.sync.remove(names);
  await chrome.storage.sync.set({ [key + "#t"]: t });
  await chrome.storage.local.remove(key);
  if (!o.fromSync) duiSyncPush([{ key, json: null, t }]);
  duiNotifyTabs(key);
}

// onChanged 에서 이 키의 변경인지 판별한다 (sync 는 조각 키로 온다)
function duiChanged(changes, key) {
  if (changes[key]) return true;
  for (const k of Object.keys(changes)) {
    if (k.startsWith(key + "#")) return true;
  }
  return false;
}
