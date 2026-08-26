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

async function duiWrite(key, value) {
  const s = JSON.stringify(value);
  const obj = {};
  const parts = [];
  for (let i = 0; i < s.length; i += DUI_CHUNK) parts.push(s.slice(i, i + DUI_CHUNK));
  parts.forEach((p, i) => { obj[key + "#" + i] = p; });
  obj[key + "#n"] = parts.length;
  await chrome.storage.sync.set(obj);
  const stale = [];
  for (let i = parts.length; i < DUI_CHUNK_MAX; i++) stale.push(key + "#" + i);
  await chrome.storage.sync.remove(stale);
  await chrome.storage.local.remove(key);
}

// onChanged 에서 이 키의 변경인지 판별한다 (sync 는 조각 키로 온다)
function duiChanged(changes, key) {
  if (changes[key]) return true;
  for (const k of Object.keys(changes)) {
    if (k.startsWith(key + "#")) return true;
  }
  return false;
}
