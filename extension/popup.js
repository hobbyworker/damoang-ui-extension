const API = "https://damoang.net/api/my/ui-settings";
const FAV_API = "https://damoang.net/api/v1/my/favorites";
// Firefox MV3 는 host_permissions 를 선택 권한으로 다루므로 시작할 때 확인한다. Chrome 은 항상 true
const HOST_PERMISSION = { origins: ["https://damoang.net/*"] };
let gateMode = "open";
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

// 설정 그룹. key 는 다모앙 ui-settings 의 필드명. 전부 "빠른 설정" 섹션 안에 소제목으로 나뉘어
// 들어가고, 적용/새로고침은 모든 그룹에 걸린다
const SETTING_GROUPS = [
  { id: "memo", title: "메모 설정", fields: [
    { key: "hideMemo",         label: "메모 배지 가리기",        tip: "게시글 상세에서 메모 배지를 숨깁니다" },
    { key: "hideMemoInList",   label: "목록 메모 배지 가리기",   tip: "게시판 목록에서 메모 배지를 숨깁니다" },
    { key: "blurMemo",         label: "메모 내용 흐리게",        tip: "메모 배지의 내용을 블러 처리합니다 (호버 시 표시)" },
    { key: "expandMemoInList", label: "목록 메모 배지 넓게 표시", tip: "게시판 목록에서 메모를 화면 폭에 맞춰 넓게 보여줍니다 (끄면 좁게)" }
  ] },
  { id: "profile", title: "프로필 표시", fields: [
    { key: "hideMyProfile", label: "내 프로필 가리기", tip: "헤더와 사이드바에서 내 닉네임과 프로필 이미지를 숨깁니다" }
  ] }
];
const FIELDS = SETTING_GROUPS.flatMap(g => g.fields);

// 제목 필터링(뮤트) 키워드. ui-settings 의 muteKeywords 배열 그대로. 서버 상한 200개(2026-08-23 확인)
const MUTE_MAX = 200;

// 빠른 설정 소그룹. 각각 접을 수 있고, 옵션에서 표시 여부를 고른다
const SUBGROUPS = SETTING_GROUPS.map(g => ({ id: g.id, title: g.title }))
  .concat({ id: "mute", title: "제목 필터링 (뮤트)" });

// 제목 강조. chrome.storage.local 의 "highlight" 에 저장하고 content.js 가 읽는다. 기기별 설정.
// 그룹마다 색·키워드·일치 옵션을 갖는다. 키워드는 그룹을 통틀어 중복 불가
const HL_KEY = "highlight";
const HL_GROUP_MAX = 8;
const HL_WORD_MAX = 50;
const HL_PRESETS = {
  light: ["#fff176", "#c5e1a5", "#81d4fa", "#f8bbd0", "#ffcc80"],
  dark:  ["#9e6a03", "#238636", "#1f6feb", "#bf4b8a", "#bd561d"]
};
let hl = { groups: [] };
let hlCurrent = -1;

// 추가 기능 탭의 소그룹. 빠른 설정과 같은 방식으로 접기·표시 선택
const EXTRA_SUBGROUPS = [{ id: "em", title: "강조" }, { id: "view", title: "표시" }, { id: "ease", title: "편의성" }, { id: "menu", title: "메뉴" }];

// 표시 옵션. 목록 닉네임 칸 넓히기 등
const VIEW_KEY = "view";
let view = { wideNick: false, memberTab: true, dlgScroll: true };

// 프로필 메뉴. 헤더·사이드바의 마이페이지 링크를 메뉴로 바꾼다 (content.js 가 처리).
// 마이페이지 항목은 항상 표시라 목록에 없다
const PMENU_KEY = "pmenu";

// 빠른 프로필 보기. 프로필 URL 에서 뽑은 회원 아이디와 표시용 닉네임을 저장한다
const QP_KEY = "qprofile";
const QP_MAX = 30;
let qp = { btn: true, info: true, list: [] };
// 기본 켬. 메뉴 첫 항목이 마이페이지라 원래 이동을 잃지 않는다
const PMENU_ITEMS = [
  { key: "points", label: "포인트" },
  { key: "exp", label: "경험치" },
  { key: "scraps", label: "스크랩" },
  { key: "following", label: "팔로잉" },
  { key: "blocked", label: "차단목록" },
  { key: "memos", label: "회원메모" },
  { key: "reports", label: "신고내역" },
  { key: "settings", label: "계정설정" },
  { key: "settingsUi", label: "UI 설정" }
];
let pmenu = { on: true, hidden: [] };

// 강조 우선순위. 제목·사용자 강조가 한 행에 겹칠 때 어느 쪽 행 스타일을 쓸지
const PRIO_KEY = "emprio";
let emPrio = { first: "member" };

// 사용자 강조. chrome.storage.local 의 "member". 행의 글쓴이 닉네임으로 대조한다.
// 고정 첫 항목 "팔로우 회원" 은 서버 팔로우 목록 전체, 그 아래 그룹은 닉네임을 직접 등록.
// 그룹에 있는 닉네임은 그룹 스타일이 먼저, 나머지 팔로우 회원은 팔로우 스타일
const FOLLOW_KEY = "member";
const FOLLOW_MEMBER_MAX = 50;
const FOLLOW_API = "https://damoang.net/api/my/following";
const FOLLOW_GROUP_MAX = 8;
const FOLLOW_PRESETS = {
  lineLight: ["#1a73e8", "#1e8e3e", "#e8710a", "#d93025", "#8430ce"],
  lineDark:  ["#8ab4f8", "#81c995", "#fcad70", "#f28b82", "#c58af9"],
  bgLight:   ["#e8f0fe", "#e6f4ea", "#fef7e0", "#fce8e6", "#f3e8fd"],
  bgDark:    ["#1c2a3f", "#1b2e22", "#3a2f12", "#3b1f1c", "#2c1f3b"],
  fgLight:   ["#ffffff", "#1c1c1e"],
  fgDark:    ["#0d1117", "#f2f2f4"]
};
// 선·배경·마크는 기본 켜짐. 항목 전체 스위치(on)는 normalizeFollowStyle 이 정한다
const FOLLOW_STYLE = {
  on: true,
  comments: false,
  commentsBg: false,
  line: { on: true, type: "left", lightColor: "#1a73e8", darkColor: "#8ab4f8" },
  bg:   { on: true, lightColor: "#e8f0fe", darkColor: "#1c2a3f" },
  mark: { on: true, text: "★", lightBg: "#1a73e8", lightFg: "#ffffff", darkBg: "#8ab4f8", darkFg: "#0d1117" }
};
let follow = normalizeFollow(null);
let following = [];
let followingLoaded = false;
let followCurrent = -1;
const followSwatches = {};
let showExtraTips = localStorage.getItem("extra-tips") !== "0";

function loadHiddenSet(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}
let hiddenExtra = loadHiddenSet("extra-hidden");

function loadHiddenSubgroups() {
  try {
    const arr = JSON.parse(localStorage.getItem("settings-hidden"));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}
let hiddenSubgroups = loadHiddenSubgroups();
let muteKeywords = [];
let muteBaseline = [];
let muteLoaded = false;
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

// 스크린샷 모드가 함께 바꾸는 키. 범위("memo"|"memo-profile")는 빠른 실행 옵션에서 고른다
const SHOT_KEYS = ["hideMemo", "hideMemoInList"];
let shotScope = localStorage.getItem("shot-scope") || "memo-profile";
// 기능 설명 아이콘 표시. 섹션별로 따로 기억, 기본 켜짐
let showTips = localStorage.getItem("settings-tips") !== "0";
let showQuickTips = localStorage.getItem("quick-tips") !== "0";
// 빠른 실행에서 숨길 행. 팝업 전용 설정이라 localStorage
let quickHidden = [];
try {
  const v = JSON.parse(localStorage.getItem("quick-hidden"));
  if (Array.isArray(v)) quickHidden = v.filter(k => k === "shot" || k === "qp");
} catch (_) {}
// 이동 후 팝업 유지. 기본 켜짐. 끄면 이동하고 닫는다
let keepPopupShortcut = localStorage.getItem("shortcut-keep-open") !== "0";
let keepPopupFav = localStorage.getItem("fav-keep-open") !== "0";
// 자동 저장 간격(ms). 변경이 멈춘 뒤 이 시간이 지나면 저장. 설정에서 0.5~5초
const AUTOSAVE_MIN = 500;
const AUTOSAVE_MAX = 5000;
let autosaveDelay = Math.min(AUTOSAVE_MAX, Math.max(AUTOSAVE_MIN, Number(localStorage.getItem("autosave-delay")) || 800));

const rowsEl = document.getElementById("rows");
const groupsEl = document.getElementById("groups");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refresh");
const autosaveInput = document.getElementById("autosave-input");
const muteDialog = document.getElementById("mute-dialog");
const muteInput = document.getElementById("mute-input");
const muteAddBtn = document.getElementById("mute-add-btn");
const muteChipsEl = document.getElementById("mute-chips");
const muteMsgEl = document.getElementById("mute-msg");
const muteCountEl = document.getElementById("mute-count");
let muteManageBtn = null;
let muteRowCountEl = null;
const hlManageBtn = document.getElementById("hl-manage-btn");
const hlGroupCount = document.getElementById("hl-group-count");
const hlDialog = document.getElementById("hl-dialog");
const hlDlgCount = document.getElementById("hl-dlg-count");
const hlAddGroupBtn = document.getElementById("hl-add-group-btn");
const hlList = document.getElementById("hl-list");
const hlPartial = document.getElementById("hl-partial");
const hlIcase = document.getElementById("hl-icase");
const hlEmpty = document.getElementById("hl-empty");
const hlForm = document.getElementById("hl-form");
const hlOn = document.getElementById("hl-on");
const hlName = document.getElementById("hl-name");
const hlSwatches = { light: document.getElementById("hl-light-swatches"), dark: document.getElementById("hl-dark-swatches") };
const hlSwatchCtl = {};
const hlPrev = { light: document.getElementById("hl-prev-light"), dark: document.getElementById("hl-prev-dark") };
const hlPenPrev = { light: document.getElementById("hl-pen-prev-light"), dark: document.getElementById("hl-pen-prev-dark") };
const hlPenOn = document.getElementById("hl-pen-on");
const hlLineOn = document.getElementById("hl-line-on");
const hlLineType = document.getElementById("hl-line-type");
const hlBgOn = document.getElementById("hl-bg-on");
const hlMarkOn = document.getElementById("hl-mark-on");
const hlMarkText = document.getElementById("hl-mark-text");
const hlSecCtl = {};
const hlInput = document.getElementById("hl-input");
const hlAddBtn = document.getElementById("hl-add-btn");
const hlChips = document.getElementById("hl-chips");
const hlMsg = document.getElementById("hl-msg");
const hlCount = document.getElementById("hl-count");
const hlDeleteBtn = document.getElementById("hl-delete-btn");
const hlCloseBtn = document.getElementById("hl-close-btn");
const emGroupEl = document.getElementById("sg-em");
const emHeadEl = document.getElementById("em-head");
const viewGroupEl = document.getElementById("sg-view");
const viewHeadEl = document.getElementById("view-head");
const viewWideNickSwitch = document.getElementById("view-widenick-switch");
const viewMemberTabSwitch = document.getElementById("view-membertab-switch");
const viewDlgScrollSwitch = document.getElementById("view-dlgscroll-switch");
const easeGroupEl = document.getElementById("sg-ease");
const easeHeadEl = document.getElementById("ease-head");
const menuGroupEl = document.getElementById("sg-menu");
const menuHeadEl = document.getElementById("menu-head");
const pmenuSummary = document.getElementById("pmenu-summary");
const pmenuManageBtn = document.getElementById("pmenu-manage-btn");
const pmenuDialog = document.getElementById("pmenu-dialog");
const pmenuOn = document.getElementById("pmenu-on");
const pmenuInfoOn = document.getElementById("pmenu-info-on");
const pmenuTogglesEl = document.getElementById("pmenu-toggles");
const qpCountEl = document.getElementById("qp-count");
const qpOpenBtn = document.getElementById("qp-open-btn");
const qpDialog = document.getElementById("qp-dialog");
const qpInput = document.getElementById("qp-input");
const qpAddBtn = document.getElementById("qp-add-btn");
const qpMsgEl = document.getElementById("qp-msg");
const qpCntEl = document.getElementById("qp-cnt");
const qpListEl = document.getElementById("qp-list");
const qpbSummary = document.getElementById("qpb-summary");
const qpbManageBtn = document.getElementById("qpb-manage-btn");
const qpbDialog = document.getElementById("qpb-dialog");
const qpbOn = document.getElementById("qpb-on");
const qpbInfoOn = document.getElementById("qpb-info-on");
const followSummary = document.getElementById("follow-summary");
const followManageBtn = document.getElementById("follow-manage-btn");
const followDialog = document.getElementById("follow-dialog");
const followPrev = { light: document.getElementById("follow-prev-light"), dark: document.getElementById("follow-prev-dark") };
const followDlgCount = document.getElementById("follow-dlg-count");
const followAddGroupBtn = document.getElementById("follow-add-group-btn");
const followList = document.getElementById("follow-list");
const followTotal = document.getElementById("follow-total");
const followReloadBtn = document.getElementById("follow-reload-btn");
const followForm = document.getElementById("follow-form");
const followNameRow = document.getElementById("follow-name-row");
const followName = document.getElementById("follow-name");
const followDefaultNote = document.getElementById("follow-default-note");
const followDefaultCount = document.getElementById("follow-default-count");
const followMembers = document.getElementById("follow-members");
const followMemberInput = document.getElementById("follow-member-input");
const followNicks = document.getElementById("follow-nicks");
const followMemberAddBtn = document.getElementById("follow-member-add-btn");
const followChips = document.getElementById("follow-chips");
const followMsg = document.getElementById("follow-msg");
const followMemberCount = document.getElementById("follow-member-count");
const followDeleteBtn = document.getElementById("follow-delete-btn");
const followCloseBtn = document.getElementById("follow-close-btn");
const followOn = document.getElementById("follow-on");
const followCommentsOn = document.getElementById("follow-comments-on");
const followCommentsBg = document.getElementById("follow-comments-bg");
const followLineOn = document.getElementById("follow-line-on");
const followLineType = document.getElementById("follow-line-type");
const followBgOn = document.getElementById("follow-bg-on");
const followMarkOn = document.getElementById("follow-mark-on");
const followMarkText = document.getElementById("follow-mark-text");
const extraGroupEl = document.getElementById("extra-group");
const extraOptBtn = document.getElementById("extra-opt-btn");
const extraOptDialog = document.getElementById("extra-opt-dialog");
const extraTipsSwitch = document.getElementById("extra-tips-switch");
const extraTogglesEl = document.getElementById("extra-toggles");
const emPrioSelect = document.getElementById("em-prio-select");
const shotOnBtn = document.getElementById("shot-on");
const shotOffBtn = document.getElementById("shot-off");
const quickGroupEl = document.getElementById("quick-group");
const quickHeadEl = document.getElementById("quick-head");
const quickSettingsBtn = document.getElementById("quick-settings-btn");
const quickDialog = document.getElementById("quick-dialog");
const shotScopeSelect = document.getElementById("shot-scope-select");
const quickTipsSwitch = document.getElementById("quick-tips-switch");
const quickRowShot = document.getElementById("quick-row-shot");
const quickRowQp = document.getElementById("quick-row-qp");
const quickShowShot = document.getElementById("quick-show-shot");
const quickShowQp = document.getElementById("quick-show-qp");
const favoritesEl = document.getElementById("favorites");
const favSpinEl = document.getElementById("fav-spin");
const memoSpinEl = document.getElementById("memo-spin");
const settingsGroupEl = document.getElementById("settings-group");
const subgroupTogglesEl = document.getElementById("subgroup-toggles");
const settingsOptBtn = document.getElementById("settings-opt-btn");
const settingsOptDialog = document.getElementById("settings-opt-dialog");
const tipsSwitch = document.getElementById("tips-switch");
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
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const ioMsg = document.getElementById("io-msg");
const resetBtn = document.getElementById("reset-btn");
const resetConfirmEl = document.getElementById("reset-confirm");
const resetHoldBtn = document.getElementById("reset-hold-btn");
const resetCancelBtn = document.getElementById("reset-cancel-btn");
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

async function readFollowingInPage(apiUrl, debug) {
  const log = (...a) => { if (debug) console.log("[다모앙UI]", ...a); };
  try {
    const res = await fetch(apiUrl, { credentials: "include", signal: AbortSignal.timeout(10000) });
    log("following GET", res.status);
    if (!res.ok) return { ok: false, error: "HTTP " + res.status };
    const data = await res.json();
    const list = Array.isArray(data && data.data) ? data.data : [];
    return {
      ok: true,
      following: list
        .map(m => ({ id: String(m.mb_id || ""), nick: String(m.mb_nick || "").trim() }))
        .filter(m => m.id && m.nick)
    };
  } catch (e) {
    log("following GET 실패", String(e));
    return { ok: false, error: String(e) };
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
    // Firefox 에서 res.json() 은 페이지 쪽 객체(Xray)라 확장 쪽 배열을 붙일 수 없다. 텍스트로 받아 여기서 파싱
    const data = JSON.parse(await getRes.text());
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

// 프로필 페이지에서 닉네임(title "닉네임 프로필 | Angple")과 아이디(헤더의 회색 표기)를 뽑는다.
// 닉네임 URL 도 서버 HTML 헤더까지는 정상이라 닉네임 입력을 아이디로 변환할 수 있다.
// 화면 이동은 닉네임 URL 에 버그가 있어 항상 아이디로 한다
function fetchMemberInPage(q) {
  return fetch("/member/" + encodeURIComponent(q))
    .then(async r => {
      if (!r.ok) return { ok: false, error: "HTTP " + r.status };
      const html = await r.text();
      const name = html.match(/<title>(.*?) 프로필 \| Angple<\/title>/);
      const id = html.match(/<h1[\s\S]{0,600}?<p[^>]*class="[^"]*text-muted-foreground[^"]*"[^>]*>\s*([A-Za-z0-9_.-]+)\s*<\/p>/);
      return { ok: true, name: name ? name[1] : "", id: id ? id[1] : "" };
    })
    .catch(e => ({ ok: false, error: String(e) }));
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

function isMuteDirty() {
  return muteLoaded && !sameList(muteKeywords, muteBaseline);
}

function isDirty() {
  const ui = currentUIValues();
  return FIELDS.some(f => !!baseline[f.key] !== ui[f.key]) || isMuteDirty();
}

let autosaveTimer = null;
let saving = false;

function onLocalChange() {
  scheduleAutosave();
}

// 변경이 멈춘 뒤 autosaveDelay 가 지나면 저장한다
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (!isDirty()) {
    if (!saving) setStatus("");
    return;
  }
  setStatus("잠시 후 저장됩니다…");
  autosaveTimer = setTimeout(autosave, autosaveDelay);
}

// 변경된 키만 병합 저장. 실패하면 그 키들의 스위치를 서버 값으로 되돌린다.
// 저장 중에 또 바뀐 것은 끝난 뒤 이어서 저장한다
async function autosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  if (saving) return;
  const ui = currentUIValues();
  const values = {};
  for (const f of FIELDS) {
    if (!!baseline[f.key] !== ui[f.key]) values[f.key] = ui[f.key];
  }
  const keys = Object.keys(values);
  const muteSent = isMuteDirty() ? muteKeywords.slice() : null;
  if (muteSent) values.muteKeywords = muteSent;
  if (!keys.length && !muteSent) {
    setStatus("");
    return;
  }
  saving = true;
  setStatus("저장 중…");
  dbg("autosave", values);
  const r = await runInTab(applySettingsInPage, [API, values, debugMode], 25000);
  dbg("autosave result", r);
  saving = false;
  if (r && r.ok) {
    for (const key of keys) baseline[key] = !!r.settings[key];
    if (muteSent) {
      muteBaseline = Array.isArray(r.settings.muteKeywords) ? r.settings.muteKeywords.map(String) : muteSent;
      // 저장 중에 더 바꾸지 않았으면 서버 값으로 맞춘다
      if (sameList(muteKeywords, muteSent)) muteKeywords = muteBaseline.slice();
      renderMute();
    }
    saveCache({ settings: fieldValues(r.settings), mute: muteBaseline });
    setStatus("저장됨 · 새로고침하면 화면에 반영됩니다.");
  } else {
    for (const key of keys) document.getElementById("sw-" + key).checked = !!baseline[key];
    if (muteSent) {
      muteKeywords = muteBaseline.slice();
      renderMute();
    }
    setStatus("저장 실패: " + ((r && r.error) || "알 수 없는 오류"), true);
  }
  if (isDirty()) scheduleAutosave();
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
}

// 로딩 실패 차단막. 오버레이가 클릭을 막지만 키보드 포커스 대비로 컨트롤도 잠근다
function showFail(msg) {
  failMsgEl.textContent = msg;
  failEl.hidden = false;
  setStatus("");
  setBusy(true);
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

// data-tip 요소를 클릭하면 아래(공간이 없으면 위)에 툴팁. 다시 클릭하거나 다른 곳을 클릭하면 닫힌다
function setupTooltips() {
  const tip = document.getElementById("tip");
  let current = null;
  const hide = () => {
    if (tip.matches(":popover-open")) tip.hidePopover();
    current = null;
  };
  // Esc 로 다이얼로그를 닫으면 클릭이 없으므로 따로 닫는다
  for (const d of document.querySelectorAll("dialog")) d.addEventListener("close", hide);
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-tip]");
    // 라벨 안의 아이콘이면 스위치 토글로 번지지 않게
    if (el) e.preventDefault();
    if (!el || el === current) {
      hide();
      return;
    }
    tip.textContent = el.dataset.tip;
    tip.showPopover();
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = r.top - h - 6;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = top + "px";
    current = el;
  });
}

// 상단 탭. 마지막 탭을 기억한다
function setupTabs() {
  const tabs = document.querySelectorAll("#tabs .tab");
  const pages = document.querySelectorAll(".page");
  const activate = (name) => {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    pages.forEach(p => p.classList.toggle("active", p.id === "page-" + name));
    localStorage.setItem("tab", name);
  };
  tabs.forEach(t => t.addEventListener("click", () => activate(t.dataset.tab)));
  const saved = localStorage.getItem("tab");
  activate(saved === "extra" ? "extra" : "settings");
}

// 접힘 상태는 팝업을 닫아도 유지
function setupCollapse(el, head, key) {
  if (localStorage.getItem(key) === "1") el.classList.add("collapsed");
  head.addEventListener("click", () => {
    localStorage.setItem(key, el.classList.toggle("collapsed") ? "1" : "0");
  });
}

// 빠른 설정 안의 소그룹 한 칸. 제목(접기) + 행 컨테이너
function makeSubgroup(id, title) {
  const section = document.createElement("section");
  section.className = "subgroup";
  section.id = "sg-" + id;
  const head = document.createElement("div");
  head.className = "caption group-head";
  const chev = document.createElement("span");
  chev.className = "chev";
  head.append(chev, title);
  const rows = document.createElement("div");
  rows.className = "rows";
  section.append(head, rows);
  setupCollapse(section, head, "sg-" + id + "-collapsed");
  rowsEl.append(section);
  return rows;
}

function applySubgroupVisibility() {
  for (const g of SUBGROUPS) {
    const el = document.getElementById("sg-" + g.id);
    if (el) el.hidden = hiddenSubgroups.has(g.id);
  }
}

// 옵션 다이얼로그의 표시할 항목 스위치들
function renderSubgroupToggles() {
  for (const g of SUBGROUPS) {
    const row = document.createElement("div");
    row.className = "opt-row";
    const label = document.createElement("label");
    label.textContent = g.title;
    label.htmlFor = "sg-toggle-" + g.id;
    const wrap = document.createElement("span");
    wrap.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "sg-toggle-" + g.id;
    input.checked = !hiddenSubgroups.has(g.id);
    const track = document.createElement("span");
    track.className = "track";
    track.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.checked) hiddenSubgroups.delete(g.id);
      else hiddenSubgroups.add(g.id);
      localStorage.setItem("settings-hidden", JSON.stringify([...hiddenSubgroups]));
      applySubgroupVisibility();
    });
    wrap.append(input, track);
    row.append(label, wrap);
    subgroupTogglesEl.append(row);
  }
}

// 항목은 팝업이 열릴 때 바로 그리고, 값 수신 전까지 스위치를 비활성으로 둔다.
// 소그룹마다 접을 수 있고 전부 "빠른 설정" 섹션 안에 들어간다
function renderRows() {
  for (const group of SETTING_GROUPS) {
    const container = makeSubgroup(group.id, group.title);
    for (const f of group.fields) {
      const row = document.createElement("div");
      row.className = "row";

      const label = document.createElement("label");
      label.textContent = f.label;
      label.htmlFor = "sw-" + f.key;
      if (f.tip) {
        const info = document.createElement("span");
        info.className = "info";
        info.dataset.tip = f.tip;
        info.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5"/><circle cx="10" cy="6.3" r=".6" fill="currentColor" stroke="none"/></svg>';
        label.append(info);
      }

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
      container.append(row);
    }
  }
  renderMuteRow();
  applySubgroupVisibility();
}

// 뮤트 소그룹. 개수와 관리 버튼만 두고 편집은 다이얼로그에서
function renderMuteRow() {
  const container = makeSubgroup("mute", "제목 필터링 (뮤트)");
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("label");
  label.textContent = "뮤트 키워드";
  const info = document.createElement("span");
  info.className = "info";
  info.dataset.tip = "특정 단어가 포함된 게시글을 목록에서 숨깁니다.";
  info.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5"/><circle cx="10" cy="6.3" r=".6" fill="currentColor" stroke="none"/></svg>';
  label.append(info);
  const right = document.createElement("span");
  right.className = "quick-btns";
  muteRowCountEl = document.createElement("span");
  muteRowCountEl.className = "count";
  muteManageBtn = document.createElement("button");
  muteManageBtn.textContent = "관리";
  muteManageBtn.disabled = true;
  muteManageBtn.addEventListener("click", () => {
    muteMsgEl.textContent = "";
    muteInput.value = "";
    muteDialog.showModal();
    muteInput.focus();
  });
  right.append(muteRowCountEl, muteManageBtn);
  row.append(label, right);
  container.append(row);
  renderMute();
}

function renderMute() {
  muteRowCountEl.textContent = muteLoaded ? muteKeywords.length + "개" : "";
  muteCountEl.textContent = muteKeywords.length + " / " + MUTE_MAX;
  muteChipsEl.textContent = "";
  for (const word of muteKeywords) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.append(word);
    const x = document.createElement("button");
    x.textContent = "×";
    x.title = "삭제";
    x.addEventListener("click", () => {
      muteKeywords = muteKeywords.filter(w => w !== word);
      muteMsgEl.textContent = "";
      renderMute();
      scheduleAutosave();
    });
    chip.append(x);
    muteChipsEl.append(chip);
  }
  const full = muteKeywords.length >= MUTE_MAX;
  muteInput.disabled = full;
  muteAddBtn.disabled = full;
}

function addMuteKeyword() {
  const word = muteInput.value.trim();
  if (!word) return;
  if (muteKeywords.includes(word)) {
    muteMsgEl.textContent = "이미 있는 키워드입니다";
    return;
  }
  if (muteKeywords.length >= MUTE_MAX) {
    muteMsgEl.textContent = "최대 " + MUTE_MAX + "개까지 등록할 수 있습니다";
    return;
  }
  muteKeywords = muteKeywords.concat(word);
  muteInput.value = "";
  muteMsgEl.textContent = "";
  renderMute();
  scheduleAutosave();
}

// 서버(또는 캐시) 값 반영. 새 값이 오기 전에 사용자가 편집한 목록은 유지한다
function fillMute(settings) {
  const server = Array.isArray(settings.muteKeywords) ? settings.muteKeywords.map(String) : [];
  const touched = isMuteDirty();
  muteBaseline = server;
  if (!touched) muteKeywords = server.slice();
  muteLoaded = true;
  muteManageBtn.disabled = false;
  renderMute();
}

function renderShortcuts() {
  shortcutsEl.textContent = "";
  let shown = 0;
  for (const group of SHORTCUTS) {
    const items = group.items.filter(i => !hiddenShortcuts.has(i.key));
    if (!items.length) continue;
    const caption = document.createElement("div");
    caption.className = "caption";
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
  const caption = document.createElement("div");
  caption.className = "opt-caption";
  caption.textContent = "표시할 항목";
  const grid = document.createElement("div");
  grid.className = "opt-grid";
  shortcutTogglesEl.append(caption, grid);
  for (const group of SHORTCUTS) {
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

// 프리셋 원 + 직접 지정. 한 번만 만들고 선택 표시만 mark() 로 갱신한다
// (매번 다시 만들면 열려 있는 색상 선택기가 닫힌다)
function makeSwatches(box, presets, onPick) {
  const btns = [];
  for (const c of presets) {
    const b = document.createElement("button");
    b.className = "swatch";
    b.dataset.color = c;
    b.style.background = c;
    b.title = c;
    b.addEventListener("click", () => onPick(c));
    box.append(b);
    btns.push(b);
  }
  const custom = document.createElement("input");
  custom.type = "color";
  custom.title = "직접 지정";
  custom.addEventListener("input", () => onPick(custom.value));
  box.append(custom);
  return {
    mark(color) {
      for (const b of btns) b.classList.toggle("on", b.dataset.color.toLowerCase() === color.toLowerCase());
      if (custom.value.toLowerCase() !== color.toLowerCase()) custom.value = color;
    }
  };
}

// ---- 사용자 강조 ----

// 팔로우 회원 항목은 기본 꺼짐, 그룹은 만들 때 켜짐
function normalizeFollowStyle(raw, onDefault) {
  const out = JSON.parse(JSON.stringify(FOLLOW_STYLE));
  out.on = onDefault;
  if (!raw || typeof raw !== "object") return out;
  if (typeof raw.on === "boolean") out.on = raw.on;
  if (typeof raw.comments === "boolean") out.comments = raw.comments;
  if (typeof raw.commentsBg === "boolean") out.commentsBg = raw.commentsBg;
  else if (typeof raw.commentsNoBg === "boolean") out.commentsBg = !raw.commentsNoBg;
  for (const sec of ["line", "bg", "mark"]) {
    const src = raw[sec];
    if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(out[sec])) {
      if (typeof src[k] === typeof out[sec][k]) out[sec][k] = src[k];
    }
  }
  if (out.line.type !== "box") out.line.type = "left";
  out.mark.text = String(out.mark.text).trim().slice(0, 6) || "★";
  return out;
}

function normalizeFollow(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const out = { follow: normalizeFollowStyle(r.follow, false), groups: [] };
  const src = Array.isArray(r.groups) ? r.groups : [];
  out.groups = src.slice(0, FOLLOW_GROUP_MAX).map((g, i) => ({
    name: String(g.name || "그룹 " + (i + 1)).slice(0, 12),
    style: normalizeFollowStyle(g.style, true),
    members: (Array.isArray(g.members) ? g.members : []).map(m => String(m).trim()).filter(Boolean).slice(0, FOLLOW_MEMBER_MAX)
  }));
  return out;
}

function saveFollow() {
  duiWrite(FOLLOW_KEY, follow).catch(e => setStatus("강조 설정 저장 실패: " + (e && e.message ? e.message : e)));
}

function styleOn(s) {
  return s.on && (s.line.on || s.bg.on || s.mark.on);
}

function followItem() {
  return followCurrent < 0 ? { name: "팔로우 회원", style: follow.follow } : follow.groups[followCurrent];
}

function findMember(nick) {
  return follow.groups.findIndex(g => g.members.includes(nick));
}

// 그룹에 없는 팔로우 회원 수
function followRestCount() {
  const all = new Set();
  for (const g of follow.groups) for (const m of g.members) all.add(m);
  return following.filter(m => !all.has(m.nick)).length;
}

function fillFollowing(list) {
  following = list;
  followingLoaded = true;
  followNicks.textContent = "";
  for (const m of following) {
    const o = document.createElement("option");
    o.value = m.nick;
    followNicks.append(o);
  }
  if (followDialog.open) renderFollowDialog();
}

function renderFollowRow() {
  const parts = [];
  if (styleOn(follow.follow)) parts.push("팔로우");
  const gn = follow.groups.filter(g => styleOn(g.style) && g.members.length).length;
  if (gn) parts.push("그룹 " + gn);
  followSummary.textContent = parts.length ? parts.join(", ") : "꺼짐";
}

// 미리보기 한 칸. content.js 가 행에 그리는 것과 같은 규칙
function paintFollowPreview(el, s, dark) {
  const lineColor = dark ? s.line.darkColor : s.line.lightColor;
  el.style.boxShadow = s.line.on
    ? (s.line.type === "box" ? "inset 0 0 0 2px " + lineColor : "inset 3px 0 0 " + lineColor)
    : "";
  el.style.background = s.bg.on ? (dark ? s.bg.darkColor : s.bg.lightColor) : "";
  let m = el.querySelector(".m");
  if (s.mark.on) {
    if (!m) {
      m = document.createElement("span");
      m.className = "m";
      el.prepend(m);
    }
    m.textContent = s.mark.text;
    m.style.background = dark ? s.mark.darkBg : s.mark.lightBg;
    m.style.color = dark ? s.mark.darkFg : s.mark.lightFg;
  } else if (m) {
    m.remove();
  }
}

function paintFollowPreviews() {
  const s = followItem().style;
  paintFollowPreview(followPrev.light, s, false);
  paintFollowPreview(followPrev.dark, s, true);
}

// 왼쪽 목록. 맨 위는 고정 항목 "팔로우 회원"
function renderFollowList() {
  followDlgCount.textContent = follow.groups.length + " / " + FOLLOW_GROUP_MAX;
  followAddGroupBtn.disabled = follow.groups.length >= FOLLOW_GROUP_MAX;
  followList.textContent = "";
  const items = [{ name: "팔로우 회원", count: followingLoaded ? followRestCount() : "", idx: -1 }]
    .concat(follow.groups.map((g, i) => ({ name: g.name, count: g.members.length, idx: i })));
  for (const it of items) {
    const item = document.createElement("div");
    const enabled = it.idx < 0 ? follow.follow.on : follow.groups[it.idx].style.on;
    item.className = "hl-item" + (it.idx === followCurrent ? " on" : "") + (enabled ? "" : " off");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = it.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = it.count;
    item.append(name, count);
    item.addEventListener("click", () => selectFollowItem(it.idx));
    followList.append(item);
  }
  followTotal.textContent = followingLoaded ? "팔로우 " + following.length + "명" : "팔로우 목록 없음";
}

// 오른쪽 편집. 그룹이면 이름·회원, 고정 항목이면 안내문
function renderFollowEditor() {
  const isGroup = followCurrent >= 0;
  const it = followItem();
  const s = it.style;
  followNameRow.hidden = !isGroup;
  followMembers.hidden = !isGroup;
  followDefaultNote.hidden = isGroup;
  followDeleteBtn.hidden = !isGroup;
  if (isGroup) {
    if (followName.value !== it.name) followName.value = it.name;
    const followed = new Set(following.map(m => m.nick));
    followChips.textContent = "";
    for (const nick of it.members) {
      const chip = document.createElement("span");
      chip.className = "chip";
      if (followingLoaded && followed.has(nick)) chip.title = "팔로우 중";
      chip.append(nick);
      const x = document.createElement("button");
      x.textContent = "×";
      x.title = "삭제";
      x.addEventListener("click", () => {
        it.members = it.members.filter(o => o !== nick);
        followMsg.textContent = "";
        saveFollow();
        renderFollowDialog();
      });
      chip.append(x);
      followChips.append(chip);
    }
    followMemberCount.textContent = it.members.length + " / " + FOLLOW_MEMBER_MAX;
    const full = it.members.length >= FOLLOW_MEMBER_MAX;
    followMemberInput.disabled = full;
    followMemberAddBtn.disabled = full;
  } else {
    followDefaultCount.textContent = followingLoaded ? String(followRestCount()) : "?";
  }
  followOn.checked = s.on;
  followForm.classList.toggle("off", !s.on);
  followCommentsOn.checked = s.comments;
  followCommentsBg.checked = s.commentsBg;
  followLineOn.checked = s.line.on;
  followLineType.value = s.line.type;
  followBgOn.checked = s.bg.on;
  followMarkOn.checked = s.mark.on;
  if (followMarkText.value !== s.mark.text) followMarkText.value = s.mark.text;
  followLineOn.closest(".follow-sec").classList.toggle("off", !s.line.on);
  followBgOn.closest(".follow-sec").classList.toggle("off", !s.bg.on);
  followMarkOn.closest(".follow-sec").classList.toggle("off", !s.mark.on);
  followSwatches.lineLight.mark(s.line.lightColor);
  followSwatches.lineDark.mark(s.line.darkColor);
  followSwatches.bgLight.mark(s.bg.lightColor);
  followSwatches.bgDark.mark(s.bg.darkColor);
  followSwatches.markLightBg.mark(s.mark.lightBg);
  followSwatches.markLightFg.mark(s.mark.lightFg);
  followSwatches.markDarkBg.mark(s.mark.darkBg);
  followSwatches.markDarkFg.mark(s.mark.darkFg);
  paintFollowPreviews();
}

function renderFollowDialog() {
  renderFollowList();
  renderFollowEditor();
  renderFollowRow();
}

function selectFollowItem(i) {
  followCurrent = i;
  followMsg.textContent = "";
  followMemberInput.value = "";
  followDeleteBtn.textContent = "그룹 삭제";
  followForm.scrollTop = 0;
  renderFollowDialog();
}

function addFollowGroup() {
  if (follow.groups.length >= FOLLOW_GROUP_MAX) return;
  const used = new Set(follow.groups.map(g => g.name));
  let n = 1;
  while (used.has("그룹 " + n)) n++;
  follow.groups.push({ name: "그룹 " + n, style: normalizeFollowStyle(null, true), members: [] });
  saveFollow();
  selectFollowItem(follow.groups.length - 1);
  followName.focus();
  followName.select();
}

function addFollowMember() {
  const g = follow.groups[followCurrent];
  const nick = followMemberInput.value.trim();
  if (!g || !nick) return;
  const at = findMember(nick);
  if (at >= 0) {
    followMsg.textContent = at === followCurrent ? "이미 있는 닉네임입니다" : "'" + follow.groups[at].name + "'에 이미 있는 닉네임입니다";
    return;
  }
  if (g.members.length >= FOLLOW_MEMBER_MAX) {
    followMsg.textContent = "그룹당 " + FOLLOW_MEMBER_MAX + "명까지 등록할 수 있습니다";
    return;
  }
  g.members = g.members.concat(nick);
  followMemberInput.value = "";
  followMsg.textContent = "";
  saveFollow();
  renderFollowDialog();
}

async function reloadFollowing() {
  followReloadBtn.disabled = true;
  followTotal.textContent = "받는 중…";
  const r = await runInTab(readFollowingInPage, [FOLLOW_API, debugMode]);
  followReloadBtn.disabled = false;
  if (r && r.ok) {
    fillFollowing(r.following);
    saveCache({ following: r.following });
  } else {
    followTotal.textContent = "받지 못함";
    setStatus("팔로우 목록을 받지 못했습니다: " + ((r && r.error) || "알 수 없는 오류"));
  }
}

function normalizeView(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { wideNick: !!r.wideNick, memberTab: typeof r.memberTab === "boolean" ? r.memberTab : true, dlgScroll: typeof r.dlgScroll === "boolean" ? r.dlgScroll : true };
}

function setupView() {
  duiRead(VIEW_KEY).then(v => {
    view = normalizeView(v);
    viewWideNickSwitch.checked = view.wideNick;
    viewMemberTabSwitch.checked = view.memberTab;
    viewDlgScrollSwitch.checked = view.dlgScroll;
  });
  const saveView = () => duiWrite(VIEW_KEY, view).catch(e => setStatus("표시 설정 저장 실패: " + (e && e.message ? e.message : e)));
  viewWideNickSwitch.nextElementSibling.addEventListener("click", () => viewWideNickSwitch.click());
  viewWideNickSwitch.addEventListener("change", () => {
    view.wideNick = viewWideNickSwitch.checked;
    saveView();
  });
  viewMemberTabSwitch.nextElementSibling.addEventListener("click", () => viewMemberTabSwitch.click());
  viewMemberTabSwitch.addEventListener("change", () => {
    view.memberTab = viewMemberTabSwitch.checked;
    saveView();
  });
  viewDlgScrollSwitch.nextElementSibling.addEventListener("click", () => viewDlgScrollSwitch.click());
  viewDlgScrollSwitch.addEventListener("change", () => {
    view.dlgScroll = viewDlgScrollSwitch.checked;
    saveView();
  });
}

function normalizePmenu(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const valid = new Set(PMENU_ITEMS.map(i => i.key));
  return {
    on: typeof r.on === "boolean" ? r.on : true,
    info: typeof r.info === "boolean" ? r.info : true,
    hidden: Array.isArray(r.hidden) ? r.hidden.map(String).filter(k => valid.has(k)) : []
  };
}

function normalizePrio(raw) {
  return { first: raw && raw.first === "title" ? "title" : "member" };
}

function savePmenu() {
  duiWrite(PMENU_KEY, pmenu).catch(e => setStatus("프로필 메뉴 저장 실패: " + (e && e.message ? e.message : e)));
}

function renderPmenu() {
  pmenuSummary.textContent = pmenu.on ? "켜짐" : "꺼짐";
  pmenuOn.checked = pmenu.on;
  pmenuInfoOn.checked = pmenu.info;
  for (const item of PMENU_ITEMS) {
    document.getElementById("pm-" + item.key).checked = !pmenu.hidden.includes(item.key);
  }
}

function setupPmenu() {
  for (const item of PMENU_ITEMS) {
    const row = document.createElement("div");
    row.className = "opt-row";
    const label = document.createElement("label");
    label.textContent = item.label;
    label.htmlFor = "pm-" + item.key;
    const wrap = document.createElement("span");
    wrap.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "pm-" + item.key;
    const track = document.createElement("span");
    track.className = "track";
    track.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      pmenu.hidden = PMENU_ITEMS.map(i => i.key).filter(k => !document.getElementById("pm-" + k).checked);
      savePmenu();
    });
    wrap.append(input, track);
    row.append(label, wrap);
    pmenuTogglesEl.append(row);
  }
  duiRead(PMENU_KEY).then(v => {
    pmenu = normalizePmenu(v);
    renderPmenu();
  });
  pmenuManageBtn.addEventListener("click", () => {
    renderPmenu();
    pmenuDialog.showModal();
  });
  pmenuDialog.addEventListener("click", (e) => {
    if (e.target === pmenuDialog) pmenuDialog.close();
  });
  pmenuOn.nextElementSibling.addEventListener("click", () => pmenuOn.click());
  pmenuOn.addEventListener("change", () => {
    pmenu.on = pmenuOn.checked;
    savePmenu();
    renderPmenu();
  });
  pmenuInfoOn.nextElementSibling.addEventListener("click", () => pmenuInfoOn.click());
  pmenuInfoOn.addEventListener("change", () => {
    pmenu.info = pmenuInfoOn.checked;
    savePmenu();
  });
}

function setupFollow() {
  const color = (id, presets, sec, key) => {
    const box = document.getElementById("follow-" + id.replace(/([A-Z])/g, "-$1").toLowerCase());
    followSwatches[id] = makeSwatches(box, presets, (c) => {
      followItem().style[sec][key] = c;
      saveFollow();
      renderFollowEditor();
    });
  };
  color("lineLight", FOLLOW_PRESETS.lineLight, "line", "lightColor");
  color("lineDark", FOLLOW_PRESETS.lineDark, "line", "darkColor");
  color("bgLight", FOLLOW_PRESETS.bgLight, "bg", "lightColor");
  color("bgDark", FOLLOW_PRESETS.bgDark, "bg", "darkColor");
  color("markLightBg", FOLLOW_PRESETS.lineLight, "mark", "lightBg");
  color("markLightFg", FOLLOW_PRESETS.fgLight, "mark", "lightFg");
  color("markDarkBg", FOLLOW_PRESETS.lineDark, "mark", "darkBg");
  color("markDarkFg", FOLLOW_PRESETS.fgDark, "mark", "darkFg");
  renderFollowRow();
  duiRead(FOLLOW_KEY).then(v => {
    follow = normalizeFollow(v);
    renderFollowRow();
  });
  followManageBtn.addEventListener("click", () => {
    selectFollowItem(-1);
    followDialog.showModal();
  });
  followDialog.addEventListener("click", (e) => {
    if (e.target === followDialog) followDialog.close();
  });
  followCloseBtn.addEventListener("click", () => followDialog.close());
  followAddGroupBtn.addEventListener("click", addFollowGroup);
  followReloadBtn.addEventListener("click", reloadFollowing);
  followName.addEventListener("input", () => {
    const g = follow.groups[followCurrent];
    if (!g) return;
    g.name = followName.value.trim() || g.name;
    renderFollowList();
  });
  followName.addEventListener("change", () => {
    const g = follow.groups[followCurrent];
    if (!g) return;
    followName.value = g.name;
    saveFollow();
  });
  followMemberAddBtn.addEventListener("click", addFollowMember);
  followMemberInput.addEventListener("keydown", (e) => {
    // 한글 조합 중 Enter 는 조합 확정용으로 한 번 더 오므로 건너뛴다
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addFollowMember();
    }
  });
  // 삭제는 두 번 눌러 확정. 다른 항목을 고르면 초기화
  followDeleteBtn.addEventListener("click", () => {
    if (followCurrent < 0) return;
    if (followDeleteBtn.textContent !== "정말 삭제") {
      followDeleteBtn.textContent = "정말 삭제";
      return;
    }
    follow.groups.splice(followCurrent, 1);
    saveFollow();
    selectFollowItem(Math.min(followCurrent, follow.groups.length - 1));
  });
  for (const track of document.querySelectorAll("#follow-dialog .track")) {
    track.addEventListener("click", () => track.previousElementSibling.click());
  }
  const bind = (input, fn) => input.addEventListener("change", () => {
    fn(followItem().style);
    saveFollow();
    renderFollowDialog();
  });
  bind(followOn, (s) => { s.on = followOn.checked; });
  bind(followCommentsOn, (s) => { s.comments = followCommentsOn.checked; });
  bind(followCommentsBg, (s) => { s.commentsBg = followCommentsBg.checked; });
  bind(followLineOn, (s) => { s.line.on = followLineOn.checked; });
  bind(followLineType, (s) => { s.line.type = followLineType.value; });
  bind(followBgOn, (s) => { s.bg.on = followBgOn.checked; });
  bind(followMarkOn, (s) => { s.mark.on = followMarkOn.checked; });
  bind(followMarkText, (s) => { s.mark.text = followMarkText.value.trim().slice(0, 6) || "★"; });
  followMarkText.addEventListener("input", () => {
    followItem().style.mark.text = followMarkText.value.trim().slice(0, 6) || "★";
    paintFollowPreviews();
  });
}

// ---- 제목 강조 ----

function saveHl() {
  duiWrite(HL_KEY, hl).catch(e => setStatus("강조 설정 저장 실패: " + (e && e.message ? e.message : e)));
}

// 저장된 값을 현재 형식으로. 그룹 도입 전 형식(키워드 목록 하나)은 그룹 1로,
// 전역이던 일치 옵션은 각 그룹으로 옮긴다
// 선·배경·마크 섹션 공통 normalize
function normalizeSections(r, onDef) {
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const line = r.line || {}, bg = r.bg || {}, mark = r.mark || {};
  return {
    line: { on: bool(line.on, onDef), type: line.type === "box" ? "box" : "left", lightColor: line.lightColor || FOLLOW_PRESETS.lineLight[0], darkColor: line.darkColor || FOLLOW_PRESETS.lineDark[0] },
    bg: { on: bool(bg.on, onDef), lightColor: bg.lightColor || FOLLOW_PRESETS.bgLight[0], darkColor: bg.darkColor || FOLLOW_PRESETS.bgDark[0] },
    mark: { on: bool(mark.on, onDef), text: String(mark.text || "★").trim().slice(0, 6) || "★", lightBg: mark.lightBg || FOLLOW_PRESETS.lineLight[0], lightFg: mark.lightFg || FOLLOW_PRESETS.fgLight[0], darkBg: mark.darkBg || FOLLOW_PRESETS.lineDark[0], darkFg: mark.darkFg || FOLLOW_PRESETS.fgDark[0] }
  };
}

// 형광펜 색이 그룹 최상위이던 0.3.0 형식도 pen 으로 읽는다
function normalizeHl(raw) {
  const out = { groups: [] };
  if (!raw || typeof raw !== "object") return out;
  const bool = (v, d) => (typeof v === "boolean" ? v : d);
  const src = Array.isArray(raw.groups) ? raw.groups
    : Array.isArray(raw.keywords) && raw.keywords.length ? [raw] : [];
  out.groups = src.slice(0, HL_GROUP_MAX).map((g, i) => {
    const pen = g.pen || {};
    return Object.assign({
      name: String(g.name || "그룹 " + (i + 1)).slice(0, 12),
      on: bool(g.on, true),
      partial: bool(g.partial, bool(raw.partial, true)),
      ignoreCase: bool(g.ignoreCase, bool(raw.ignoreCase, true)),
      keywords: Array.isArray(g.keywords) ? g.keywords.map(String).slice(0, HL_WORD_MAX) : [],
      pen: {
        on: bool(pen.on, true),
        lightColor: pen.lightColor || g.lightColor || HL_PRESETS.light[i % HL_PRESETS.light.length],
        darkColor: pen.darkColor || g.darkColor || HL_PRESETS.dark[i % HL_PRESETS.dark.length]
      }
    }, normalizeSections(g, false));
  });
  return out;
}

function hlGroup() {
  return hl.groups[hlCurrent];
}

// 소그룹 요약 행
function renderHlRow() {
  hlGroupCount.textContent = hl.groups.length + "개";
}

// 원 하나를 반으로 나눠 왼쪽은 주간, 오른쪽은 다크 색
function makeDots(g) {
  const dots = document.createElement("span");
  dots.className = "dots";
  const d = document.createElement("span");
  d.className = "dot";
  const lc = g.pen ? g.pen.lightColor : g.lightColor;
  const dc = g.pen ? g.pen.darkColor : g.darkColor;
  d.style.background = "linear-gradient(90deg, " + lc + " 50%, " + dc + " 50%)";
  d.title = "주간 " + lc + " / 다크 " + dc;
  dots.append(d);
  return dots;
}

// 다이얼로그 왼쪽 그룹 목록
function renderHlList() {
  hlDlgCount.textContent = hl.groups.length + " / " + HL_GROUP_MAX;
  hlAddGroupBtn.disabled = hl.groups.length >= HL_GROUP_MAX;
  hlList.textContent = "";
  hl.groups.forEach((g, i) => {
    const item = document.createElement("div");
    item.className = "hl-item" + (i === hlCurrent ? " on" : "") + (g.on ? "" : " off");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = g.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = g.keywords.length;
    item.append(makeDots(g), name, count);
    item.addEventListener("click", () => selectHlGroup(i));
    hlList.append(item);
  });
  renderHlRow();
}

function buildSwatches(mode) {
  const key = mode + "Color";
  hlSwatchCtl[mode] = makeSwatches(hlSwatches[mode], HL_PRESETS[mode], (c) => {
    const g = hlGroup();
    if (!g) return;
    g.pen[key] = c;
    saveHl();
    renderHlEditor();
    renderHlList();
  });
}

// 선·배경·마크 스와치. 사용자 강조와 같은 프리셋
function buildHlSectionSwatches() {
  const make = (id, presets, sec, key) => {
    hlSecCtl[id] = makeSwatches(document.getElementById(id), presets, (c) => {
      const g = hlGroup();
      if (!g) return;
      g[sec][key] = c;
      saveHl();
      renderHlEditor();
    });
  };
  make("hl-line-light", FOLLOW_PRESETS.lineLight, "line", "lightColor");
  make("hl-line-dark", FOLLOW_PRESETS.lineDark, "line", "darkColor");
  make("hl-bg-light", FOLLOW_PRESETS.bgLight, "bg", "lightColor");
  make("hl-bg-dark", FOLLOW_PRESETS.bgDark, "bg", "darkColor");
  make("hl-mark-light-bg", FOLLOW_PRESETS.lineLight, "mark", "lightBg");
  make("hl-mark-light-fg", FOLLOW_PRESETS.fgLight, "mark", "lightFg");
  make("hl-mark-dark-bg", FOLLOW_PRESETS.lineDark, "mark", "darkBg");
  make("hl-mark-dark-fg", FOLLOW_PRESETS.fgDark, "mark", "darkFg");
}

// 다이얼로그 오른쪽, 선택한 그룹 편집
function renderHlEditor() {
  const g = hlGroup();
  hlEmpty.hidden = !!g;
  hlForm.hidden = !g;
  hlDeleteBtn.disabled = !g;
  if (!g) return;
  if (hlName.value !== g.name) hlName.value = g.name;
  hlOn.checked = g.on;
  hlForm.classList.toggle("off", !g.on);
  hlPartial.checked = g.partial;
  hlIcase.checked = g.ignoreCase;
  hlCount.textContent = g.keywords.length + " / " + HL_WORD_MAX;
  hlChips.textContent = "";
  for (const word of g.keywords) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.append(word);
    const x = document.createElement("button");
    x.textContent = "×";
    x.title = "삭제";
    x.addEventListener("click", () => {
      g.keywords = g.keywords.filter(w => w !== word);
      hlMsg.textContent = "";
      saveHl();
      renderHlEditor();
      renderHlList();
    });
    chip.append(x);
    hlChips.append(chip);
  }
  const full = g.keywords.length >= HL_WORD_MAX;
  hlInput.disabled = full;
  hlAddBtn.disabled = full;
  hlPenOn.checked = g.pen.on;
  hlLineOn.checked = g.line.on;
  hlLineType.value = g.line.type;
  hlBgOn.checked = g.bg.on;
  hlMarkOn.checked = g.mark.on;
  if (hlMarkText.value !== g.mark.text) hlMarkText.value = g.mark.text;
  hlPenOn.closest(".follow-sec").classList.toggle("off", !g.pen.on);
  hlLineOn.closest(".follow-sec").classList.toggle("off", !g.line.on);
  hlBgOn.closest(".follow-sec").classList.toggle("off", !g.bg.on);
  hlMarkOn.closest(".follow-sec").classList.toggle("off", !g.mark.on);
  for (const mode of ["light", "dark"]) {
    hlSwatchCtl[mode].mark(g.pen[mode + "Color"]);
  }
  hlSecCtl["hl-line-light"].mark(g.line.lightColor);
  hlSecCtl["hl-line-dark"].mark(g.line.darkColor);
  hlSecCtl["hl-bg-light"].mark(g.bg.lightColor);
  hlSecCtl["hl-bg-dark"].mark(g.bg.darkColor);
  hlSecCtl["hl-mark-light-bg"].mark(g.mark.lightBg);
  hlSecCtl["hl-mark-light-fg"].mark(g.mark.lightFg);
  hlSecCtl["hl-mark-dark-bg"].mark(g.mark.darkBg);
  hlSecCtl["hl-mark-dark-fg"].mark(g.mark.darkFg);
  paintFollowPreview(hlPrev.light, g, false);
  paintFollowPreview(hlPrev.dark, g, true);
  hlPenPrev.light.style.background = g.pen.on ? g.pen.lightColor : "transparent";
  hlPenPrev.dark.style.background = g.pen.on ? g.pen.darkColor : "transparent";
}

function selectHlGroup(i) {
  hlCurrent = i;
  hlMsg.textContent = "";
  hlInput.value = "";
  hlDeleteBtn.textContent = "그룹 삭제";
  renderHlList();
  renderHlEditor();
}

function addHlGroup() {
  if (hl.groups.length >= HL_GROUP_MAX) return;
  const used = new Set(hl.groups.map(g => g.name));
  let n = 1;
  while (used.has("그룹 " + n)) n++;
  const i = hl.groups.length;
  hl.groups.push(Object.assign({
    name: "그룹 " + n,
    on: true,
    partial: true,
    ignoreCase: true,
    keywords: [],
    pen: {
      on: true,
      lightColor: HL_PRESETS.light[i % HL_PRESETS.light.length],
      darkColor: HL_PRESETS.dark[i % HL_PRESETS.dark.length]
    }
  }, normalizeSections({}, true)));
  saveHl();
  selectHlGroup(i);
  hlName.focus();
  hlName.select();
}

function addHlKeyword() {
  const g = hlGroup();
  const word = hlInput.value.trim();
  if (!g || !word) return;
  const at = hl.groups.findIndex(x => x.keywords.includes(word));
  if (at >= 0) {
    hlMsg.textContent = at === hlCurrent ? "이미 있는 키워드입니다" : "'" + hl.groups[at].name + "'에 이미 있는 키워드입니다";
    return;
  }
  if (g.keywords.length >= HL_WORD_MAX) {
    hlMsg.textContent = "그룹당 " + HL_WORD_MAX + "개까지 등록할 수 있습니다";
    return;
  }
  g.keywords = g.keywords.concat(word);
  hlInput.value = "";
  hlMsg.textContent = "";
  saveHl();
  renderHlEditor();
  renderHlList();
}

function setupHighlight() {
  buildSwatches("light");
  buildSwatches("dark");
  buildHlSectionSwatches();
  const bindSec = (input, fn) => input.addEventListener("change", () => {
    const g = hlGroup();
    if (!g) return;
    fn(g);
    saveHl();
    renderHlEditor();
    renderHlList();
  });
  bindSec(hlPenOn, g => { g.pen.on = hlPenOn.checked; });
  bindSec(hlLineOn, g => { g.line.on = hlLineOn.checked; });
  bindSec(hlLineType, g => { g.line.type = hlLineType.value; });
  bindSec(hlBgOn, g => { g.bg.on = hlBgOn.checked; });
  bindSec(hlMarkOn, g => { g.mark.on = hlMarkOn.checked; });
  bindSec(hlMarkText, g => { g.mark.text = hlMarkText.value.trim().slice(0, 6) || "★"; });
  renderHlRow();
  duiRead(HL_KEY).then(v => {
    hl = normalizeHl(v);
    renderHlRow();
  });
  hlManageBtn.addEventListener("click", () => {
    selectHlGroup(hl.groups.length ? 0 : -1);
    hlDialog.showModal();
    if (hlGroup()) hlInput.focus();
  });
  hlDialog.addEventListener("click", (e) => {
    if (e.target === hlDialog) hlDialog.close();
  });
  hlCloseBtn.addEventListener("click", () => hlDialog.close());
  hlAddGroupBtn.addEventListener("click", addHlGroup);
  hlName.addEventListener("input", () => {
    const g = hlGroup();
    if (!g) return;
    g.name = hlName.value.trim() || g.name;
    renderHlList();
  });
  hlName.addEventListener("change", () => {
    const g = hlGroup();
    if (!g) return;
    hlName.value = g.name;
    saveHl();
  });
  // 삭제는 두 번 눌러 확정. 다른 그룹을 고르거나 닫으면 초기화
  hlDeleteBtn.addEventListener("click", () => {
    if (hlDeleteBtn.textContent !== "정말 삭제") {
      hlDeleteBtn.textContent = "정말 삭제";
      return;
    }
    hl.groups.splice(hlCurrent, 1);
    saveHl();
    selectHlGroup(Math.min(hlCurrent, hl.groups.length - 1));
  });
  hlAddBtn.addEventListener("click", addHlKeyword);
  hlInput.addEventListener("keydown", (e) => {
    // 한글 조합 중 Enter 는 조합 확정용으로 한 번 더 오므로 건너뛴다
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addHlKeyword();
    }
  });
  for (const track of document.querySelectorAll("#hl-dialog .track, #extra-opt-dialog .track")) {
    track.addEventListener("click", () => track.previousElementSibling.click());
  }
  hlOn.addEventListener("change", () => {
    const g = hlGroup();
    if (!g) return;
    g.on = hlOn.checked;
    saveHl();
    renderHlEditor();
    renderHlList();
  });
  hlPartial.addEventListener("change", () => {
    const g = hlGroup();
    if (!g) return;
    g.partial = hlPartial.checked;
    saveHl();
  });
  hlIcase.addEventListener("change", () => {
    const g = hlGroup();
    if (!g) return;
    g.ignoreCase = hlIcase.checked;
    saveHl();
  });
}

function applyExtraVisibility() {
  for (const g of EXTRA_SUBGROUPS) {
    const el = document.getElementById("sg-" + g.id);
    if (el) el.hidden = hiddenExtra.has(g.id);
  }
}

function setupExtra() {
  duiRead(PRIO_KEY).then(v => {
    emPrio = normalizePrio(v);
    emPrioSelect.value = emPrio.first;
  });
  emPrioSelect.addEventListener("change", () => {
    emPrio.first = emPrioSelect.value === "title" ? "title" : "member";
    duiWrite(PRIO_KEY, emPrio).catch(e => setStatus("우선순위 저장 실패: " + (e && e.message ? e.message : e)));
  });
  setupCollapse(emGroupEl, emHeadEl, "sg-em-collapsed");
  setupCollapse(viewGroupEl, viewHeadEl, "sg-view-collapsed");
  setupCollapse(easeGroupEl, easeHeadEl, "sg-ease-collapsed");
  setupCollapse(menuGroupEl, menuHeadEl, "sg-menu-collapsed");
  extraGroupEl.classList.toggle("no-tips", !showExtraTips);
  applyExtraVisibility();
  for (const g of EXTRA_SUBGROUPS) {
    const row = document.createElement("div");
    row.className = "opt-row";
    const label = document.createElement("label");
    label.textContent = g.title;
    label.htmlFor = "extra-toggle-" + g.id;
    const wrap = document.createElement("span");
    wrap.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "extra-toggle-" + g.id;
    input.checked = !hiddenExtra.has(g.id);
    const track = document.createElement("span");
    track.className = "track";
    track.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      if (input.checked) hiddenExtra.delete(g.id);
      else hiddenExtra.add(g.id);
      localStorage.setItem("extra-hidden", JSON.stringify([...hiddenExtra]));
      applyExtraVisibility();
    });
    wrap.append(input, track);
    row.append(label, wrap);
    extraTogglesEl.append(row);
  }
  extraOptBtn.addEventListener("click", () => extraOptDialog.showModal());
  extraOptDialog.addEventListener("click", (e) => {
    if (e.target === extraOptDialog) extraOptDialog.close();
  });
  extraTipsSwitch.checked = showExtraTips;
  extraTipsSwitch.addEventListener("change", () => {
    showExtraTips = extraTipsSwitch.checked;
    localStorage.setItem("extra-tips", showExtraTips ? "1" : "0");
    extraGroupEl.classList.toggle("no-tips", !showExtraTips);
  });
}

function setAllDisabled(disabled) {
  groupsEl.querySelectorAll("input").forEach(i => (i.disabled = disabled));
}

function setBusy(busy) {
  setAllDisabled(busy);
  if (muteManageBtn) muteManageBtn.disabled = busy || !muteLoaded;
  refreshBtn.disabled = busy;
  shotOnBtn.disabled = busy;
  shotOffBtn.disabled = busy;
}

async function onRefresh() {
  if (autosaveTimer) await autosave();
  chrome.tabs.reload(damoangTab.id);
  if (!statusEl.classList.contains("error")) setStatus("새로고침함");
}

// 스크린샷 모드. 스위치 상태와 무관하게 키들을 덮어쓰고 저장 성공 시 바로 새로고침
async function onShot(on) {
  setBusy(true);
  setStatus("저장 중…");
  const values = {};
  for (const key of SHOT_KEYS) values[key] = on;
  if (shotScope === "memo-profile") values.hideMyProfile = on;
  dbg("shot", values);
  const r = await runInTab(applySettingsInPage, [API, values, debugMode], 25000);
  dbg("shot result", r);
  setBusy(false);
  if (r && r.ok) {
    for (const key of Object.keys(values)) {
      baseline[key] = !!r.settings[key];
      document.getElementById("sw-" + key).checked = !!r.settings[key];
    }
    saveCache({ settings: fieldValues(r.settings), mute: muteBaseline });
    chrome.tabs.reload(damoangTab.id);
    setStatus("스크린샷 모드 " + (on ? "켬" : "끔") + " · 새로고침함");
  } else {
    setStatus("저장 실패: " + ((r && r.error) || "알 수 없는 오류"), true);
  }
  if (isDirty()) scheduleAutosave();
}

async function loadData() {
  favSpinEl.hidden = false;
  memoSpinEl.hidden = false;
  const started = Date.now();
  const tick = setInterval(() => {
    setStatus("불러오는 중… " + Math.floor((Date.now() - started) / 1000) + "초 / 최대 15초");
  }, 500);
  let fav, r, fol;
  try {
    [fav, r, fol] = await Promise.all([
      runInTab(readFavoritesInPage, [FAV_API, debugMode]),
      runInTab(simMode === "timeout" ? hangInPage : readSettingsInPage, [API, debugMode]),
      runInTab(readFollowingInPage, [FOLLOW_API, debugMode])
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
  dbg("following", fol);
  if (fol && fol.ok) {
    fillFollowing(fol.following);
    saveCache({ following: fol.following });
  }
  if (r && r.ok) {
    hideFail();
    fillRows(r.settings);
    fillMute(r.settings);
    saveCache({ settings: fieldValues(r.settings), mute: muteBaseline });
    shotOnBtn.disabled = false;
    shotOffBtn.disabled = false;
    scheduleAutosave();
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

// 설정 리셋. 가림막에서 빨간 버튼을 5초간 누르고 있어야 실행된다
function setupReset() {
  const HOLD_LABEL = "5초간 누르고 있으면 리셋";
  let timer = null;
  let left = 5;
  const stopHold = () => {
    if (timer) clearInterval(timer);
    timer = null;
    resetHoldBtn.textContent = HOLD_LABEL;
  };
  const doReset = async () => {
    stopHold();
    resetHoldBtn.disabled = true;
    resetCancelBtn.disabled = true;
    resetHoldBtn.textContent = "지우는 중…";
    try {
      await chrome.storage.sync.clear();
    } catch (_) {}
    try {
      await chrome.storage.local.clear();
    } catch (_) {}
    localStorage.clear();
    location.reload();
  };
  resetBtn.addEventListener("click", () => {
    settingsDialog.close();
    resetConfirmEl.hidden = false;
  });
  resetCancelBtn.addEventListener("click", () => {
    stopHold();
    resetConfirmEl.hidden = true;
  });
  resetHoldBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    resetHoldBtn.setPointerCapture(e.pointerId);
    left = 5;
    resetHoldBtn.textContent = String(left);
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        doReset();
        return;
      }
      resetHoldBtn.textContent = String(left);
    }, 1000);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) {
    resetHoldBtn.addEventListener(ev, stopHold);
  }
}

function setIoMsg(msg, err) {
  ioMsg.hidden = !msg;
  ioMsg.textContent = msg || "";
  ioMsg.classList.toggle("err", !!err);
}

// 백업·복원 대상은 동기화되는 추가 기능 설정뿐
function normalizeQp(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const src = Array.isArray(r.list) ? r.list : [];
  const seen = new Set();
  const list = [];
  for (const it of src) {
    const id = it && typeof it.id === "string" ? it.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, label: it && typeof it.label === "string" && it.label ? it.label : id });
    if (list.length >= QP_MAX) break;
  }
  return { btn: typeof r.btn === "boolean" ? r.btn : true, info: typeof r.info === "boolean" ? r.info : true, list };
}

function qpParseQuery(s) {
  s = s.trim();
  const m = s.match(/damoang\.net\/member\/([^/?#\s]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
  }
  return s;
}

function decodeEntities(s) {
  return new DOMParser().parseFromString(s, "text/html").documentElement.textContent;
}

function setQpMsg(s) {
  qpMsgEl.textContent = s;
}

function saveQp() {
  duiWrite(QP_KEY, qp).catch(e => setQpMsg("저장 실패: " + (e && e.message ? e.message : e)));
}

function renderQpList() {
  qpCountEl.textContent = qp.list.length ? String(qp.list.length) : "";
  qpCntEl.textContent = qp.list.length + " / " + QP_MAX;
  qpListEl.textContent = "";
  for (const it of qp.list) {
    const li = document.createElement("li");
    const name = document.createElement("button");
    name.type = "button";
    name.className = "qp-name";
    name.textContent = it.label;
    name.title = it.id;
    name.addEventListener("click", () => {
      goToDamoang("https://damoang.net/member/" + encodeURIComponent(it.id), true);
    });
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "qp-btn";
    edit.textContent = "수정";
    edit.addEventListener("click", () => qpRename(li, it, name));
    const x = document.createElement("button");
    x.type = "button";
    x.className = "qp-btn qp-x";
    x.textContent = "삭제";
    x.addEventListener("click", () => {
      if (!x.classList.contains("arm")) {
        x.classList.add("arm");
        x.textContent = "정말 삭제";
        return;
      }
      qp.list = qp.list.filter(v => v !== it);
      saveQp();
      renderQpList();
    });
    li.append(name, edit, x);
    qpListEl.append(li);
  }
}

function qpRename(li, it, name) {
  const inp = document.createElement("input");
  inp.type = "text";
  inp.className = "qp-rename";
  inp.value = it.label;
  li.replaceChild(inp, name);
  inp.focus();
  inp.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) {
      const v = inp.value.trim();
      if (v) it.label = v;
      saveQp();
    }
    renderQpList();
  };
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) finish(true);
    if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  inp.addEventListener("blur", () => finish(true));
}

async function qpAdd() {
  const q = qpParseQuery(qpInput.value);
  if (!q) {
    setQpMsg("닉네임이나 아이디를 입력해 주세요");
    return;
  }
  if (qp.list.length >= QP_MAX) {
    setQpMsg("최대 " + QP_MAX + "명까지 등록할 수 있습니다");
    return;
  }
  qpAddBtn.disabled = true;
  setQpMsg("회원 확인 중");
  const r = await runInTab(fetchMemberInPage, [q]);
  qpAddBtn.disabled = false;
  if (!r.ok || (!r.name && !r.id)) {
    setQpMsg("회원을 찾을 수 없습니다");
    return;
  }
  const id = r.id || (/^[A-Za-z0-9_.-]+$/.test(q) ? q : "");
  if (!id) {
    setQpMsg("아이디를 확인하지 못했습니다");
    return;
  }
  if (qp.list.some(it => it.id === id)) {
    setQpMsg("이미 등록된 회원입니다");
    return;
  }
  qp.list.push({ id, label: r.name ? decodeEntities(r.name) : id });
  qpInput.value = "";
  setQpMsg("");
  saveQp();
  renderQpList();
}

function renderQpb() {
  qpbSummary.textContent = qp.btn ? "켜짐" : "꺼짐";
  qpbOn.checked = qp.btn;
  qpbInfoOn.checked = qp.info;
}

function setupQp() {
  duiRead(QP_KEY).then(v => {
    qp = normalizeQp(v);
    renderQpb();
    renderQpList();
  });
  qpbManageBtn.addEventListener("click", () => {
    renderQpb();
    qpbDialog.showModal();
  });
  qpbDialog.addEventListener("click", (e) => {
    if (e.target === qpbDialog) qpbDialog.close();
  });
  qpbOn.nextElementSibling.addEventListener("click", () => qpbOn.click());
  qpbOn.addEventListener("change", () => {
    qp.btn = qpbOn.checked;
    saveQp();
    renderQpb();
  });
  qpbInfoOn.nextElementSibling.addEventListener("click", () => qpbInfoOn.click());
  qpbInfoOn.addEventListener("change", () => {
    qp.info = qpbInfoOn.checked;
    saveQp();
  });
  // 프로필 화면의 눈 버튼으로 등록하면 열린 팝업에도 반영한다 (묵은 사본 덮어쓰기 방지)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" && area !== "local") return;
    if (!duiChanged(changes, QP_KEY)) return;
    duiRead(QP_KEY).then(v => {
      qp = normalizeQp(v);
      renderQpb();
      renderQpList();
    });
  });
  qpOpenBtn.addEventListener("click", () => {
    setQpMsg("");
    renderQpList();
    qpDialog.showModal();
  });
  qpDialog.addEventListener("click", (e) => {
    if (e.target === qpDialog) qpDialog.close();
  });
  document.getElementById("qp-goto-qpb").addEventListener("click", (e) => {
    e.preventDefault();
    renderQpb();
    qpbDialog.showModal();
  });
  qpAddBtn.addEventListener("click", qpAdd);
  qpInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      qpAdd();
    }
  });
}

function setupImportExport() {
  // Edge 는 storage.sync 를 받지만 아직 계정으로 로밍하지 않으므로 동기화 언급을 뺀다
  if (navigator.userAgent.includes("Edg/")) {
    document.getElementById("backup-note").textContent =
      "백업 파일에는 추가 기능의 설정이 담깁니다. 다른 기기나 브라우저로 옮기거나 만약을 대비해 보관할 때 사용합니다.";
  }
  // Firefox 는 팝업에서 파일 창을 열면 팝업이 닫힌다. 백업·복원 모두 전용 탭에서 (UI 통일)
  const firefox = navigator.userAgent.includes("Firefox");
  const openBackupPage = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("backup.html") });
    window.close();
  };
  if (firefox) {
    exportBtn.addEventListener("click", openBackupPage);
    importBtn.addEventListener("click", openBackupPage);
  }
  exportBtn.addEventListener("click", () => {
    if (firefox) return;
    const data = {
      app: "damoang-ui-extension",
      schema: 1,
      exportedAt: new Date().toISOString(),
      highlight: hl,
      member: follow,
      pmenu: pmenu,
      emprio: emPrio,
      view: view,
      qprofile: qp
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    a.download = "damoang-ui-extension-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    setIoMsg("백업 파일을 내려받았습니다.");
  });
  importBtn.addEventListener("click", () => {
    if (firefox) return;
    importFile.click();
  });
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== "damoang-ui-extension") throw new Error("이 확장의 백업 파일이 아닙니다");
      hl = normalizeHl(data.highlight);
      follow = normalizeFollow(data.member);
      pmenu = normalizePmenu(data.pmenu);
      emPrio = normalizePrio(data.emprio);
      view = normalizeView(data.view);
      qp = normalizeQp(data.qprofile);
      await duiWrite(VIEW_KEY, view);
      await duiWrite(QP_KEY, qp);
      await duiWrite(HL_KEY, hl);
      await duiWrite(FOLLOW_KEY, follow);
      await duiWrite(PMENU_KEY, pmenu);
      await duiWrite(PRIO_KEY, emPrio);
      setIoMsg("복원했습니다. 팝업을 다시 불러옵니다.");
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      setIoMsg("복원 실패: " + (e && e.message ? e.message : e), true);
    }
  });
}

async function init() {
  const manifest = chrome.runtime.getManifest();
  // 확장 이름은 manifest(로케일 해석 후)를 따른다
  document.getElementById("site-link").textContent = manifest.name;
  const version = manifest.version;
  versionEl.textContent = "v" + version;
  // 버전 페이지의 해당 버전 앵커로 (versions.md의 {#v0-1-0} 규칙과 짝)
  versionEl.href = "https://damoang-ui-extension.hobbyworker.me/versions/#v" + version.split(".").join("-");

  setupTabs();
  settingsBtn.addEventListener("click", () => {
    themeSelect.value = themeMode;
    autosaveInput.value = String(autosaveDelay / 1000);
    debugSwitch.checked = debugMode;
    setIoMsg("");
    settingsDialog.showModal();
  });
  autosaveInput.addEventListener("change", () => {
    let sec = Number(autosaveInput.value);
    if (!Number.isFinite(sec)) sec = 0.8;
    sec = Math.min(AUTOSAVE_MAX / 1000, Math.max(AUTOSAVE_MIN / 1000, sec));
    autosaveInput.value = String(sec);
    autosaveDelay = Math.round(sec * 1000);
    localStorage.setItem("autosave-delay", String(autosaveDelay));
  });
  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) settingsDialog.close();
  });
  themeSelect.addEventListener("change", () => {
    themeMode = themeSelect.value;
    localStorage.setItem("theme", themeMode);
    applyTheme(themeMode);
  });
  for (const track of document.querySelectorAll("#settings-dialog .track")) {
    track.addEventListener("click", () => track.previousElementSibling.click());
  }
  setupImportExport();
  setupReset();
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
  setupTooltips();
  setupHighlight();
  setupFollow();
  setupPmenu();
  setupView();
  setupQp();
  setupExtra();
  const cached = loadCache();
  dbg("cache", cached);
  if (cached.settings) fillRows(cached.settings);
  if (Array.isArray(cached.mute)) fillMute({ muteKeywords: cached.mute });
  if (Array.isArray(cached.favorites) && cached.favorites.length) {
    renderFavorites(cached.favorites);
  }
  if (Array.isArray(cached.following)) fillFollowing(cached.following);
  setupCollapse(quickGroupEl, quickHeadEl, "quick-collapsed");
  settingsGroupEl.classList.toggle("no-tips", !showTips);
  renderSubgroupToggles();
  settingsOptBtn.addEventListener("click", () => settingsOptDialog.showModal());
  settingsOptDialog.addEventListener("click", (e) => {
    if (e.target === settingsOptDialog) settingsOptDialog.close();
  });
  tipsSwitch.checked = showTips;
  tipsSwitch.nextElementSibling.addEventListener("click", () => tipsSwitch.click());
  tipsSwitch.addEventListener("change", () => {
    showTips = tipsSwitch.checked;
    localStorage.setItem("settings-tips", showTips ? "1" : "0");
    settingsGroupEl.classList.toggle("no-tips", !showTips);
  });
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

  refreshBtn.addEventListener("click", onRefresh);
  muteAddBtn.addEventListener("click", addMuteKeyword);
  muteInput.addEventListener("keydown", (e) => {
    // 한글 조합 중 Enter 는 조합 확정용으로 한 번 더 오므로 건너뛴다
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      addMuteKeyword();
    }
  });
  muteDialog.addEventListener("click", (e) => {
    if (e.target === muteDialog) muteDialog.close();
  });
  shotOnBtn.addEventListener("click", () => onShot(true));
  shotOffBtn.addEventListener("click", () => onShot(false));
  quickSettingsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    shotScopeSelect.value = shotScope;
    quickDialog.showModal();
  });
  quickDialog.addEventListener("click", (e) => {
    if (e.target === quickDialog) quickDialog.close();
  });
  shotScopeSelect.addEventListener("change", () => {
    shotScope = shotScopeSelect.value;
    localStorage.setItem("shot-scope", shotScope);
  });
  const applyQuickHidden = () => {
    quickRowShot.style.display = quickHidden.includes("shot") ? "none" : "";
    quickRowQp.style.display = quickHidden.includes("qp") ? "none" : "";
  };
  applyQuickHidden();
  quickShowShot.checked = !quickHidden.includes("shot");
  quickShowQp.checked = !quickHidden.includes("qp");
  for (const [input, key] of [[quickShowShot, "shot"], [quickShowQp, "qp"]]) {
    input.nextElementSibling.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      quickHidden = quickHidden.filter(k => k !== key);
      if (!input.checked) quickHidden.push(key);
      localStorage.setItem("quick-hidden", JSON.stringify(quickHidden));
      applyQuickHidden();
    });
  }
  quickGroupEl.classList.toggle("no-tips", !showQuickTips);
  quickTipsSwitch.checked = showQuickTips;
  quickTipsSwitch.nextElementSibling.addEventListener("click", () => quickTipsSwitch.click());
  quickTipsSwitch.addEventListener("change", () => {
    showQuickTips = quickTipsSwitch.checked;
    localStorage.setItem("quick-tips", showQuickTips ? "1" : "0");
    quickGroupEl.classList.toggle("no-tips", !showQuickTips);
  });
  failBtn.addEventListener("click", onFailRetry);
  gateBtn.addEventListener("click", async () => {
    if (gateMode === "permission") {
      let ok = false;
      try {
        ok = await chrome.permissions.request(HOST_PERMISSION);
      } catch (e) {
        dbg("permissions.request", String(e));
      }
      if (ok) {
        hideGate();
        await start();
      }
      return;
    }
    if (damoangTab) {
      chrome.tabs.update(damoangTab.id, { url: SITE, active: true });
    } else {
      chrome.tabs.create({ url: SITE });
    }
    window.close();
  });

  if (!(await hasHostPermission())) {
    gateMode = "permission";
    gateBtn.textContent = "다모앙 접근 허용";
    showGate("다모앙(damoang.net)에 접근할 권한이 필요합니다.");
    return;
  }
  await start();
}

async function hasHostPermission() {
  try {
    return await chrome.permissions.contains(HOST_PERMISSION);
  } catch (_) {
    return true;
  }
}

async function start() {
  gateMode = "open";
  gateBtn.textContent = "다모앙 열기";
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
