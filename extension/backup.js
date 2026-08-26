// 백업·복원 페이지. Firefox 는 팝업에서 파일 선택 창을 열면 팝업이 닫혀 복원을 이어갈 수 없어
// 팝업 대신 이 페이지를 새 탭으로 연다 (통일성을 위해 백업도 여기서). 복원은 파일의 원본 값을
// 그대로 저장하고, 형식 보정은 팝업·content script 가 읽을 때 normalize 로 처리한다

const RESTORE_KEYS = ["highlight", "member", "pmenu", "emprio", "view"];

const exportBtn = document.getElementById("export-btn");
const pickBtn = document.getElementById("pick-btn");
const fileInput = document.getElementById("file-input");
const msgEl = document.getElementById("msg");

// 화면모드는 팝업 설정을 따른다 (같은 출처의 localStorage)
const theme = localStorage.getItem("theme");
if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;

function setMsg(text, cls) {
  msgEl.hidden = !text;
  msgEl.textContent = text || "";
  msgEl.className = cls || "";
}

exportBtn.addEventListener("click", async () => {
  setMsg("");
  const data = { app: "damoang-ui-extension", schema: 1, exportedAt: new Date().toISOString() };
  for (const key of RESTORE_KEYS) {
    const v = await duiRead(key);
    if (v !== undefined) data[key] = v;
  }
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
  setMsg("백업 파일을 내려받았습니다.", "ok");
});

pickBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  pickBtn.disabled = true;
  setMsg("복원하는 중…");
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== "damoang-ui-extension") throw new Error("이 확장의 백업 파일이 아닙니다");
    let wrote = 0;
    for (const key of RESTORE_KEYS) {
      if (data[key] === undefined) continue;
      await duiWrite(key, data[key]);
      wrote += 1;
    }
    if (!wrote) throw new Error("파일에 복원할 설정이 없습니다");
    setMsg("복원했습니다. 이 탭을 닫고 팝업을 열면 반영되어 있습니다.", "ok");
  } catch (e) {
    setMsg("복원 실패: " + (e && e.message ? e.message : e), "err");
  } finally {
    pickBtn.disabled = false;
  }
});
