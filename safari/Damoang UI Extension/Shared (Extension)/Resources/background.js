// Safari 전용 백그라운드. content script 는 네이티브 메시지를 보낼 수 없어
// 확장 페이지와 content script 의 동기화 요청을 여기서 앱(iCloud)으로 중계한다.
// 이 파일과 manifest 의 background, nativeMessaging 권한은 Safari 빌드에서만 주입된다.

async function native(message) {
  return browser.runtime.sendNativeMessage("application.id", message);
}

const SYNC_KEYS = ["highlight", "member", "pmenu", "emprio", "view", "qprofile"];

// 내려받은 뒤, 클라우드에 없거나 로컬이 더 새것인 항목은 올린다. 설정은 바꿀 때만 올라가므로
// 새 기기를 더했을 때 기존 기기의 오래된 설정이 넘어가지 않는 구멍을 여기서 메운다
async function pullFromCloud(wait) {
  const res = await native({ type: "pull", wait: typeof wait === "number" ? wait : 0 });
  if (!res || !res.ok) return { changed: [] };
  const changed = [];
  const cloud = {};
  for (const item of res.items || []) {
    cloud[item.key] = item;
    const localT = await duiReadT(item.key);
    if (!(item.t > localT)) continue;
    if (item.json === null || item.json === undefined) {
      await duiRemove(item.key, { fromSync: true, t: item.t });
    } else {
      let value;
      try { value = JSON.parse(item.json); } catch (_) { continue; }
      await duiWrite(item.key, value, { fromSync: true, t: item.t });
    }
    changed.push(item.key);
  }
  const up = [];
  for (const key of SYNC_KEYS) {
    const value = await duiRead(key);
    if (value === undefined) continue;
    const localT = await duiReadT(key);
    const c = cloud[key];
    if (c && !(localT > c.t)) continue;
    const t = localT || Date.now();
    if (!localT) await duiWrite(key, value, { fromSync: true, t });
    up.push({ key, json: JSON.stringify(value), t });
  }
  if (up.length) await native({ type: "push", items: up }).catch(() => {});
  return { changed, uploaded: up.map(i => i.key) };
}

// 올리는 도중에 들어온 변경은 키별 최신 것만 모아 다음 한 번으로 보낸다. 타이머로 미루면 안 된다 —
// 백그라운드 페이지는 응답을 마치면 잠들어 타이머가 사라진다. 응답은 실제 전송이 끝난 뒤에 보낸다
const pending = new Map();
let inflight = null;
function flushPush() {
  if (inflight) return inflight;
  if (!pending.size) return Promise.resolve();
  const batch = Array.from(pending.values());
  pending.clear();
  inflight = native({ type: "push", items: batch }).catch(() => {}).then(() => {
    inflight = null;
    return pending.size ? flushPush() : undefined;
  });
  return inflight;
}

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.dui !== "string") return false;
  if (msg.dui === "pull") {
    pullFromCloud(msg.wait).then(sendResponse, () => sendResponse({ changed: [] }));
    return true;
  }
  if (msg.dui === "push") {
    for (const it of msg.items || []) if (it && it.key) pending.set(it.key, it);
    flushPush().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

browser.runtime.onInstalled.addListener(() => { pullFromCloud(3).catch(() => {}); });
browser.runtime.onStartup.addListener(() => { pullFromCloud(3).catch(() => {}); });
