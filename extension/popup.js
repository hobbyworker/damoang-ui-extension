const API = "https://damoang.net/api/my/ui-settings";
const FAV_API = "https://damoang.net/api/v1/my/favorites";
const SITE = "https://damoang.net";

const FIELDS = [
  { key: "hideMemo",         label: "메모 배지 가리기" },
  { key: "hideMemoInList",   label: "목록 메모 배지 가리기" },
  { key: "blurMemo",         label: "메모 내용 흐리게" },
  { key: "expandMemoInList", label: "목록 메모 배지 넓게 표시" }
];

const rowsEl = document.getElementById("rows");
const statusEl = document.getElementById("status");
const applyBtn = document.getElementById("apply");
const refreshBtn = document.getElementById("refresh");
const hideAllBtn = document.getElementById("hide-all");
const showAllBtn = document.getElementById("show-all");
const favoritesEl = document.getElementById("favorites");
const favSpinEl = document.getElementById("fav-spin");
const memoSpinEl = document.getElementById("memo-spin");
const columnsEl = document.getElementById("columns");
const gateEl = document.getElementById("gate");
const gateMsgEl = document.getElementById("gate-msg");
const gateBtn = document.getElementById("gate-btn");
const failEl = document.getElementById("fail");
const failMsgEl = document.getElementById("fail-msg");
const failBtn = document.getElementById("fail-btn");
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

async function readSettingsInPage(apiUrl) {
  try {
    const res = await fetch(apiUrl, { credentials: "include" });
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
    return { ok: false, error: String(e) };
  }
}

async function readFavoritesInPage(apiUrl) {
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
    const res = await fetch(apiUrl, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      const list = toList(data && data.data);
      if (list.length) return { ok: true, favorites: list, source: "api" };
    }
  } catch (_) {}
  // localStorage 사본 폴백
  try {
    const raw = localStorage.getItem("angple-board-favorites");
    if (raw) {
      const list = toList(JSON.parse(raw));
      if (list.length) return { ok: true, favorites: list, source: "local" };
    }
  } catch (_) {}
  return { ok: true, favorites: [], source: "none" };
}

async function applySettingsInPage(apiUrl, values) {
  try {
    // PUT은 전체 저장이므로 최신 설정을 받아 병합해야 다른 필드가 보존된다
    const getRes = await fetch(apiUrl, { credentials: "include" });
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
      body: JSON.stringify({ settings })
    });
    if (!putRes.ok) return { ok: false, error: "PUT " + putRes.status };
    // 사이트가 새로고침 첫 렌더에 쓰는 localStorage 사본도 같이 갱신해야 바로 반영된다
    try {
      const raw = localStorage.getItem("angple_ui_settings");
      if (raw) {
        const copy = JSON.parse(raw);
        Object.assign(copy, values);
        localStorage.setItem("angple_ui_settings", JSON.stringify(copy));
      }
    } catch (_) {
      // 사본이 없거나 깨져 있으면 무시. 페이지가 알아서 동기화한다
    }
    return { ok: true, settings };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ---- 팝업 로직 ----

async function findDamoangTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active && active.url && active.url.startsWith("https://damoang.net")) return active;
  const tabs = await chrome.tabs.query({ url: "https://damoang.net/*" });
  return tabs[0] || null;
}

async function runInTab(func, args) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: damoangTab.id },
    func,
    args
  });
  return result && result.result;
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

// 비로그인, 탭 없음 상태에서는 기능을 숨기고 이동 버튼만 노출
function showGate(msg) {
  columnsEl.hidden = true;
  statusEl.hidden = true;
  failEl.hidden = true;
  gateEl.hidden = false;
  gateMsgEl.textContent = msg;
}

// 로딩 실패 차단막. 오버레이가 클릭을 막지만 키보드 포커스 대비로 컨트롤도 잠근다
function showFail(msg) {
  failMsgEl.textContent = msg;
  failEl.hidden = false;
  setBusy(true);
  applyBtn.disabled = true;
}

function hideFail() {
  if (failEl.hidden) return;
  failEl.hidden = true;
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
      chrome.tabs.update(damoangTab.id, { url: SITE + "/" + fav.boardId, active: true });
      window.close();
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
  const r = await runInTab(applySettingsInPage, [API, currentUIValues()]);
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
  const r = await runInTab(applySettingsInPage, [API, { hideMemo: hide, hideMemoInList: hide }]);
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
  let fav, r;
  try {
    [fav, r] = await Promise.all([
      runInTab(readFavoritesInPage, [FAV_API]),
      runInTab(readSettingsInPage, [API])
    ]);
  } catch (e) {
    r = { ok: false, error: String(e) };
  }
  favSpinEl.hidden = true;
  memoSpinEl.hidden = true;
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
  failMsgEl.textContent = "다모앙 탭을 새로고침하고 다시 시도합니다…";
  damoangTab = await findDamoangTab();
  if (!damoangTab) {
    failBtn.disabled = false;
    showGate("다모앙 탭을 먼저 열어주세요.");
    return;
  }
  await reloadTabAndWait();
  await loadData();
  failBtn.disabled = false;
}

async function init() {
  renderRows();
  const cached = loadCache();
  if (cached.settings) fillRows(cached.settings);
  if (Array.isArray(cached.favorites) && cached.favorites.length) {
    renderFavorites(cached.favorites);
  }
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
  if (!damoangTab) {
    showGate("다모앙 탭을 먼저 열어주세요.");
    return;
  }
  refreshBtn.disabled = false;
  await loadData();
}

init();
