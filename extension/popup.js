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
const favoritesEl = document.getElementById("favorites");
const columnsEl = document.getElementById("columns");
const gateEl = document.getElementById("gate");
const gateMsgEl = document.getElementById("gate-msg");
const gateBtn = document.getElementById("gate-btn");
let damoangTab = null;
let baseline = {}; // 서버 기준값. 변경 여부 판정용

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
  gateEl.hidden = false;
  gateMsgEl.textContent = msg;
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

function render(settings) {
  rowsEl.textContent = "";
  for (const f of FIELDS) {
    baseline[f.key] = !!settings[f.key];

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
    input.checked = !!settings[f.key];
    const track = document.createElement("span");
    track.className = "track";
    track.addEventListener("click", () => input.click());

    input.addEventListener("change", onLocalChange);

    wrap.append(input, track);
    row.append(label, wrap);
    rowsEl.append(row);
  }
}

function setAllDisabled(disabled) {
  rowsEl.querySelectorAll("input").forEach(i => (i.disabled = disabled));
}

async function onApply() {
  setAllDisabled(true);
  applyBtn.disabled = true;
  refreshBtn.disabled = true;
  setStatus("저장 중…");
  const r = await runInTab(applySettingsInPage, [API, currentUIValues()]);
  setAllDisabled(false);
  refreshBtn.disabled = false;
  if (r && r.ok) {
    // 서버 응답으로 동기화
    for (const f of FIELDS) {
      baseline[f.key] = !!r.settings[f.key];
      document.getElementById("sw-" + f.key).checked = !!r.settings[f.key];
    }
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

async function init() {
  applyBtn.addEventListener("click", onApply);
  refreshBtn.addEventListener("click", onRefresh);
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
  const [fav, r] = await Promise.all([
    runInTab(readFavoritesInPage, [FAV_API]),
    runInTab(readSettingsInPage, [API])
  ]);
  if (r && r.loggedOut) {
    showGate("로그인이 필요한 기능입니다.");
    return;
  }
  if (fav && fav.ok) renderFavorites(fav.favorites);
  if (r && r.ok) {
    render(r.settings);
    setStatus("");
  } else {
    setStatus("설정을 불러오지 못했습니다: " + ((r && r.error) || "알 수 없는 오류"), true);
  }
}

init();
