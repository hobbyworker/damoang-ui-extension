// 게시판 목록에 두 가지를 표시한다.
// 제목 강조: 등록한 키워드를 CSS Custom Highlight API 로 칠한다. DOM 을 바꾸지 않아 SvelteKit 렌더링과 충돌하지 않는다.
// 사용자 강조: 글쓴이 닉네임이 등록된 행에 클래스 하나를 붙이고 선·배경·마크는 스타일시트가 그린다.
// 그룹에 등록된 닉네임은 그룹 스타일(dui-follow-g0 ...), 나머지 팔로우 회원은 팔로우 스타일(dui-follow-d).
// 팔로우 목록은 페이지를 열 때마다 서버에서 받으므로 따로 동기화하지 않는다.
// 설정은 "highlight", "member" (common.js 저장 계층, storage.sync + 구버전 local 폴백). 팝업이 쓰고 여기서 읽는다
(() => {
  // 확장을 설치·갱신하면 Safari 는 열려 있는 탭에 새 스크립트를 바로 주입하고 옛 스크립트도 살아 남는다.
  // 둘이 같은 요소를 서로 갈아치우며 깜빡이므로 문서에 토큰을 적어 가장 나중 인스턴스만 동작한다.
  // 리스너는 listen() 으로 걸어 소유자가 아니면 반응하지 않는다
  const INSTANCE = Math.random().toString(36).slice(2) + Date.now().toString(36);
  document.documentElement.dataset.duiInstance = INSTANCE;
  const owner = () => document.documentElement.dataset.duiInstance === INSTANCE;
  const listen = (target, type, fn, opts) => target.addEventListener(type, (e) => { if (owner()) fn(e); }, opts);
  const HL_KEY = "highlight";
  const FOLLOW_KEY = "member";
  const PMENU_KEY = "pmenu";
  const PRIO_KEY = "emprio";
  const VIEW_KEY = "view";
  const QP_KEY = "qprofile";
  const PREFIX = "dui-hl-";
  const HLROW_PREFIX = "dui-hlrow-";
  const FOLLOW_PREFIX = "dui-follow-";
  const FOLLOW_API = "https://damoang.net/api/my/following";
  // 읽은 글은 post-title 대신 post-title-read-dimmed 를 쓴다
  const TITLE_SEL = "a.post-row .post-title, a.post-row .post-title-read-dimmed";
  // 글쓴이 닉네임은 메타 영역의 드롭다운 버튼 텍스트. 데스크톱·모바일 둘 중 먼저 보이는 쪽
  const AUTHOR_SEL = ".post-meta-text button[data-dropdown-menu-trigger], .mobile-meta button[data-dropdown-menu-trigger]";
  // 댓글 작성자도 같은 드롭다운 버튼. 답글 대상 표시(→ 닉네임)는 span 이라 안 걸린다
  const COMMENT_SEL = "li.comment-item";
  const COMMENT_AUTHOR_SEL = "button[data-dropdown-menu-trigger]";
  const hasHighlight = "highlights" in CSS;

  let hl = { groups: [] };
  let follow = null;
  let pmenu = { on: false };
  let prio = { first: "member" };
  let view = { cwide: false, mwide: false, memberTab: true, dlgScroll: true, dlog: true };
  let qp = { btn: true, list: [] };
  let following = null;
  let followLoading = false;
  let timer = null;
  let lastCss = "";
  // 등록한 Highlight 이름. CSS.highlights 를 순회하면 Firefox(Xray)에서 막히므로 직접 기억한다
  let hlNames = [];
  // 마지막으로 칠한 제목 텍스트 노드들과 설정 세대. 같으면 Range 를 다시 만들지 않는다.
  // 사이트가 시계·광고로 DOM 을 자주 건드려 apply 가 초당 여러 번 도는데, 그때마다 살아 있는 Range 를
  // 수백 개 새로 만들면 GC 전까지 DOM 변경마다 갱신 대상이 되어 페이지 전체가 느려진다
  let hlLastNodes = [];
  let hlLastTexts = [];
  let hlLastRows = [];
  let hlRev = 0;
  let hlLastRev = -1;

  const bool = (v, d) => (typeof v === "boolean" ? v : d);

  // 선·배경·마크 섹션 공통 normalize
  function normalizeSections(r, onDef) {
    const line = r.line || {}, bg = r.bg || {}, mark = r.mark || {};
    return {
      line: { on: bool(line.on, onDef), type: line.type === "box" ? "box" : "left", lightColor: line.lightColor || "#1a73e8", darkColor: line.darkColor || "#8ab4f8" },
      bg: { on: bool(bg.on, onDef), lightColor: bg.lightColor || "#e8f0fe", darkColor: bg.darkColor || "#1c2a3f" },
      mark: { on: bool(mark.on, onDef), text: String(mark.text || "★").slice(0, 6), lightBg: mark.lightBg || "#1a73e8", lightFg: mark.lightFg || "#ffffff", darkBg: mark.darkBg || "#8ab4f8", darkFg: mark.darkFg || "#0d1117" }
    };
  }

  // 그룹 도입 전 형식(키워드 목록 하나), 일치 옵션이 전역이던 형식, 형광펜 색이 그룹 최상위이던 형식(0.3.0)도 읽는다
  function normalizeHl(raw) {
    const out = { groups: [] };
    if (!raw || typeof raw !== "object") return out;
    const src = Array.isArray(raw.groups) ? raw.groups
      : Array.isArray(raw.keywords) && raw.keywords.length ? [raw] : [];
    out.groups = src.map(g => {
      const pen = g.pen || {};
      return Object.assign({
        on: bool(g.on, true),
        partial: bool(g.partial, bool(raw.partial, true)),
        ignoreCase: bool(g.ignoreCase, bool(raw.ignoreCase, true)),
        keywords: Array.isArray(g.keywords) ? g.keywords.map(String) : [],
        pen: {
          on: bool(pen.on, true),
          lightColor: pen.lightColor || g.lightColor || "#fff176",
          darkColor: pen.darkColor || g.darkColor || "#9e6a03"
        }
      }, normalizeSections(g, false));
    });
    return out;
  }

  function normalizeStyle(raw, onDefault) {
    const r = raw && typeof raw === "object" ? raw : {};
    const cbg = typeof r.commentsBg === "boolean" ? r.commentsBg
      : typeof r.commentsNoBg === "boolean" ? !r.commentsNoBg : false;
    return Object.assign({ on: bool(r.on, onDefault), comments: bool(r.comments, false), commentsBg: cbg }, normalizeSections(r, true));
  }

  function normalizePrio(raw) {
    return { first: raw && raw.first === "title" ? "title" : "member" };
  }

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
      if (list.length >= 30) break;
    }
    return { btn: bool(r.btn, true), info: bool(r.info, true), list };
  }

  function normalizeView(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      cwide: bool(r.cwide, r.cnick === "wide" || r.cnick === "full" || bool(r.wideNick, false)),
      mwide: bool(r.mwide, bool(r.wideNick, false)),
      memberTab: bool(r.memberTab, true),
      dlgScroll: bool(r.dlgScroll, true),
      dlog: bool(r.dlog, true),
      mlayout: r.mlayout === "l1" || r.mlayout === "l2" ? r.mlayout : "default",
      mheart: r.mheart === "desk" ? "desk" : "default",
      micon: bool(r.micon, false)
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

  function normalizePmenu(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      on: bool(r.on, true),
      info: bool(r.info, true),
      hidden: Array.isArray(r.hidden) ? r.hidden.map(String) : []
    };
  }

  function hlRowActive(g) {
    return g.on && g.keywords.length > 0 && (g.line.on || g.bg.on || g.mark.on);
  }

  function groupsActive() {
    return !!follow && follow.groups.some(g => styleOn(g.style) && g.members.length);
  }

  function followActive() {
    return !!follow && styleOn(follow.follow);
  }

  // 닉네임 -> 붙일 클래스와 댓글 적용 여부. 그룹이 먼저, 나머지 팔로우 회원은 팔로우 스타일
  function buildNickMap() {
    const map = new Map();
    if (!follow) return map;
    const taken = new Set();
    follow.groups.forEach((g, i) => {
      for (const nick of g.members) {
        if (taken.has(nick)) continue;
        taken.add(nick);
        if (styleOn(g.style)) map.set(nick, { cls: FOLLOW_PREFIX + "g" + i, cm: g.style.comments });
      }
    });
    if (followActive() && following) {
      for (const m of following) {
        if (!taken.has(m.nick)) map.set(m.nick, { cls: FOLLOW_PREFIX + "d", cm: follow.follow.comments });
      }
    }
    return map;
  }

  function styleCss(cls, s, dark) {
    const row = "a.post-row." + cls;
    const cmt = COMMENT_SEL + "." + cls;
    let css = "";
    if (s.line.on) {
      const c = dark ? s.line.darkColor : s.line.lightColor;
      const line = (s.line.type === "box" ? "inset 0 0 0 2px " : "inset 3px 0 0 ") + c;
      css += row + "{box-shadow:" + line + ";}";
      if (s.comments) css += cmt + "{box-shadow:" + line + ";}";
    }
    if (s.bg.on) {
      const c = dark ? s.bg.darkColor : s.bg.lightColor;
      css += row + "{background-color:" + c + ";}";
      if (s.comments && s.commentsBg) css += cmt + "{background-color:" + c + ";}";
    }
    if (s.mark.on) {
      const markCss = "{content:" + cssString(s.mark.text)
        + ";display:inline-block;margin-right:4px;padding:0 4px;border-radius:4px;font-size:.75em;line-height:1.5;vertical-align:1px;"
        + "background:" + (dark ? s.mark.darkBg : s.mark.lightBg) + ";color:" + (dark ? s.mark.darkFg : s.mark.lightFg) + ";}";
      css += row + " .post-title::before," + row + " .post-title-read-dimmed::before" + markCss;
      if (s.comments) css += cmt + " " + COMMENT_AUTHOR_SEL + "::before" + markCss;
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
  // 모바일 게시글 레이아웃. 사이트의 모바일 목록(md 미만)에서 제목줄과 메타줄을
  // display:contents 로 풀어 grid 로 재배치한다. DOM 은 건드리지 않는다.
  // 유형 1: [공감 제목] / [태그 시간 조회 ... 메모 닉네임]
  // 유형 2: [태그 제목] / [공감 시간 조회 ... 메모 닉네임]
  // 닉네임을 오른쪽 끝으로 보내 목록 가운데를 누르다 메뉴가 열리는 것을 막는 것이 목적
  function mlayoutCss() {
    if (view.mlayout === "default" && view.mheart !== "desk" && !view.micon && !view.mwide) return "";
    // 대상은 사이트의 모던 목록. 두 경로로 나타난다:
    // 1) 좁은 화면 - 목록 스타일과 무관하게 모던형이 강제됨 (미디어 쿼리로 적용)
    // 2) 목록 스타일이 모던 - 넓은 화면에서도 .mobile-meta 에 modern-view 가 붙음 (행 조건으로 적용)
    // 같은 규칙을 두 스코프로 발행한다
    const rules = (ROW) => {
      const CONTENT = ROW + " > div > div.min-w-0";
      // .mobile-meta 도 div 라서 제외하지 않으면 태그 셀렉터가 메타 span 까지 삼킨다
      const TLINE = CONTENT + " > div:not(.mobile-meta)";
      const META = CONTENT + " > .mobile-meta";
      const HEART = META + " > span:nth-of-type(1)";
      const TIME = META + " > span:nth-of-type(2)";
      const VIEWS = META + " > span:nth-of-type(3)";
      const NICK = META + " > span:nth-of-type(4)";
      const TAG = TLINE + " > span:not(.flex-1):not(.memo-badge)";
      const TITLE = TLINE + " > span.flex-1";
      const MEMO = TLINE + " > .memo-badge";
      let css = "";
      if (view.mlayout !== "default") {
        // grid 는 열 너비를 두 줄이 공유해 공감 칸이 2행 왼쪽까지 차지한다.
        // flex wrap + 가짜 줄바꿈(::before, flex-basis 100%) + order 로 줄을 독립시킨다
        css += CONTENT + "{display:flex !important;flex-wrap:wrap;align-items:center;row-gap:2px;column-gap:6px;}"
          + TLINE + "," + META + "{display:contents !important;}"
          + META + " > span:nth-of-type(2)::before," + META + " > span:nth-of-type(4)::before{content:none !important;}"
          + CONTENT + "::before{content:\"\";flex-basis:100%;height:0;order:3;}"
          + TITLE + "{order:2;flex:1 1 0;min-width:0;}"
          + TIME + "{order:5;}"
          + VIEWS + "{order:6;}"
          + MEMO + "{order:8;margin-left:auto;pointer-events:none;}"
          + MEMO + ".memo-badge--expand{max-width:none !important;}"
          + NICK + "{order:9;min-width:0;}"
          + CONTENT + ":not(:has(.memo-badge)) > .mobile-meta > span:nth-of-type(4){margin-left:auto;}";
        if (view.mlayout === "l1") {
          css += HEART + "{order:1;}" + TAG + "{order:4;}";
        } else {
          css += TAG + "{order:1;}" + HEART + "{order:4;}";
        }
        if (!view.mwide) {
          // 말줄임표 대신 끝 페이드. 폭은 데스크톱 닉 칸(120px)과 같게.
          // 그라데이션 좌표를 120px 끝에 고정해 그보다 짧은 닉네임에는 페이드가 안 걸린다.
          // text-overflow clip: 사이트 truncate 클래스의 말줄임표가 페이드 안에 그려지는 것을 막는다
          css += NICK + " button[data-dropdown-menu-trigger]{display:inline-block;max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:clip;"
            + "-webkit-mask-image:linear-gradient(to right,#000 106px,transparent 120px);"
            + "mask-image:linear-gradient(to right,#000 106px,transparent 120px);}";
        }
      }
      // 닉네임 전체 표시는 레이아웃과 독립. 사이트가 버튼에 max-w 11rem 을 걸어 두어 풀지 않으면 잘린다
      if (view.mwide) {
        css += NICK + " button[data-dropdown-menu-trigger]{max-width:none;}";
      }
      // 데스크탑 타입 공감. 모양은 CSS, 색·숫자는 applyHeartPill 이
      // 같은 행의 데스크톱 알약에서 복사한다 (사이트의 단계별 색을 그대로 따라감)
      if (view.mheart === "desk") {
        css += HEART + "{min-width:40px;min-height:20px;padding:0 6px;border-radius:8px;"
          + "display:inline-flex;align-items:center;justify-content:center;"
          + "font-size:12px;font-weight:600;}"
          + HEART + " svg{display:none;}";
      }
      // 닉네임 아이콘 (applyNickIcon 이 복제). 기본 레이아웃은 닉 왼쪽, 유형 1·2 는 오른쪽 끝
      if (view.micon) {
        css += ROW + " .mobile-meta .dui-avatar{width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0;}";
        if (view.mlayout === "default") {
          // 구분점(::before)도 플렉스 항목이라 순서를 함께 지정해야 점, 아바타, 이름 순이 된다
          css += ROW + " .mobile-meta .dui-avatar{order:-1;}"
            + ROW + " .mobile-meta > span:nth-of-type(4)::before{order:-2;}";
        }
      }
      return css;
    };
    return "@media (max-width: 767px){" + rules("a.post-row") + "}"
      + rules("a.post-row:has(.mobile-meta.modern-view)");
  }

  // 데스크탑 타입 공감: 같은 행의 데스크톱 알약에서 배경색, 글자색, 쉼표 숫자를 복사한다.
  // 끄면 원래 값으로 되돌린다. Svelte 가 되돌려 써도 다음 적용에서 다시 잡는다
  function applyHeartPill() {
    const desk = view.mheart === "desk";
    for (const row of document.querySelectorAll("a.post-row")) {
      const sp = row.querySelector(".mobile-meta > span:first-of-type");
      if (!sp) continue;
      let tn = null;
      for (const n of sp.childNodes) {
        if (n.nodeType === 3 && n.nodeValue.trim()) tn = n;
      }
      if (desk) {
        const pill = row.querySelector(":scope > div > div:first-child > div");
        if (!pill) continue;
        const txt = pill.textContent.trim();
        if (tn && txt && tn.nodeValue !== txt) {
          if (sp.dataset.duiHeart === undefined) sp.dataset.duiHeart = tn.nodeValue;
          tn.nodeValue = txt;
        }
        // 색 적용 여부는 텍스트 보관과 별개로 표시해 둔다. 안 그러면 숫자가 같아
        // 텍스트 보관이 없는 행에서 끌 때 색 잔재가 남는다
        sp.dataset.duiPill = "1";
        if (sp.style.background !== pill.style.background) sp.style.background = pill.style.background;
        if (sp.style.color !== pill.style.color) sp.style.color = pill.style.color;
      } else {
        if (sp.dataset.duiHeart !== undefined) {
          if (tn) tn.nodeValue = sp.dataset.duiHeart;
          delete sp.dataset.duiHeart;
        }
        if (sp.dataset.duiPill) {
          delete sp.dataset.duiPill;
          sp.style.background = "";
          sp.style.color = "";
        }
      }
    }
  }

  // 닉네임 아이콘. 데스크톱 닉 칸의 아바타를 모바일 닉 칸에 복제해 붙인다.
  // 끄거나 아바타가 없으면 걷어낸다. 우리 것은 dui-avatar 로 표시해 중복을 막는다
  function applyNickIcon() {
    for (const row of document.querySelectorAll("a.post-row")) {
      const nick = row.querySelector(".mobile-meta > span:nth-of-type(4)");
      if (!nick) continue;
      const cur = nick.querySelector("img.dui-avatar");
      const src = view.micon ? row.querySelector(":scope > div > div.min-w-0 > span img") : null;
      if (!src) {
        if (cur) cur.remove();
        continue;
      }
      if (cur) {
        if (cur.getAttribute("src") !== src.getAttribute("src")) cur.setAttribute("src", src.getAttribute("src"));
        continue;
      }
      const img = document.createElement("img");
      img.className = "dui-avatar";
      img.src = src.getAttribute("src");
      if (src.getAttribute("srcset")) img.srcset = src.getAttribute("srcset");
      img.alt = "";
      img.loading = "lazy";
      nick.append(img);
    }
  }

  // 이용제한 기록 프로필 보기. 기록 목록 행과 상세 머리글의 회원 아이디를 누르면 프로필로 이동한다.
  // 목록 행은 자체가 기록 상세 링크(a)라 중첩 앵커 대신 span 클릭을 가로채 클라이언트 이동한다.
  // 대상은 닉네임(font-medium/font-bold) 바로 옆의 회색 아이디 span
  function applyDlog() {
    if (!location.pathname.startsWith("/disciplinelog")) return;
    for (const sp of document.querySelectorAll('span[class*="muted-foreground/70"]')) {
      const prev = sp.previousElementSibling;
      if (!prev || !(prev.classList.contains("font-medium") || prev.classList.contains("font-bold"))) continue;
      if (!view.dlog) {
        sp.classList.remove("dui-dlog");
        continue;
      }
      sp.classList.add("dui-dlog");
      if (sp.dataset.duiDlog) continue;
      sp.dataset.duiDlog = "1";
      sp.addEventListener("click", (e) => {
        if (!view.dlog) return;
        e.preventDefault();
        e.stopPropagation();
        goTo("/member/" + sp.textContent.trim());
      });
    }
  }

  function updateStyle() {
    const dark = isDark();
    let css = "";
    hl.groups.forEach((g, i) => {
      if (!g.on || !g.pen.on || !g.keywords.length) return;
      css += "::highlight(" + PREFIX + i + "){background-color:" + (dark ? g.pen.darkColor : g.pen.lightColor) + ";}";
    });
    // 클래식 닉네임 전체 표시: 넘치는 행에만 붙는 클래스. 그 행의 제목 칸만 양보한다.
    // 칸과 별개로 안쪽 버튼에도 사이트 상한(max-w 11rem)이 있어 같이 푼다
    if (view.cwide) {
      css += "a.post-row .dui-widenick{width:auto !important;max-width:none;}"
        + "a.post-row .dui-widenick button[data-dropdown-menu-trigger]{max-width:none;}";
    }
    css += mlayoutCss();
    if (view.dlog) {
      css += ".dui-dlog{text-decoration:underline;text-underline-offset:2px;cursor:pointer;}";
    }
    // 행 스타일은 나중에 출력한 쪽이 이긴다
    let hlRowCss = "";
    hl.groups.forEach((g, i) => { if (hlRowActive(g)) hlRowCss += styleCss(HLROW_PREFIX + "g" + i, g, dark); });
    let memberCss = "";
    if (followActive()) memberCss += styleCss(FOLLOW_PREFIX + "d", follow.follow, dark);
    if (groupsActive()) follow.groups.forEach((g, i) => { memberCss += styleCss(FOLLOW_PREFIX + "g" + i, g.style, dark); });
    css += prio.first === "title" ? memberCss + hlRowCss : hlRowCss + memberCss;
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
    const rows = document.querySelectorAll("a.post-row");
    const nodes = [];
    const texts = [];
    for (const row of rows) {
      for (const el of row.querySelectorAll(".post-title, .post-title-read-dimmed")) {
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          nodes.push(node);
          texts.push(node.data);
        }
      }
    }
    // 사이트가 행의 class 속성을 통째로 다시 쓰면 우리 행 클래스가 사라질 수 있어 그것도 확인한다
    if (hlLastRev === hlRev && nodes.length === hlLastNodes.length && nodes.every((n, i) => n === hlLastNodes[i] && texts[i] === hlLastTexts[i])
      && hlLastRows.every(([row, want]) => !want || row.classList.contains(want))) return;
    hlLastRev = hlRev;
    hlLastNodes = nodes;
    hlLastTexts = texts;
    hlLastRows = [];
    for (const name of hlNames) {
      if (hasHighlight) CSS.highlights.delete(name);
    }
    hlNames = [];
    const jobs = [];
    hl.groups.forEach((g, i) => {
      const rowClass = hlRowActive(g) ? HLROW_PREFIX + "g" + i : "";
      const pen = hasHighlight && g.on && g.pen.on;
      const re = g.on && (pen || rowClass) ? buildRegex(g) : null;
      if (re) jobs.push({ re, pen, rowClass, hl: pen ? new Highlight() : null, name: PREFIX + i });
    });
    for (const row of rows) {
      // 그룹 순서상 먼저 맞은 그룹의 행 스타일을 쓴다
      let want = "";
      for (const el of row.querySelectorAll(".post-title, .post-title-read-dimmed")) {
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          const text = node.data;
          for (const job of jobs) {
            job.re.lastIndex = 0;
            let m;
            let hit = false;
            while ((m = job.re.exec(text))) {
              if (!m[0]) {
                job.re.lastIndex++;
                continue;
              }
              hit = true;
              if (!job.pen) break;
              const r = new Range();
              r.setStart(node, m.index);
              r.setEnd(node, m.index + m[0].length);
              job.hl.add(r);
            }
            if (hit && job.rowClass && !want) want = job.rowClass;
          }
        }
      }
      for (const c of Array.from(row.classList)) {
        if (c.startsWith(HLROW_PREFIX) && c !== want) row.classList.remove(c);
      }
      if (want) row.classList.add(want);
      hlLastRows.push([row, want]);
    }
    for (const job of jobs) {
      if (!job.pen) continue;
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

  // 행·댓글에 클래스만 붙인다. Svelte 가 class 를 다시 쓰면 옵저버가 다시 붙인다
  function setFollowClass(el, want) {
    for (const c of Array.from(el.classList)) {
      if (c.startsWith(FOLLOW_PREFIX) && c !== want) el.classList.remove(c);
    }
    if (want) el.classList.add(want);
  }

  function applyFollow() {
    if (followActive() && !following) loadFollowing();
    const map = buildNickMap();
    for (const row of document.querySelectorAll("a.post-row")) {
      let want = "";
      if (map.size) {
        const btn = row.querySelector(AUTHOR_SEL);
        const m = btn && map.get(btn.textContent.trim());
        want = m ? m.cls : "";
      }
      setFollowClass(row, want);
    }
    for (const item of document.querySelectorAll(COMMENT_SEL)) {
      let want = "";
      if (map.size) {
        const btn = item.querySelector(COMMENT_AUTHOR_SEL);
        const m = btn && map.get(btn.textContent.trim());
        want = m && m.cm ? m.cls : "";
      }
      setFollowClass(item, want);
    }
  }

  // 한쪽이 실패해도 다른 쪽은 칠한다
  // 닉네임이 잘리는 칸에만 dui-widenick 을 붙인다. 판정 결과는 닉네임이 바뀔 때만 다시 계산해
  // (클래스가 붙어 안 넘치게 된 것을 다시 좁히는 진동을 막는다)
  function applyWideNick() {
    if (!view.cwide) {
      // 꺼짐: 남은 표시만 청소하고 끝. 판정 캐시도 지워 다시 켜면 재판정된다
      for (const sp of document.querySelectorAll("a.post-row .post-meta-text[data-dui-nick]")) {
        sp.classList.remove("dui-widenick");
        delete sp.dataset.duiNick;
      }
      return;
    }
    for (const sp of document.querySelectorAll("a.post-row .post-meta-text:has(button[data-dropdown-menu-trigger])")) {
      const btn = sp.querySelector("button[data-dropdown-menu-trigger]");
      const nick = btn ? btn.textContent.trim() : "";
      if (sp.dataset.duiNick === nick) continue;
      sp.classList.remove("dui-widenick");
      if (sp.scrollWidth > sp.clientWidth + 1) sp.classList.add("dui-widenick");
      sp.dataset.duiNick = nick;
    }
  }

  function apply() {
    if (!alive()) return;
    const steps = [[applyHighlight, "제목 강조 실패"], [applyFollow, "사용자 강조 실패"], [applyWideNick, "닉네임 표시 실패"],
      [qpbApply, "프로필 등록 버튼 실패"], [() => { applyHeartPill(); applyNickIcon(); }, "모바일 표시 옵션 실패"],
      [applyDlog, "이용제한 기록 프로필 보기 실패"], [updateStyle, "스타일 갱신 실패"]];
    for (const [fn, msg] of steps) {
      try {
        fn();
      } catch (e) {
        console.warn("[다모앙UI] " + msg, e);
      }
    }
  }

  // 확장이 갱신되면 열려 있던 탭의 이 스크립트는 고아가 된다(저장소·메시지 불가, DOM 감시는 계속).
  // 새 인스턴스와 같은 요소를 서로 갈아치우며 깜빡이므로, 고아를 감지하면 감시를 끊고 넣은 것을 걷어낸다
  const observers = [];
  let retired = false;
  function runtimeAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }
  function alive() {
    if (retired) return false;
    if (!owner()) { retire(false); return false; }
    if (!runtimeAlive()) { retire(true); return false; }
    return true;
  }
  function retire(removeUi) {
    retired = true;
    clearTimeout(timer);
    for (const o of observers) o.disconnect();
    observers.length = 0;
    if (!removeUi) return;
    for (const id of ["dui-qpwrap", "dui-qptip", "dui-pmenu", "dui-qpbtn-style", "dui-pmenu-style", "dui-highlight-style"]) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }
  }
  function schedule() {
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(apply, 150);
  }

  async function loadCfg() {
    hl = normalizeHl(await duiRead(HL_KEY));
    hlRev += 1;
    follow = normalizeFollow(await duiRead(FOLLOW_KEY));
    pmenu = normalizePmenu(await duiRead(PMENU_KEY));
    prio = normalizePrio(await duiRead(PRIO_KEY));
    view = normalizeView(await duiRead(VIEW_KEY));
    qp = normalizeQp(await duiRead(QP_KEY));
    if (!view.memberTab) mtabClear();
    apply();
  }
  loadCfg().then(() => duiSyncPull(0.5));
  // 팝업에서 바꾼 뒤 탭으로 돌아오면 다시 읽는다. onChanged 가 늦거나 오지 않는 경우의 안전망
  let refocusAt = 0;
  const refresh = () => {
    if (document.visibilityState === "hidden") return;
    const now = Date.now();
    if (now - refocusAt < 500) return;
    refocusAt = now;
    if (alive()) loadCfg();
  };
  listen(document, "visibilitychange", refresh);
  listen(window, "focus", refresh);
  listen(window, "pageshow", refresh);
  // 팝업·백그라운드가 설정을 쓰면 메시지와 문서 이벤트로 알려 준다 (Safari 는 storage.onChanged 가 오지 않는다)
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.dui === "changed" && alive()) loadCfg();
    });
  }
  listen(window, "dui-cfg-changed", () => { if (alive()) loadCfg(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (!alive()) return;
    if (area !== "sync" && area !== "local") return;
    if (duiChanged(changes, HL_KEY) || duiChanged(changes, FOLLOW_KEY) || duiChanged(changes, PMENU_KEY) || duiChanged(changes, PRIO_KEY) || duiChanged(changes, VIEW_KEY) || duiChanged(changes, QP_KEY)) loadCfg();
  });

  // ---- 프로필 메뉴 ----
  // 헤더·사이드바의 프로필 링크(정확히 /my)를 누르면 이동 대신 마이페이지 항목 메뉴를 연다

  // 마이페이지는 항상 표시. 나머지는 팝업의 표시할 항목에서 고른다 (key 는 팝업과 일치)
  const PMENU_SEGMENTS = [
    [{ key: "my", label: "마이페이지", path: "/my", always: true }],
    [
      { key: "points", label: "포인트", path: "/my/points" },
      { key: "exp", label: "경험치", path: "/my/exp" },
      { key: "scraps", label: "스크랩", path: "/my/scraps" },
      { key: "following", label: "팔로잉", path: "/my/following" },
      { key: "blocked", label: "차단목록", path: "/my/blocked" },
      { key: "memos", label: "회원메모", path: "/my/memos" },
      { key: "reports", label: "신고내역", path: "/my/reports" }
    ],
    [
      { key: "settings", label: "계정설정", path: "/member/settings" },
      { key: "settingsUi", label: "UI 설정", path: "/member/settings/ui" }
    ]
  ];
  let pmenuEl = null;
  let pmenuAnchor = null;

  function ensurePmenuStyle() {
    if (document.getElementById("dui-pmenu-style")) return;
    const style = document.createElement("style");
    style.id = "dui-pmenu-style";
    style.textContent =
      "#dui-pmenu{position:fixed;z-index:2147483000;min-width:130px;padding:6px;border-radius:10px;" +
      "background:#fff;color:#1c1c1e;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 24px rgba(0,0,0,.18);" +
      "font-size:13px;line-height:1.4;}" +
      "#dui-pmenu button{display:block;width:100%;margin:0;padding:6px 10px;border:0;border-radius:6px;" +
      "background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;}" +
      "#dui-pmenu button:hover{background:rgba(0,0,0,.06);}" +
      "#dui-pmenu .sep{margin:5px 2px;border-top:1px solid rgba(0,0,0,.08);}" +
      "html.dark #dui-pmenu,html.amoled #dui-pmenu{background:#26262a;color:#f2f2f4;border-color:rgba(255,255,255,.12);}" +
      "html.dark #dui-pmenu button:hover,html.amoled #dui-pmenu button:hover{background:rgba(255,255,255,.08);}" +
      "html.dark #dui-pmenu .sep,html.amoled #dui-pmenu .sep{border-color:rgba(255,255,255,.1);}" +
      "#dui-pmenu .dui-pmrow{display:flex;align-items:center;}" +
      "#dui-pmenu .dui-pmrow button:first-child{flex:1;width:auto;}" +
      "#dui-pmenu #dui-pminfo{display:inline-flex;align-items:center;justify-content:center;width:24px;" +
      "flex:none;padding:4px;color:#9ca3af;}" +
      "#dui-pmenu #dui-pminfo:hover{color:#6b7280;background:none;}" +
      "html.dark #dui-pmenu #dui-pminfo,html.amoled #dui-pmenu #dui-pminfo{color:#6b7280;}" +
      "html.dark #dui-pmenu #dui-pminfo:hover,html.amoled #dui-pmenu #dui-pminfo:hover{color:#9ca3af;}";
    document.documentElement.append(style);
  }

  function closePmenu() {
    if (pmenuEl) qpbCloseTip();
    if (pmenuEl) pmenuEl.remove();
    pmenuEl = null;
    pmenuAnchor = null;
  }

  // SvelteKit 라우터가 가로채도록 합성 앵커 클릭으로 이동한다 (전체 로드 방지).
  // 표식을 달아 아래 가로채기가 이 클릭을 다시 잡지 않게 한다
  function goTo(path) {
    const a = document.createElement("a");
    a.href = path;
    a.dataset.duiNav = "1";
    a.style.display = "none";
    document.body.append(a);
    a.click();
    a.remove();
  }

  function openPmenu(anchor) {
    ensurePmenuStyle();
    closePmenu();
    pmenuEl = document.createElement("div");
    pmenuEl.id = "dui-pmenu";
    let first = true;
    for (const seg of PMENU_SEGMENTS) {
      const items = seg.filter(item => item.always || !pmenu.hidden.includes(item.key));
      if (!items.length) continue;
      if (!first) {
        const sep = document.createElement("div");
        sep.className = "sep";
        pmenuEl.append(sep);
      }
      first = false;
      for (const item of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = item.label;
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          closePmenu();
          goTo(item.path);
        });
        if (item.key === "my" && pmenu.info) {
          const row = document.createElement("div");
          row.className = "dui-pmrow";
          const info = document.createElement("button");
          info.type = "button";
          info.id = "dui-pminfo";
          info.title = "이 메뉴는 무엇인가요?";
          info.append(duiIcon("pageInfo"));
          info.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (qpbTipEl) qpbCloseTip();
            else qpbOpenTip(info, "다모앙 UI 확장이 추가한 메뉴입니다. 프로필을 누르면 마이페이지로 이동하는 대신 자주 쓰는 항목으로 바로 갑니다. 확장 팝업의 추가 기능에서 끄거나 항목을 고를 수 있습니다.");
          });
          row.append(b, info);
          pmenuEl.append(row);
        } else {
          pmenuEl.append(b);
        }
      }
    }
    document.body.append(pmenuEl);
    const r = anchor.getBoundingClientRect();
    const mw = pmenuEl.offsetWidth;
    const mh = pmenuEl.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - mw - 8);
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    pmenuEl.style.left = Math.max(8, left) + "px";
    pmenuEl.style.top = top + "px";
    pmenuAnchor = anchor;
  }

  // 마이페이지 화면의 "프로필" 탭과 "마이페이지" 버튼도 /my 링크라 예외로 뺀다.
  // 링크 안의 버튼이 svg 아이콘과 해당 텍스트를 가지면 그쪽이다
  function isPmenuExcluded(a) {
    const b = a.querySelector("button");
    if (!b || !b.querySelector("svg")) return false;
    const label = b.textContent.trim();
    return label === "프로필" || label === "마이페이지";
  }

  // 캡처 단계에서 가로채 SvelteKit 라우터보다 먼저 처리한다
  listen(document, "click", (e) => {
    if (pmenuEl && !pmenuEl.contains(e.target) && !(qpbTipEl && qpbTipEl.contains(e.target))) {
      const again = pmenuAnchor;
      closePmenu();
      if (again && again.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (!pmenu.on) return;
    const a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.dataset.duiNav) return;
    let u;
    try {
      u = new URL(a.getAttribute("href"), location.origin);
    } catch (_) {
      return;
    }
    if (u.origin !== location.origin || u.pathname !== "/my" || u.search) return;
    if (isPmenuExcluded(a)) return;
    e.preventDefault();
    e.stopPropagation();
    openPmenu(a);
  }, true);
  listen(document, "keydown", (e) => {
    if (e.key === "Escape") {
      closePmenu();
      qpbCloseTip();
    }
  }, true);
  listen(window, "scroll", () => {
    closePmenu();
    qpbCloseTip();
  }, true);
  listen(document, "click", (e) => {
    if (qpbTipEl && !qpbTipEl.contains(e.target) && !(e.target.closest && e.target.closest("#dui-qpinfo, #dui-pminfo"))) qpbCloseTip();
  }, true);

  // ---- 프로필 탭 기억 ----
  // 회원 프로필(/member/아이디)의 탭 선택과 스크롤은 URL 에 없어 뒤로가기로 돌아오면 초기화된다.
  // 보던 탭과 위치를 sessionStorage 에 기억해 두고 popstate 때만 되살린다. 새로 들어온 방문은 그대로 둔다.
  // 탭 내용은 활성화할 때 받아오므로 탭을 누른 뒤 문서 높이가 목표에 닿기를 기다렸다 스크롤한다
  const MTAB_SS = "dui-member-tab";
  const MTAB_MAX = 20;
  let mtabRestoring = false;
  let mtabStop = null;
  let mtabScrollTimer = null;

  // 기능을 끄면 남아 있던 기록도 지운다
  function mtabClear() {
    try { sessionStorage.removeItem(MTAB_SS); } catch (_) {}
  }

  function mtabId() {
    const m = location.pathname.match(/^\/member\/([^/]+)$/);
    return m ? m[1] : "";
  }

  // 프로필 탭 묶음. 다른 페이지의 탭 컴포넌트와 구별한다
  function mtabRoot() {
    return document.querySelector('[data-tabs-root]:has(button[data-tabs-trigger][data-value="comments"]):has(button[data-tabs-trigger][data-value="liked"])');
  }

  function mtabLoad() {
    try {
      const v = JSON.parse(sessionStorage.getItem(MTAB_SS));
      if (v && typeof v === "object") return v;
    } catch (_) {}
    return {};
  }

  function mtabSave(id, patch) {
    try {
      const all = mtabLoad();
      all[id] = Object.assign({ tab: "", y: 0 }, all[id], patch, { t: Date.now() });
      const keys = Object.keys(all);
      if (keys.length > MTAB_MAX) {
        keys.sort((a, b) => (all[a].t || 0) - (all[b].t || 0));
        for (const k of keys.slice(0, keys.length - MTAB_MAX)) delete all[k];
      }
      sessionStorage.setItem(MTAB_SS, JSON.stringify(all));
    } catch (_) {}
  }

  listen(document, "click", (e) => {
    if (!view.memberTab || mtabRestoring) return;
    const id = mtabId();
    if (!id) return;
    const btn = e.target.closest ? e.target.closest("[data-tabs-root] button[data-tabs-trigger]") : null;
    if (btn && btn.dataset.value) mtabSave(id, { tab: btn.dataset.value, y: window.scrollY });
  }, true);

  listen(window, "scroll", () => {
    if (!view.memberTab || mtabRestoring) return;
    const id = mtabId();
    if (!id) return;
    clearTimeout(mtabScrollTimer);
    mtabScrollTimer = setTimeout(() => {
      if (!mtabRestoring && mtabId() === id) mtabSave(id, { y: window.scrollY });
    }, 200);
  }, { passive: true });

  // 복원. 렌더와 탭 내용 로드가 비동기라 시한까지 재시도하고, 사용자 입력이 들어오면 바로 멈춘다.
  // oldRoot 는 popstate 시점의 탭 묶음. 새 페이지가 그려져 다른 요소가 잡힐 때까지 기다린다
  function mtabRestore(oldRoot) {
    const id = mtabId();
    if (!id) return;
    const st = mtabLoad()[id];
    if (!st || (!st.tab && !(st.y > 0))) return;
    if (mtabStop) mtabStop();
    let stopped = false;
    let clicked = !st.tab;
    const deadline = Date.now() + 4000;
    mtabRestoring = true;
    const events = ["wheel", "touchstart", "keydown", "mousedown"];
    const finish = () => {
      if (stopped) return;
      stopped = true;
      mtabRestoring = false;
      mtabStop = null;
      for (const ev of events) window.removeEventListener(ev, finish, true);
    };
    for (const ev of events) window.addEventListener(ev, finish, true);
    mtabStop = finish;
    const step = () => {
      if (stopped) return;
      if (Date.now() > deadline || mtabId() !== id) return finish();
      const root = mtabRoot();
      if (root && root !== oldRoot) {
        if (!clicked) {
          const btn = root.querySelector('button[data-tabs-trigger][data-value="' + st.tab + '"]');
          if (btn) {
            if (btn.dataset.state !== "active") btn.click();
            clicked = true;
          }
        }
        if (clicked) {
          if (!(st.y > 0)) return finish();
          if (document.documentElement.scrollHeight - window.innerHeight + 2 >= st.y) {
            window.scrollTo(0, st.y);
            return finish();
          }
        }
      }
      setTimeout(step, 100);
    };
    step();
  }

  listen(window, "popstate", () => {
    if (!view.memberTab) return;
    const oldRoot = mtabRoot();
    setTimeout(() => mtabRestore(oldRoot), 50);
  });

  // ---- 프로필 등록 버튼 ----
  // 회원 프로필 헤더의 버튼 줄(팔로우, 쪽지, 차단)에 눈 모양 버튼을 붙인다.
  // 누르면 그 회원을 빠른 프로필 보기(qprofile)에 등록하거나 제거한다. 닉네임은 헤더 h1 에서 읽는다
  function ensureQpbStyle() {
    if (document.getElementById("dui-qpbtn-style")) return;
    const style = document.createElement("style");
    style.id = "dui-qpbtn-style";
    style.textContent =
      "#dui-qpbtn{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 9px;" +
      "border:1px solid rgba(0,0,0,.15);border-radius:6px;background:none;color:#6b7280;cursor:pointer;}" +
      "#dui-qpbtn:hover{background:rgba(0,0,0,.06);}" +
      "#dui-qpbtn.on{color:#1a73e8;border-color:currentColor;}" +
      "html.dark #dui-qpbtn,html.amoled #dui-qpbtn{border-color:rgba(255,255,255,.2);color:#9ca3af;}" +
      "html.dark #dui-qpbtn:hover,html.amoled #dui-qpbtn:hover{background:rgba(255,255,255,.08);}" +
      "html.dark #dui-qpbtn.on,html.amoled #dui-qpbtn.on{color:#8ab4f8;}" +
      "#dui-qpwrap{display:inline-flex;gap:4px;align-items:center;}" +
      "#dui-qpinfo{display:inline-flex;align-items:center;justify-content:center;width:18px;height:28px;" +
      "border:0;background:none;color:#9ca3af;cursor:pointer;padding:0;}" +
      "#dui-qpinfo:hover{color:#6b7280;}" +
      "html.dark #dui-qpinfo,html.amoled #dui-qpinfo{color:#6b7280;}" +
      "html.dark #dui-qpinfo:hover,html.amoled #dui-qpinfo:hover{color:#9ca3af;}" +
      "#dui-qptip{position:fixed;z-index:2147483000;max-width:250px;padding:8px 10px;border-radius:8px;" +
      "background:#fff;color:#1c1c1e;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 24px rgba(0,0,0,.18);" +
      "font-size:12px;line-height:1.5;}" +
      "html.dark #dui-qptip,html.amoled #dui-qptip{background:#26262a;color:#f2f2f4;border-color:rgba(255,255,255,.12);}";
    document.documentElement.append(style);
  }

  // 확장 기능임을 밝히는 말풍선. 서버 기능으로 오해하지 않게 한다
  let qpbTipEl = null;
  let qpbTipAnchor = null;

  function qpbCloseTip() {
    if (qpbTipEl) qpbTipEl.remove();
    qpbTipEl = null;
    qpbTipAnchor = null;
  }

  // 눈 버튼의 말풍선만 정리한다. 프로필 메뉴가 연 말풍선은 건드리지 않는다
  function qpbCloseOwnTip() {
    if (qpbTipAnchor && qpbTipAnchor.id === "dui-qpinfo") qpbCloseTip();
  }

  function qpbOpenTip(anchor, text) {
    qpbCloseTip();
    qpbTipAnchor = anchor;
    ensureQpbStyle();
    qpbTipEl = document.createElement("div");
    qpbTipEl.id = "dui-qptip";
    qpbTipEl.textContent = text || "다모앙 UI 확장이 추가한 버튼입니다. 이 회원을 확장 팝업의 \"빠른 프로필 보기\" 목록에 등록하거나 제거합니다. 다모앙 서버에는 아무것도 저장되지 않습니다.";
    document.body.append(qpbTipEl);
    const r = anchor.getBoundingClientRect();
    const w = qpbTipEl.offsetWidth;
    const h = qpbTipEl.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    qpbTipEl.style.left = Math.max(8, left) + "px";
    qpbTipEl.style.top = top + "px";
  }

  function qpbApply() {
    const id = mtabId();
    const old = document.getElementById("dui-qpwrap");
    if (!qp.btn || !id) {
      if (old) old.remove();
      qpbCloseOwnTip();
      return;
    }
    const on = qp.list.some(it => it.id === id);
    if (old && old.dataset.duiId === id && old.dataset.duiOn === String(on) && old.dataset.duiInfo === String(qp.info)) return;
    if (old) {
      old.remove();
      qpbCloseOwnTip();
    }
    const h1 = document.querySelector('[data-slot="card-content"] h1');
    const card = h1 && h1.closest('[data-slot="card-content"]');
    const group = card && card.querySelector(".ml-auto.flex");
    if (!group) return;
    ensureQpbStyle();
    const wrap = document.createElement("span");
    wrap.id = "dui-qpwrap";
    wrap.dataset.duiId = id;
    wrap.dataset.duiOn = String(on);
    wrap.dataset.duiInfo = String(qp.info);
    const b = document.createElement("button");
    b.type = "button";
    b.id = "dui-qpbtn";
    b.title = on ? "빠른 프로필 보기에서 제거" : "빠른 프로필 보기에 등록";
    b.append(duiIcon(on ? "eye" : "eyeOff"));
    if (on) b.classList.add("on");
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      qpbToggle(id, h1.textContent.trim());
    });
    wrap.append(b);
    if (qp.info) {
      const info = document.createElement("button");
      info.type = "button";
      info.id = "dui-qpinfo";
      info.title = "이 버튼은 무엇인가요?";
      info.append(duiIcon("pageInfo"));
      info.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qpbTipEl) qpbCloseTip();
        else qpbOpenTip(info);
      });
      wrap.append(info);
    }
    group.append(wrap);
  }

  async function qpbToggle(id, nick) {
    if (qp.list.some(it => it.id === id)) {
      qp.list = qp.list.filter(it => it.id !== id);
    } else {
      if (qp.list.length >= 30) {
        const b = document.getElementById("dui-qpbtn");
        if (b) b.title = "최대 30명까지 등록할 수 있습니다";
        return;
      }
      qp.list.push({ id, label: nick || id });
    }
    try {
      await duiWrite(QP_KEY, qp);
    } catch (e) {
      console.warn("[다모앙UI] 프로필 등록 저장 실패", e);
    }
    qpbApply();
  }

  // ---- 대화상자 스크롤 유지 ----
  // 공감한 사람들 대화상자 전용. 다른 다이얼로그는 건드리지 않는다(제목으로 한정)
  // 메모를 작성하거나 삭제하면 목록은 그대로인데 내부 스크롤만 0 으로 튄다
  // (컨테이너는 같은 요소로 남고 scrollTop 만 리셋되는 것 확인, 2026-08-28).
  // 스크롤 이벤트 때 컨테이너와 위치를 캐시해 두고, 클릭 직후 0 으로 리셋되면 되돌린다.
  // 클릭 시점에 scrollHeight 를 뒤지면 페이지 전체 강제 레이아웃이 일어나 클릭마다 수백 ms 를
  // 먹는 것이 확인되어(2026-08-28 프로파일) 클릭 경로에서는 레이아웃을 읽지 않는다.
  // 사용자가 직접 움직이면(휠, 터치, 키, 마우스) 바로 손을 뗀다
  let dlgStop = null;
  let dlgScroller = null;
  let dlgLastTop = 0;

  // Safari(WebKit)는 메모를 저장해도 목록 위치가 유지된다. Chrome·Edge·Firefox 만 0 으로 튄다 (2026-09-04 확인)
  listen(window, "scroll", (e) => {
    if (!view.dlgScroll || DUI_SYNC.enabled) return;
    const el = e.target;
    if (!el || el.nodeType !== 1 || !el.closest) return;
    if (el.tagName !== "DIV") return;
    const dlg = el.closest("[data-dialog-content]");
    if (!dlg) return;
    // 제목 확인은 다이얼로그당 1회
    if (!dlg.dataset.duiLiked) {
      const title = dlg.querySelector('[data-slot="dialog-title"], h1, h2, h3');
      dlg.dataset.duiLiked = title && title.textContent.indexOf("공감한 사람들") >= 0 ? "1" : "0";
    }
    if (dlg.dataset.duiLiked !== "1") return;
    dlgScroller = el;
    dlgLastTop = el.scrollTop;
  }, { passive: true, capture: true });

  listen(document, "click", (e) => {
    if (!view.dlgScroll || DUI_SYNC.enabled) return;
    const dlg = e.target.closest ? e.target.closest("[data-dialog-content]") : null;
    if (!dlg) return;
    const sc = dlgScroller;
    const top = dlgLastTop;
    if (!sc || !(top > 0) || !dlg.contains(sc)) return;
    if (dlgStop) dlgStop();
    let stopped = false;
    const deadline = Date.now() + 1500;
    const events = ["wheel", "touchstart", "keydown", "mousedown"];
    const finish = () => {
      if (stopped) return;
      stopped = true;
      dlgStop = null;
      for (const ev of events) window.removeEventListener(ev, finish, true);
    };
    for (const ev of events) window.addEventListener(ev, finish, true);
    dlgStop = finish;
    const step = () => {
      if (stopped) return;
      if (Date.now() > deadline || !sc.isConnected) return finish();
      if (sc.scrollTop === 0) {
        const max = sc.scrollHeight - sc.clientHeight;
        // 메모 입력칸이 접히며 내용이 짧아지면 기억한 값까지 못 간다. 갈 수 있는 끝까지 간다.
        // max 가 0 이면 아직 다시 그리는 중일 수 있어 더 기다린다
        if (max > 0) {
          sc.scrollTop = Math.min(top, max);
          return finish();
        }
      }
      setTimeout(step, 100);
    };
    setTimeout(step, 0);
  }, true);

  // 목록은 클라이언트 이동·스크롤로 바뀌므로 DOM 변화마다 다시 칠한다.
  // 행의 class 도 본다 (Svelte 가 덮어쓰면 팔로우 클래스가 사라진다). 같은 값으로 toggle 하면 변경이 안 생겨 되먹임은 없다
  // 다이얼로그 안에서만 일어난 변화(메모 입력 등)는 칠할 대상이 없어 건너뛴다
  function inDialog(n) {
    if (n && n.nodeType !== 1) n = n.parentElement;
    return !!(n && n.closest && n.closest("[data-dialog-content]"));
  }
  // 변경 기록이 많으면(사이트 재렌더링) 다이얼로그 안 변경만일 리 없으니 훑지 않고 바로 예약한다
  const domObserver = new MutationObserver((muts) => {
    if (muts.length > 50) {
      schedule();
      return;
    }
    for (const m of muts) {
      if (!inDialog(m.target)) {
        schedule();
        return;
      }
    }
  });
  domObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });
  const themeObserver = new MutationObserver(() => { if (alive()) updateStyle(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  observers.push(domObserver, themeObserver);
})();
