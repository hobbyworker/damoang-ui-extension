// 게시판 목록에 두 가지를 표시한다.
// 제목 강조: 등록한 키워드를 CSS Custom Highlight API 로 칠한다. DOM 을 바꾸지 않아 SvelteKit 렌더링과 충돌하지 않는다.
// 사용자 강조: 글쓴이 닉네임이 등록된 행에 클래스 하나를 붙이고 선·배경·마크는 스타일시트가 그린다.
// 그룹에 등록된 닉네임은 그룹 스타일(dui-follow-g0 ...), 나머지 팔로우 회원은 팔로우 스타일(dui-follow-d).
// 팔로우 목록은 페이지를 열 때마다 서버에서 받으므로 따로 동기화하지 않는다.
// 설정은 chrome.storage.local 의 "highlight", "member". 팝업이 쓰고 여기서 읽는다
(() => {
  const HL_KEY = "highlight";
  const FOLLOW_KEY = "member";
  const PREFIX = "dui-hl-";
  const FOLLOW_PREFIX = "dui-follow-";
  const FOLLOW_API = "https://damoang.net/api/my/following";
  // 읽은 글은 post-title 대신 post-title-read-dimmed 를 쓴다
  const TITLE_SEL = "a.post-row .post-title, a.post-row .post-title-read-dimmed";
  // 글쓴이 닉네임은 메타 영역의 드롭다운 버튼 텍스트. 데스크톱·모바일 둘 중 먼저 보이는 쪽
  const AUTHOR_SEL = ".post-meta-text button[data-dropdown-menu-trigger], .mobile-meta button[data-dropdown-menu-trigger]";
  const hasHighlight = "highlights" in CSS;

  let hl = { groups: [] };
  let follow = null;
  let following = null;
  let followLoading = false;
  let timer = null;
  let lastCss = "";
  // 등록한 Highlight 이름. CSS.highlights 를 순회하면 Firefox(Xray)에서 막히므로 직접 기억한다
  let hlNames = [];

  const bool = (v, d) => (typeof v === "boolean" ? v : d);

  // 그룹 도입 전 형식(키워드 목록 하나)과 일치 옵션이 전역이던 형식도 읽는다
  function normalizeHl(raw) {
    const out = { groups: [] };
    if (!raw || typeof raw !== "object") return out;
    const src = Array.isArray(raw.groups) ? raw.groups
      : Array.isArray(raw.keywords) && raw.keywords.length ? [raw] : [];
    out.groups = src.map(g => ({
      on: bool(g.on, true),
      lightColor: g.lightColor || "#fff176",
      darkColor: g.darkColor || "#9e6a03",
      partial: bool(g.partial, bool(raw.partial, true)),
      ignoreCase: bool(g.ignoreCase, bool(raw.ignoreCase, true)),
      keywords: Array.isArray(g.keywords) ? g.keywords.map(String) : []
    }));
    return out;
  }

  function normalizeStyle(raw, onDefault) {
    const r = raw && typeof raw === "object" ? raw : {};
    const line = r.line || {}, bg = r.bg || {}, mark = r.mark || {};
    return {
      on: bool(r.on, onDefault),
      line: { on: bool(line.on, true), type: line.type === "box" ? "box" : "left", lightColor: line.lightColor || "#1a73e8", darkColor: line.darkColor || "#8ab4f8" },
      bg: { on: bool(bg.on, true), lightColor: bg.lightColor || "#e8f0fe", darkColor: bg.darkColor || "#1c2a3f" },
      mark: { on: bool(mark.on, true), text: String(mark.text || "★").slice(0, 6), lightBg: mark.lightBg || "#1a73e8", lightFg: mark.lightFg || "#ffffff", darkBg: mark.darkBg || "#8ab4f8", darkFg: mark.darkFg || "#0d1117" }
    };
  }

  function normalizeFollow(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      follow: normalizeStyle(r.follow, false),
      groups: (Array.isArray(r.groups) ? r.groups : []).map(g => ({
        style: normalizeStyle(g && g.style, true),
        members: (g && Array.isArray(g.members) ? g.members : []).map(m => String(m).trim()).filter(Boolean)
      }))
    };
  }

  function styleOn(s) {
    return s.on && (s.line.on || s.bg.on || s.mark.on);
  }

  function groupsActive() {
    return !!follow && follow.groups.some(g => styleOn(g.style) && g.members.length);
  }

  function followActive() {
    return !!follow && styleOn(follow.follow);
  }

  // 닉네임 -> 행에 붙일 클래스. 그룹이 먼저, 나머지 팔로우 회원은 팔로우 스타일
  function buildNickMap() {
    const map = new Map();
    if (!follow) return map;
    const taken = new Set();
    follow.groups.forEach((g, i) => {
      for (const nick of g.members) {
        if (taken.has(nick)) continue;
        taken.add(nick);
        if (styleOn(g.style)) map.set(nick, FOLLOW_PREFIX + "g" + i);
      }
    });
    if (followActive() && following) {
      for (const m of following) if (!taken.has(m.nick)) map.set(m.nick, FOLLOW_PREFIX + "d");
    }
    return map;
  }

  function styleCss(cls, s, dark) {
    const row = "a.post-row." + cls;
    let css = "";
    if (s.line.on) {
      const c = dark ? s.line.darkColor : s.line.lightColor;
      css += row + "{box-shadow:" + (s.line.type === "box" ? "inset 0 0 0 2px " : "inset 3px 0 0 ") + c + ";}";
    }
    if (s.bg.on) {
      css += row + "{background-color:" + (dark ? s.bg.darkColor : s.bg.lightColor) + ";}";
    }
    if (s.mark.on) {
      css += row + " .post-title::before," + row + " .post-title-read-dimmed::before{content:" + cssString(s.mark.text)
        + ";display:inline-block;margin-right:4px;padding:0 4px;border-radius:4px;font-size:.75em;line-height:1.5;vertical-align:1px;"
        + "background:" + (dark ? s.mark.darkBg : s.mark.lightBg) + ";color:" + (dark ? s.mark.darkFg : s.mark.lightFg) + ";}";
    }
    return css;
  }

  // 다모앙 테마는 <html class> 가 dark 또는 amoled
  function isDark() {
    const c = document.documentElement.classList;
    return c.contains("dark") || c.contains("amoled");
  }

  function cssString(s) {
    return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  }

  // 스타일은 한 번만 만들고, 내용이 달라질 때만 바꿔 MutationObserver 가 되먹임하지 않게 한다
  function updateStyle() {
    const dark = isDark();
    let css = "";
    hl.groups.forEach((g, i) => {
      if (!g.on || !g.keywords.length) return;
      css += "::highlight(" + PREFIX + i + "){background-color:" + (dark ? g.darkColor : g.lightColor) + ";}";
    });
    if (followActive()) css += styleCss(FOLLOW_PREFIX + "d", follow.follow, dark);
    if (groupsActive()) follow.groups.forEach((g, i) => { css += styleCss(FOLLOW_PREFIX + "g" + i, g.style, dark); });
    if (css === lastCss) return;
    lastCss = css;
    let style = document.getElementById("dui-highlight-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "dui-highlight-style";
      document.documentElement.append(style);
    }
    style.textContent = css;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 부분 일치가 아니면 글자·숫자가 앞뒤에 붙지 않은 경우만 잡는다 (한글에는 \b 가 안 통한다)
  function buildRegex(g) {
    const words = g.keywords.map(w => escapeRe(String(w).trim())).filter(Boolean);
    if (!words.length) return null;
    const core = "(?:" + words.join("|") + ")";
    const pattern = g.partial ? core : "(?<![\\p{L}\\p{N}])" + core + "(?![\\p{L}\\p{N}])";
    return new RegExp(pattern, "gu" + (g.ignoreCase ? "i" : ""));
  }

  function applyHighlight() {
    if (!hasHighlight) return;
    for (const name of hlNames) CSS.highlights.delete(name);
    hlNames = [];
    const jobs = [];
    hl.groups.forEach((g, i) => {
      const re = g.on ? buildRegex(g) : null;
      if (re) jobs.push({ re, hl: new Highlight(), name: PREFIX + i });
    });
    if (!jobs.length) return;
    for (const el of document.querySelectorAll(TITLE_SEL)) {
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const text = node.data;
        for (const job of jobs) {
          job.re.lastIndex = 0;
          let m;
          while ((m = job.re.exec(text))) {
            if (!m[0]) {
              job.re.lastIndex++;
              continue;
            }
            const r = new Range();
            r.setStart(node, m.index);
            r.setEnd(node, m.index + m[0].length);
            job.hl.add(r);
          }
        }
      }
    }
    for (const job of jobs) {
      CSS.highlights.set(job.name, job.hl);
      hlNames.push(job.name);
    }
  }

  // 팔로우 목록은 페이지를 열 때 한 번 받는다. 비로그인이면 빈 목록
  function loadFollowing() {
    if (following || followLoading) return;
    followLoading = true;
    fetch(FOLLOW_API, { credentials: "same-origin" })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const list = j && Array.isArray(j.data) ? j.data : [];
        following = list
          .map(m => ({ id: String(m.mb_id || ""), nick: String(m.mb_nick || "").trim() }))
          .filter(m => m.id && m.nick);
        schedule();
      })
      .catch(() => { following = []; })
      .finally(() => { followLoading = false; });
  }

  // 행에 클래스만 붙인다. Svelte 가 class 를 다시 쓰면 옵저버가 다시 붙인다
  function applyFollow() {
    if (followActive() && !following) loadFollowing();
    const map = buildNickMap();
    for (const row of document.querySelectorAll("a.post-row")) {
      let want = "";
      if (map.size) {
        const btn = row.querySelector(AUTHOR_SEL);
        want = (btn && map.get(btn.textContent.trim())) || "";
      }
      for (const c of Array.from(row.classList)) {
        if (c.startsWith(FOLLOW_PREFIX) && c !== want) row.classList.remove(c);
      }
      if (want) row.classList.add(want);
    }
  }

  // 한쪽이 실패해도 다른 쪽은 칠한다
  function apply() {
    try {
      applyHighlight();
    } catch (e) {
      console.warn("[다모앙UI] 제목 강조 실패", e);
    }
    try {
      applyFollow();
    } catch (e) {
      console.warn("[다모앙UI] 사용자 강조 실패", e);
    }
    updateStyle();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 150);
  }

  chrome.storage.local.get([HL_KEY, FOLLOW_KEY], (res) => {
    hl = normalizeHl(res[HL_KEY]);
    follow = normalizeFollow(res[FOLLOW_KEY]);
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[HL_KEY]) hl = normalizeHl(changes[HL_KEY].newValue);
    if (changes[FOLLOW_KEY]) follow = normalizeFollow(changes[FOLLOW_KEY].newValue);
    if (changes[HL_KEY] || changes[FOLLOW_KEY]) apply();
  });

  // 목록은 클라이언트 이동·스크롤로 바뀌므로 DOM 변화마다 다시 칠한다.
  // 행의 class 도 본다 (Svelte 가 덮어쓰면 팔로우 클래스가 사라진다). 같은 값으로 toggle 하면 변경이 안 생겨 되먹임은 없다
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  new MutationObserver(updateStyle).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();
