const API = "https://damoang.net/api/my/ui-settings";
const FAV_API = "https://damoang.net/api/v1/my/favorites";
const SITE = "https://damoang.net";

// 디버그는 설정 다이얼로그의 스위치로 켜는 정식 기능. 팝업을 닫아도 유지
let debugMode = localStorage.getItem("debug") === "1";

// 시뮬레이션 모드("logout"|"fail"|""). DEV 배지의 테스트 다이얼로그로 선택, 팝업을 닫아도 유지
let simMode = debugMode ? localStorage.getItem("debug-sim") || "" : "";

function dbg(...args) {
  if (debugMode) console.log("[dbg]", ...args);
}

// 화면모드("system"|"light"|"dark"). system이면 OS 설정을 따른다
let themeMode = localStorage.getItem("theme") || "system";

function applyTheme(mode) {
  if (mode === "light" || mode === "dark") {
    document.documentElement.dataset.theme = mode;
  } else {
    delete document.documentElement.dataset.theme;
  }
}
applyTheme(themeMode);

const FIELDS = [
  { key: "hideMemo",         label: "메모 배지 가리기" },
  { key: "hideMemoInList",   label: "목록 메모 배지 가리기" },
  { key: "blurMemo",         label: "메모 내용 흐리게" },
  { key: "expandMemoInList", label: "목록 메모 배지 넓게 표시" }
];

// 다모앙 내 페이지 바로가기. 개별 표시 여부는 설정 다이얼로그에서 고른다
const SHORTCUTS = [
  { caption: "활동내역", items: [
    { key: "points",    label: "포인트",   path: "/my/points" },
    { key: "exp",       label: "경험치",   path: "/my/exp" },
    { key: "scraps",    label: "스크랩",   path: "/my/scraps" },
    { key: "following", label: "팔로잉",   path: "/my/following" },
    { key: "blocked",   label: "차단목록", path: "/my/blocked" },
    { key: "memos",     label: "회원메모", path: "/my/memos" },
    { key: "reports",   label: "신고내역", path: "/my/reports" }
  ] },
  { caption: "설정", items: [
    { key: "settings",   label: "계정설정", path: "/member/settings" },
    { key: "settingsUi", label: "UI 설정",  path: "/member/settings/ui" }
  ] }
];

function loadHiddenShortcuts() {
  try {
    const arr = JSON.parse(localStorage.getItem("shortcut-hidden"));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}
let hiddenShortcuts = loadHiddenShortcuts();
// 이동 후 팝업 유지. 기본 켜짐. 끄면 이동하고 닫는다
let keepPopupShortcut = localStorage.getItem("shortcut-keep-open") !== "0";
let keepPopupFav = localStorage.getItem("fav-keep-open") !== "0";

const rowsEl = document.getElementById("rows");
const statusEl = document.getElementById("status");
const applyBtn = document.getElementById("apply");
const refreshBtn = document.getElementById("refresh");
const hideAllBtn = document.getElementById("hide-all");
const showAllBtn = document.getElementById("show-all");
const favoritesEl = document.getElementById("favorites");
const favSpinEl = document.getElementById("fav-spin");
const memoSpinEl = document.getElementById("memo-spin");
const memoGroupEl = document.getElementById("memo-group");
const memoHeadEl = document.getElementById("memo-head");
const shortcutGroupEl = document.getElementById("shortcut-group");
const shortcutHeadEl = document.getElementById("shortcut-head");
const shortcutsEl = document.getElementById("shortcuts");
const shortcutTogglesEl = document.getElementById("shortcut-toggles");
const shortcutSettingsBtn = document.getElementById("shortcut-settings-btn");
const shortcutDialog = document.getElementById("shortcut-dialog");
const keepSwitch = document.getElementById("shortcut-keep-switch");
const favSettingsBtn = document.getElementById("fav-settings-btn");
const favDialog = document.getElementById("fav-dialog");
const favKeepSwitch = document.getElementById("fav-keep-switch");
const gateEl = document.getElementById("gate");
const gateMsgEl = document.getElementById("gate-msg");
const gateBtn = document.getElementById("gate-btn");
const failEl = document.getElementById("fail");
const failMsgEl = document.getElementById("fail-msg");
const failBtn = document.getElementById("fail-btn");
const devBadgeEl = document.getElementById("dev-badge");
const devDialog = document.getElementById("dev-dialog");
const versionEl = document.getElementById("version");
const settingsBtn = document.getElementById("settings-btn");
const settingsDialog = document.getElementById("settings-dialog");
const themeSelect = document.getElementById("theme-select");
const debugSwitch = document.getElementById("debug-switch");
let damoangTab = null;
let baseline = {}; // 서버 기준값. 변경 여부 판정용

// 마지막으로 확인한 서버 값. 다음에 팝업을 열 때 이 값으로 먼저 그린다
const CACHE_KEY = "last-data";

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function saveCache(patch) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign(loadCache(), patch)));
  } catch (_) {}
}

function fieldValues(settings) {
  const out = {};
  for (const f of FIELDS) out[f.key] = !!settings[f.key];
  return out;
}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

// ---- 다모앙 탭에 주입해 실행하는 함수들. 세션 쿠키를 쓰기 위해 페이지 컨텍스트에서 fetch ----

async function readSettingsInPage(apiUrl, debug) {
  const log = (...a) => { if (debug) console.log("[다모앙UI]", ...a); };
  try {
    const res = await fetch(apiUrl, { credentials: "include", signal: AbortSignal.timeout(10000) });
    log("settings GET", res.status);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, loggedOut: true, error: "GET " + res.status };
    }
    if (!res.ok) return { ok: false, error: "GET " + res.status };
    // 로그인 페이지(HTML)가 오는 경우도 비로그인 처리
    const ct = res.headers.get("content-type") || "";
    if (res.redirected || !ct.includes("json")) {
      return { ok: false, loggedOut: true, error: "비로그인 응답" };
    }
    const data = await res.json();
    const settings = data && data.settings ? data.settings : data;
    if (!settings || typeof settings !== "object") {
      return { ok: false, error: "설정 형식을 인식하지 못함" };
    }
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: e && e.name === "TimeoutError" ? "응답 시간 초과" : String(e) };
  }
}

async function readFavoritesInPage(apiUrl, debug) {
  const log = (...a) => { if (debug) console.log("[다모앙UI]", ...a); };
  // 숫자 키가 표시 순서
  const toList = (obj) => {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj)
      .filter(k => obj[k] && typeof obj[k] === "object" && obj[k].boardId)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => ({ boardId: String(obj[k].boardId), title: String(obj[k].title || obj[k].boardId) }));
  };
  // 서버 값 우선
  try {
    const res = await fetch(apiUrl, { credentials: "include", signal: AbortSignal.timeout(10000) });
    log("favorites GET", res.status);
    if (res.ok) {
      const data = await res.json();
      const list = toList(data && data.data);
      if (list.length) return { ok: true, favorites: list, source: "api" };
    }
  } catch (e) {
    log("favorites GET 실패", String(e));
  }
  // localStorage 사본 폴백
  try {
    const raw = localStorage.getItem("angple-board-favorites");
    if (raw) {
      const list = toList(JSON.parse(raw));
      log("favorites localStorage 폴백", list.length);
      if (list.length) return { ok: true, favorites: list, source: "local" };
    }
  } catch (_) {}
  return { ok: true, favorites: [], source: "none" };
}

async function applySettingsInPage(apiUrl, values, debug) {
  const log = (...a) => { if (debug) console.log("[다모앙UI]", ...a); };
  try {
    // PUT은 전체 저장이므로 최신 설정을 받아 병합해야 다른 필드가 보존된다
    const getRes = await fetch(apiUrl, { credentials: "include", signal: AbortSignal.timeout(10000) });
    log("apply GET", getRes.status);
    if (!getRes.ok) return { ok: false, error: "GET " + getRes.status };
    const data = await getRes.json();
    const settings = data && data.settings ? data.settings : data;
    if (!settings || typeof settings !== "object") {
      return { ok: false, error: "설정 형식을 인식하지 못함" };
    }
    Object.assign(settings, values);
    const putRes = await fetch(apiUrl, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
      signal: AbortSignal.timeout(10000)
    });
    log("apply PUT", putRes.status, values);
    if (!putRes.ok) return { ok: false, error: "PUT " + putRes.status };
    // 사이트가 새로고침 첫 렌더에 쓰는 localStorage 사본도 같이 갱신해야 바로 반영된다
    try {
      const raw = localStorage.getItem("angple_ui_settings");
      if (raw) {
        const copy = JSON.parse(raw);
        Object.assign(copy, values);
        localStorage.setItem("angple_ui_settings", JSON.stringify(copy));
        log("localStorage 사본 갱신");
      }
    } catch (_) {
      // 사본이 없거나 깨져 있으면 무시. 페이지가 알아서 동기화한다
    }
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: e && e.name === "TimeoutError" ? "응답 시간 초과" : String(e) };
  }
}

// 다모앙(SvelteKit) 라우터가 가로채도록 링크 클릭으로 이동시킨다. 문서를 갈아끼우는 이동은
// 크롬이 새 문서에 포커스를 되돌리며 팝업을 닫지만, 클라이언트 이동은 그 경로를 타지 않는다.
// 라우터가 가로채지 않으면 일반 이동으로 떨어진다
function navigateInPage(url) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
}

// 타임아웃 시뮬레이션용. 영원히 끝나지 않아 runInTab 시간 제한에 걸린다
function hangInPage() {
  return new Promise(() => {});
}

// ---- 팝업 로직 ----

// 다모앙 탭을 url 로 이동. keep 이면 팝업을 열어 둔다: 현재 탭일 때는 라우터를 통한
// 클라이언트 이동으로 포커스를 건드리지 않고, 다른 탭이면 전환이 불가피해 크롬이 팝업을 닫는다
async function goToDamoang(url, keep) {
  if (!damoangTab) return;
  if (!keep) {
    chrome.tabs.update(damoangTab.id, { url, active: true });
    window.close();
    return;
  }
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current && current.id === damoangTab.id) {
    runInTab(navigateInPage, [url]);
  } else {
    chrome.tabs.update(damoangTab.id, { url, active: true });
  }
}

async function findDamoangTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && active.url && active.url.startsWith("https://damoang.net")) return active;
  const tabs = await chrome.tabs.query({ url: "https://damoang.net/*" });
  return tabs[0] || null;
}

// 응답 없는 탭에서 매달리지 않게 시간 제한을 두고, 실패는 던지지 않고 오류 객체로 돌려준다
async function runInTab(func, args, timeoutMs) {
  try {
    const [result] = await Promise.race([
      chrome.scripting.executeScript({
        target: { tabId: damoangTab.id },
        func,
        args
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("탭 응답 시간 초과")), timeoutMs || 15000)
      )
    ]);
    return (result && result.result) || { ok: false, error: "탭에서 결과를 받지 못함" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function currentUIValues() {
  const out = {};
  for (const f of FIELDS) {
    out[f.key] = document.getElementById("sw-" + f.key).checked;
  }
  return out;
}

function isDirty() {
  const ui = currentUIValues();
  return FIELDS.some(f => !!baseline[f.key] !== ui[f.key]);
}

function onLocalChange() {
  const dirty = isDirty();
  applyBtn.disabled = !dirty;
  setStatus(dirty ? "저장되지 않은 변경사항이 있습니다." : "");
}

// 비로그인, 탭 없음 차단막. 오버레이가 클릭을 막지만 키보드 포커스 대비로 컨트롤도 잠근다
function showGate(msg) {
  failEl.hidden = true;
  gateEl.hidden = false;
  gateMsgEl.textContent = msg;
  favSpinEl.hidden = true;
  memoSpinEl.hidden = true;
  setStatus("");
  setBusy(true);
  applyBtn.disabled = true;
}

// 로딩 실패 차단막. 오버레이가 클릭을 막지만 키보드 포커스 대비로 컨트롤도 잠근다
function showFail(msg) {
  failMsgEl.textContent = msg;
  failEl.hidden = false;
  setStatus("");
  setBusy(true);
  applyBtn.disabled = true;
}

function hideFail() {
  if (failEl.hidden) return;
  failEl.hidden = true;
  setBusy(false);
}

// 시뮬레이션 해제 때만 필요하다
function hideGate() {
  if (gateEl.hidden) return;
  gateEl.hidden = true;
  setBusy(false);
}

function renderFavorites(favorites) {
  favoritesEl.textContent = "";
  if (!favorites || !favorites.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "즐겨찾기가 없습니다";
    favoritesEl.append(empty);
    return;
  }
  for (const fav of favorites) {
    const row = document.createElement("div");
    row.className = "fav";
    row.textContent = fav.title;
    row.title = SITE + "/" + fav.boardId;
    row.addEventListener("click", () => {
      goToDamoang(SITE + "/" + fav.boardId, keepPopupFav);
      setStatus(fav.title + " 게시판으로 이동함");
    });
    favoritesEl.append(row);
  }
}

// 항목은 팝업이 열릴 때 바로 그리고, 값 수신 전까지 스위치를 비활성으로 둔다
function renderRows() {
  for (const f of FIELDS) {
    const row = document.createElement("div");
    row.className = "row";

    const label = document.createElement("label");
    label.textContent = f.label;
    label.htmlFor = "sw-" + f.key;

    const wrap = document.createElement("span");
    wrap.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "sw-" + f.key;
    input.disabled = true;
    const track = document.createElement("span");
    track.className = "track";
    track.addEventListener("click", () => input.click());

    input.addEventListener("change", onLocalChange);

    wrap.append(input, track);
    row.append(label, wrap);
    rowsEl.append(row);
  }
}

function renderShortcuts() {
  shortcutsEl.textContent = "";
  let shown = 0;
  for (const group of SHORTCUTS) {
    const items = group.items.filter(i => !hiddenShortcuts.has(i.key));
    if (!items.length) continue;
    const caption = document.createElement("div");
    caption.className = "sc-caption";
    caption.textContent = group.caption;
    const grid = document.createElement("div");
    grid.className = "sc-grid";
    for (const item of items) {
      const el = document.createElement("div");
      el.className = "sc";
      el.textContent = item.label;
      el.title = SITE + item.path;
      el.addEventListener("click", () => {
        goToDamoang(SITE + item.path, keepPopupShortcut);
        setStatus(item.label + " 페이지로 이동함");
      });
      grid.append(el);
      shown++;
    }
    shortcutsEl.append(caption, grid);
  }
  if (!shown) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "설정에서 바로가기를 켤 수 있습니다";
    shortcutsEl.append(empty);
  }
}

// 설정 다이얼로그의 바로가기 스위치들. 한 번만 만들고 상태는 change 로 반영
function renderShortcutToggles() {
  for (const group of SHORTCUTS) {
    const caption = document.createElement("div");
    caption.className = "opt-caption";
    caption.textContent = group.caption;
    const grid = document.createElement("div");
    grid.className = "opt-grid";
    for (const item of group.items) {
      const row = document.createElement("div");
      row.className = "opt-row";
      const label = document.createElement("label");
      label.textContent = item.label;
      label.htmlFor = "sc-" + item.key;
      const wrap = document.createElement("span");
      wrap.className = "switch";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = "sc-" + item.key;
      input.checked = !hiddenShortcuts.has(item.key);
      const track = document.createElement("span");
      track.className = "track";
      track.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        if (input.checked) hiddenShortcuts.delete(item.key);
        else hiddenShortcuts.add(item.key);
        localStorage.setItem("shortcut-hidden", JSON.stringify([...hiddenShortcuts]));
        renderShortcuts();
      });
      wrap.append(input, track);
      row.append(label, wrap);
      grid.append(row);
    }
    shortcutTogglesEl.append(caption, grid);
  }
}

function fillRows(settings) {
  for (const f of FIELDS) {
    const input = document.getElementById("sw-" + f.key);
    // 새 값이 도착하기 전에 사용자가 만진 스위치는 유지
    const touched = !input.disabled && input.checked !== !!baseline[f.key];
    baseline[f.key] = !!settings[f.key];
    if (!touched) input.checked = !!settings[f.key];
    input.disabled = false;
  }
}

function setAllDisabled(disabled) {
  rowsEl.querySelectorAll("input").forEach(i => (i.disabled = disabled));
}

function setBusy(busy) {
  setAllDisabled(busy);
  refreshBtn.disabled = busy;
  hideAllBtn.disabled = busy;
  showAllBtn.disabled = busy;
}

async function onApply() {
  setBusy(true);
  applyBtn.disabled = true;
  setStatus("저장 중…");
  const values = currentUIValues();
  dbg("apply", values);
  const r = await runInTab(applySettingsInPage, [API, values, debugMode], 25000);
  dbg("apply result", r);
  setBusy(false);
  if (r && r.ok) {
    // 서버 응답으로 동기화
    for (const f of FIELDS) {
      baseline[f.key] = !!r.settings[f.key];
      document.getElementById("sw-" + f.key).checked = !!r.settings[f.key];
    }
    saveCache({ settings: fieldValues(r.settings) });
    applyBtn.disabled = true;
    setStatus("적용됨 · 새로고침하면 화면에 반영됩니다.");
  } else {
    // 스위치 상태는 유지해서 바로 재시도할 수 있게 둔다
    applyBtn.disabled = !isDirty();
    setStatus("저장 실패: " + ((r && r.error) || "알 수 없는 오류"), true);
  }
}

function onRefresh() {
  chrome.tabs.reload(damoangTab.id);
  setStatus(isDirty() ? "새로고침함 · 저장되지 않은 변경사항이 있습니다." : "새로고침함");
}

// 배지 가리기 두 값을 현재 스위치 상태와 무관하게 덮어쓴다. 저장 성공 시 바로 새로고침
async function onBulk(hide) {
  setBusy(true);
  applyBtn.disabled = true;
  setStatus("저장 중…");
  dbg("bulk", hide);
  const r = await runInTab(applySettingsInPage, [API, { hideMemo: hide, hideMemoInList: hide }, debugMode], 25000);
  dbg("bulk result", r);
  setBusy(false);
  if (r && r.ok) {
    for (const key of ["hideMemo", "hideMemoInList"]) {
      baseline[key] = !!r.settings[key];
      document.getElementById("sw-" + key).checked = !!r.settings[key];
    }
    saveCache({ settings: fieldValues(r.settings) });
    applyBtn.disabled = !isDirty();
    chrome.tabs.reload(damoangTab.id);
    setStatus(isDirty() ? "적용 후 새로고침함 · 저장되지 않은 변경사항이 있습니다." : "적용 후 새로고침함");
  } else {
    applyBtn.disabled = !isDirty();
    setStatus("저장 실패: " + ((r && r.error) || "알 수 없는 오류"), true);
  }
}

async function loadData() {
  favSpinEl.hidden = false;
  memoSpinEl.hidden = false;
  const started = Date.now();
  const tick = setInterval(() => {
    setStatus("불러오는 중… " + Math.floor((Date.now() - started) / 1000) + "초 / 최대 15초");
  }, 500);
  let fav, r;
  try {
    [fav, r] = await Promise.all([
      runInTab(readFavoritesInPage, [FAV_API, debugMode]),
      runInTab(simMode === "timeout" ? hangInPage : readSettingsInPage, [API, debugMode])
    ]);
  } catch (e) {
    r = { ok: false, error: String(e) };
  } finally {
    clearInterval(tick);
  }
  if (simMode === "fail") r = { ok: false, error: "로딩 실패 시뮬레이션 (DEV)" };
  if (simMode === "logout") r = { ok: false, loggedOut: true };
  favSpinEl.hidden = true;
  memoSpinEl.hidden = true;
  dbg("favorites", fav);
  dbg("settings", r);
  if (r && r.loggedOut) {
    showGate("로그인이 필요한 기능입니다.");
    return false;
  }
  if (fav && fav.ok) {
    renderFavorites(fav.favorites);
    saveCache({ favorites: fav.favorites });
  }
  if (r && r.ok) {
    hideFail();
    fillRows(r.settings);
    saveCache({ settings: fieldValues(r.settings) });
    hideAllBtn.disabled = false;
    showAllBtn.disabled = false;
    onLocalChange();
    return true;
  }
  showFail("설정을 불러오지 못했습니다.\n" + ((r && r.error) || "알 수 없는 오류"));
  return false;
}

// 탭 새로고침 완료까지 대기. 10초가 지나면 그냥 진행
function reloadTabAndWait() {
  return new Promise(resolve => {
    const timer = setTimeout(done, 10000);
    function listener(tabId, info) {
      if (tabId === damoangTab.id && info.status === "complete") done();
    }
    function done() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.reload(damoangTab.id);
  });
}

async function onFailRetry() {
  failBtn.disabled = true;
  // 단계별 경과와 최대 대기를 같이 보여줘서 무한 대기로 오해하지 않게 한다
  const stage = { text: "다모앙 탭 새로고침 중", max: 10, started: Date.now() };
  const render = () => {
    const s = Math.floor((Date.now() - stage.started) / 1000);
    failMsgEl.textContent = stage.text + "… " + s + "초 / 최대 " + stage.max + "초";
  };
  render();
  const tick = setInterval(render, 500);
  try {
    damoangTab = await findDamoangTab();
    if (!damoangTab) {
      showGate("다모앙 탭을 먼저 열어주세요.");
      return;
    }
    await reloadTabAndWait();
    stage.text = "다시 불러오는 중";
    stage.max = 15;
    stage.started = Date.now();
    render();
    await loadData();
  } finally {
    clearInterval(tick);
    failBtn.disabled = false;
  }
}

function updateDevBadge() {
  const names = { logout: "비로그인", fail: "실패", timeout: "타임아웃" };
  devBadgeEl.textContent = simMode ? "DEV: " + names[simMode] : "DEV";
  devBadgeEl.classList.toggle("fail", !!simMode);
}

async function init() {
  const version = chrome.runtime.getManifest().version;
  versionEl.textContent = "v" + version;
  // 버전 페이지의 해당 버전 앵커로 (versions.md의 {#v0-1-0} 규칙과 짝)
  versionEl.href = "https://damoang-ui-extension.hobbyworker.me/versions/#v" + version.split(".").join("-");

  settingsBtn.addEventListener("click", () => {
    themeSelect.value = themeMode;
    debugSwitch.checked = debugMode;
    settingsDialog.showModal();
  });
  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });
  themeSelect.addEventListener("change", () => {
    themeMode = themeSelect.value;
    localStorage.setItem("theme", themeMode);
    applyTheme(themeMode);
  });
  document.querySelector("#settings-dialog .track").addEventListener("click", () => debugSwitch.click());
  debugSwitch.addEventListener("change", () => {
    debugMode = debugSwitch.checked;
    localStorage.setItem("debug", debugMode ? "1" : "0");
    // 끄면 걸려 있던 시뮬레이션도 함께 풀고 실제 데이터로 복귀
    simMode = debugMode ? localStorage.getItem("debug-sim") || "" : "";
    devBadgeEl.hidden = !debugMode;
    updateDevBadge();
    hideGate();
    if (damoangTab) loadData();
  });

  devBadgeEl.hidden = !debugMode;
  updateDevBadge();
  devBadgeEl.addEventListener("click", () => {
    for (const b of devDialog.querySelectorAll("button")) {
      b.classList.toggle("on", b.dataset.sim === simMode);
    }
    devDialog.showModal();
  });
  devDialog.addEventListener("click", (e) => {
    // 바깥(backdrop) 클릭은 닫기만
    if (e.target === devDialog) {
      devDialog.close();
      return;
    }
    const sim = e.target.dataset ? e.target.dataset.sim : undefined;
    if (sim === undefined) return;
    devDialog.close();
    simMode = sim;
    localStorage.setItem("debug-sim", simMode);
    updateDevBadge();
    hideGate();
    if (damoangTab) loadData();
  });
  renderRows();
  const cached = loadCache();
  dbg("cache", cached);
  if (cached.settings) fillRows(cached.settings);
  if (Array.isArray(cached.favorites) && cached.favorites.length) {
    renderFavorites(cached.favorites);
  }
  // 접힘 상태는 팝업을 닫아도 유지
  const setupCollapse = (el, head, key) => {
    if (localStorage.getItem(key) === "1") el.classList.add("collapsed");
    head.addEventListener("click", () => {
      localStorage.setItem(key, el.classList.toggle("collapsed") ? "1" : "0");
    });
  };
  setupCollapse(memoGroupEl, memoHeadEl, "memo-collapsed");
  setupCollapse(shortcutGroupEl, shortcutHeadEl, "shortcut-collapsed");
  renderShortcuts();
  renderShortcutToggles();
  // 제목 클릭(접기)과 겹치지 않게 전파를 끊는다
  shortcutSettingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    shortcutDialog.showModal();
  });
  shortcutDialog.addEventListener("click", (e) => {
    if (e.target === shortcutDialog) shortcutDialog.close();
  });
  keepSwitch.checked = keepPopupShortcut;
  keepSwitch.nextElementSibling.addEventListener("click", () => keepSwitch.click());
  keepSwitch.addEventListener("change", () => {
    keepPopupShortcut = keepSwitch.checked;
    localStorage.setItem("shortcut-keep-open", keepPopupShortcut ? "1" : "0");
  });

  favSettingsBtn.addEventListener("click", () => favDialog.showModal());
  favDialog.addEventListener("click", (e) => {
    if (e.target === favDialog) favDialog.close();
  });
  favKeepSwitch.checked = keepPopupFav;
  favKeepSwitch.nextElementSibling.addEventListener("click", () => favKeepSwitch.click());
  favKeepSwitch.addEventListener("change", () => {
    keepPopupFav = favKeepSwitch.checked;
    localStorage.setItem("fav-keep-open", keepPopupFav ? "1" : "0");
  });

  applyBtn.addEventListener("click", onApply);
  refreshBtn.addEventListener("click", onRefresh);
  hideAllBtn.addEventListener("click", () => onBulk(true));
  showAllBtn.addEventListener("click", () => onBulk(false));
  failBtn.addEventListener("click", onFailRetry);
  gateBtn.addEventListener("click", () => {
    if (damoangTab) {
      chrome.tabs.update(damoangTab.id, { url: SITE, active: true });
    } else {
      chrome.tabs.create({ url: SITE });
    }
    window.close();
  });

  damoangTab = await findDamoangTab();
  dbg("tab", damoangTab && damoangTab.id, damoangTab && damoangTab.url);
  if (!damoangTab) {
    showGate("다모앙 탭을 먼저 열어주세요.");
    return;
  }
  refreshBtn.disabled = false;
  await loadData();
}

init();
