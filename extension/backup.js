// 백업·복원 페이지. Firefox 는 팝업에서 파일 선택 창을 열면 팝업이 닫히고, macOS Safari 팝업은
// 다운로드를 못 하므로 둘은 이 페이지를 새 탭으로 연다. 편집 영역에 설정 JSON 을 두어 복사·붙여넣기·
// 편집이 되고, 적용할 때 형식을 검사한 뒤 원본 값을 그대로 저장한다. 세부 보정은 읽는 쪽 normalize 가 한다

const RESTORE_KEYS = ["highlight", "member", "pmenu", "emprio", "view", "qprofile"];
const META_KEYS = ["app", "schema", "exportedAt"];
const MAX_ITEM = DUI_CHUNK * DUI_CHUNK_MAX;

const editor = document.getElementById("editor");
const checkEl = document.getElementById("check");
const reloadBtn = document.getElementById("reload-btn");
const copyBtn = document.getElementById("copy-btn");
const exportBtn = document.getElementById("export-btn");
const pickBtn = document.getElementById("pick-btn");
const applyBtn = document.getElementById("apply-btn");
const fileInput = document.getElementById("file-input");
const msgEl = document.getElementById("msg");
const advEl = document.getElementById("adv");
const advMsgEl = document.getElementById("adv-msg");

// 화면모드는 팝업 설정을 따른다 (같은 출처의 localStorage)
const theme = localStorage.getItem("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

let loadedText = "";

function setMsg(text, cls) {
  msgEl.hidden = !text;
  msgEl.textContent = text || "";
  msgEl.className = cls || "";
}
function setAdvMsg(text, cls) {
  advMsgEl.hidden = !text;
  advMsgEl.textContent = text || "";
  advMsgEl.className = "advmsg " + (cls || "");
}

const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isStrArr = (v) => Array.isArray(v) && v.every(x => typeof x === "string");

// 항목별 형식 검사. 값의 세부 보정은 normalize 에 맡기고, 여기서는 구조가 깨진 것만 거른다
const SHAPE = {
  highlight(v, err) {
    if (v.groups !== undefined) {
      if (!Array.isArray(v.groups)) return err("highlight.groups 는 배열이어야 합니다");
      v.groups.forEach((g, i) => {
        if (!isObj(g)) return err("highlight.groups[" + i + "] 는 객체여야 합니다");
        if (g.keywords !== undefined && !isStrArr(g.keywords)) err("highlight.groups[" + i + "].keywords 는 문자열 배열이어야 합니다");
      });
    } else if (v.keywords !== undefined && !isStrArr(v.keywords)) err("highlight.keywords 는 문자열 배열이어야 합니다");
  },
  member(v, err) {
    if (v.follow !== undefined && !isObj(v.follow)) err("member.follow 는 객체여야 합니다");
    if (v.groups !== undefined) {
      if (!Array.isArray(v.groups)) return err("member.groups 는 배열이어야 합니다");
      v.groups.forEach((g, i) => {
        if (!isObj(g)) return err("member.groups[" + i + "] 는 객체여야 합니다");
        if (g.members !== undefined && !isStrArr(g.members)) err("member.groups[" + i + "].members 는 문자열 배열이어야 합니다");
      });
    }
  },
  pmenu(v, err) {
    if (v.hidden !== undefined && !isStrArr(v.hidden)) err("pmenu.hidden 은 문자열 배열이어야 합니다");
  },
  emprio(v, err) {
    if (v.first !== undefined && v.first !== "member" && v.first !== "title") err("emprio.first 는 member 또는 title 이어야 합니다");
  },
  view() {},
  qprofile(v, err) {
    if (v.list !== undefined) {
      if (!Array.isArray(v.list)) return err("qprofile.list 는 배열이어야 합니다");
      if (v.list.length > 30) err("qprofile.list 는 30명까지입니다");
      v.list.forEach((it, i) => {
        if (!isObj(it) || typeof it.id !== "string" || !it.id) return err("qprofile.list[" + i + "] 에 id 가 없습니다");
        if (it.label !== undefined && typeof it.label !== "string") err("qprofile.list[" + i + "].label 은 문자열이어야 합니다");
      });
    }
  }
};

function validate(text) {
  const errors = [];
  const warnings = [];
  const err = (m) => { errors.push(m); };
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ["JSON 문법 오류: " + (e && e.message ? e.message : e)], warnings };
  }
  if (!isObj(data)) return { ok: false, errors: ["최상위는 객체({ })여야 합니다"], warnings };
  if (data.app !== "damoang-ui-extension") err("app 값이 damoang-ui-extension 이 아닙니다. 이 확장의 백업이 아닙니다");
  if (data.schema !== undefined && data.schema !== 1) err("schema 는 1 이어야 합니다 (현재 " + JSON.stringify(data.schema) + ")");
  let present = 0;
  for (const key of RESTORE_KEYS) {
    const v = data[key];
    if (v === undefined || v === null) continue;
    present += 1;
    if (!isObj(v)) { err(key + " 는 객체여야 합니다"); continue; }
    SHAPE[key](v, err);
    if (JSON.stringify(v).length > MAX_ITEM) err(key + " 가 너무 큽니다 (최대 " + MAX_ITEM + "자)");
  }
  for (const k of Object.keys(data)) {
    if (!RESTORE_KEYS.includes(k) && !META_KEYS.includes(k)) warnings.push(k);
  }
  if (!present) err("복원할 설정 항목이 없습니다 (" + RESTORE_KEYS.join(", ") + " 중 하나 이상)");
  return { ok: errors.length === 0, data, errors, warnings };
}

function showCheck() {
  const text = editor.value.trim();
  if (!text) {
    checkEl.textContent = "";
    checkEl.className = "check";
    applyBtn.disabled = true;
    return null;
  }
  const r = validate(text);
  if (r.ok) {
    const keys = RESTORE_KEYS.filter(k => r.data[k] !== undefined && r.data[k] !== null);
    checkEl.textContent = "형식 정상. 항목: " + keys.join(", ") + (r.warnings.length ? " (무시되는 항목: " + r.warnings.join(", ") + ")" : "");
    checkEl.className = "check ok";
  } else {
    checkEl.textContent = r.errors[0] + (r.errors.length > 1 ? " 외 " + (r.errors.length - 1) + "건" : "");
    checkEl.className = "check err";
  }
  applyBtn.disabled = !r.ok;
  return r;
}

async function currentJson() {
  const data = { app: "damoang-ui-extension", schema: 1, exportedAt: new Date().toISOString() };
  for (const key of RESTORE_KEYS) {
    const v = await duiRead(key);
    if (v !== undefined) data[key] = v;
  }
  return JSON.stringify(data, null, 2);
}

async function loadCurrent() {
  loadedText = await currentJson();
  editor.value = loadedText;
  showCheck();
}

let checkTimer = 0;
editor.addEventListener("input", () => {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(showCheck, 250);
  setAdvMsg("");
});

reloadBtn.addEventListener("click", async () => {
  if (editor.value !== loadedText && !confirm("편집한 내용을 버리고 현재 설정을 다시 불러올까요?")) return;
  await loadCurrent();
  setAdvMsg("현재 설정을 불러왔습니다.", "ok");
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(editor.value);
    setAdvMsg("복사했습니다.", "ok");
  } catch (e) {
    editor.focus();
    editor.select();
    setAdvMsg("클립보드에 쓰지 못했습니다. 선택된 내용을 직접 복사해 주세요.", "err");
  }
});

// 백업은 편집 내용이 아니라 저장된 현재 설정을 내보낸다
exportBtn.addEventListener("click", async () => {
  setMsg("");
  const json = await currentJson();
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const name = "damoang-ui-extension-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
  // iOS Safari 는 확장 페이지의 blob 주소를 열지 못한다. iOS 에서만 공유 시트(파일에 저장)로 내보낸다.
  // macOS 도 파일 공유가 되지만 공유 시트에는 저장 항목이 없어 일반 다운로드가 맞다
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const file = new File([json], name, { type: "application/json" });
  if (ios && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      setMsg("공유 시트에서 저장한 곳에 백업 파일이 있습니다.", "ok");
    } catch (e) {
      if (!(e && e.name === "AbortError")) setMsg("백업 파일을 내보내지 못했습니다: " + (e && e.message ? e.message : e), "err");
    }
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setMsg("백업 파일을 내려받았습니다.", "ok");
});

pickBtn.addEventListener("click", () => fileInput.click());

async function applyData(data) {
  let wrote = 0;
  for (const key of RESTORE_KEYS) {
    const v = data[key];
    if (v === undefined || v === null) continue;
    await duiWrite(key, v);
    wrote += 1;
  }
  return wrote;
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  pickBtn.disabled = true;
  setMsg("복원하는 중…");
  try {
    const text = await file.text();
    const r = validate(text);
    if (!r.ok) {
      editor.value = text;
      advEl.open = true;
      showCheck();
      setMsg("파일 형식에 문제가 있어 적용하지 않았습니다. 아래 편집 영역에서 고친 뒤 적용할 수 있습니다: " + r.errors[0], "err");
      return;
    }
    const wrote = await applyData(r.data);
    await loadCurrent();
    setMsg("복원했습니다 (" + wrote + "개 항목). 이 탭을 닫고 팝업을 열면 반영되어 있습니다.", "ok");
  } catch (e) {
    setMsg("복원 실패: " + (e && e.message ? e.message : e), "err");
  } finally {
    pickBtn.disabled = false;
  }
});

applyBtn.addEventListener("click", async () => {
  setAdvMsg("");
  const r = showCheck();
  if (!r || !r.ok) return;
  applyBtn.disabled = true;
  try {
    const wrote = await applyData(r.data);
    await loadCurrent();
    setAdvMsg("적용했습니다 (" + wrote + "개 항목). 팝업을 열면 반영되어 있습니다.", "ok");
  } catch (e) {
    setAdvMsg("적용 실패: " + (e && e.message ? e.message : e), "err");
  } finally {
    showCheck();
  }
});

loadCurrent();
