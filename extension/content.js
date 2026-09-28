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
  const MINFO_KEY = "minfo";
  // 배지 색 (회색·노랑·빨강·파랑·초록·보라)
  const MIB_TONES = ["g", "a", "r", "b", "e", "p"];
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
  let minfo = { on: true, comments: true, profile: true, mini: true, pop: true, popInfo: true, popMode: "direct", popShow: { account: true, activity: true, rcmd: true, nick: true, disc: true }, info: true, card: { on: true, info: true, show: { account: true, activity: true, rcmd: true, nick: true, disc: true } }, noPost: true, noComment: true, discNow: true, left: true, colors: { left: "r", new: "r", nick: "r", del: "r", cdel: "r", disc: "r", noPost: "r", noComment: "r" }, newDays: 100, nickDays: 30, delPct: 30, cdelPct: 30 };
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

  function normalizeMinfo(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    const num = (v, d, max) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n))) : d;
    };
    return {
      on: bool(r.on, true),
      comments: bool(r.comments, true),
      profile: bool(r.profile, true),
      mini: bool(r.mini, true),
      pop: bool(r.pop, true),
      popInfo: bool(r.popInfo, true),
      popMode: r.popMode === "menu" ? "menu" : "direct",
      popShow: (() => {
        const o = r.popShow && typeof r.popShow === "object" ? r.popShow : {};
        const out = {};
        for (const k of ["account", "activity", "rcmd", "nick", "disc"]) out[k] = bool(o[k], true);
        return out;
      })(),
      info: bool(r.info, true),
      card: (() => {
        const o = r.card && typeof r.card === "object" ? r.card : {};
        const sh = o.show && typeof o.show === "object" ? o.show : {};
        const show = {};
        for (const k of ["account", "activity", "rcmd", "nick", "disc"]) show[k] = bool(sh[k], true);
        return { on: bool(o.on, true), info: bool(o.info, true), show };
      })(),
      noPost: bool(r.noPost, true),
      noComment: bool(r.noComment, true),
      discNow: bool(r.discNow, true),
      left: bool(r.left, true),
      colors: (() => {
        const o = r.colors && typeof r.colors === "object" ? r.colors : {};
        const out = {};
        for (const [k, d] of [["left", "r"], ["new", "r"], ["nick", "r"], ["del", "r"], ["cdel", "r"], ["disc", "r"], ["noPost", "r"], ["noComment", "r"]]) out[k] = MIB_TONES.indexOf(o[k]) >= 0 ? o[k] : d;
        return out;
      })(),
      newDays: num(r.newDays, 100, 3650),
      nickDays: num(r.nickDays, 30, 3650),
      delPct: num(r.delPct, 30, 100),
      cdelPct: num(r.cdelPct, 30, 100)
    };
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

  // 다모앙 테마는 <html class> 가 dark 또는 amoled. 클래스 없이 어둡게 그려질 때(시스템 설정 따르기 등)도 있어
  // 실제 배경색의 밝기도 본다 (2026-09-27 사용자 제보: 다크 화면인데 미니 프로필이 흰색).
  // 우리 CSS 의 다크 규칙은 전부 html.dui-dark 로 걸고 syncDark 가 그 클래스를 유지한다
  function colorLum(v) {
    if (!v) return -1;
    let m = /^(ok)?(?:lch|lab)\(\s*([\d.]+)(%?)/.exec(v);
    if (m) return m[3] || !m[1] ? +m[2] / 100 : +m[2];
    m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+)(%?))?/.exec(v);
    if (m) {
      if (m[4] !== undefined && (m[5] ? +m[4] / 100 : +m[4]) < 0.5) return -1;
      return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
    }
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(v);
    if (m) return 0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3];
    m = /^(?:hsla?\(\s*)?[\d.]+(?:deg)?[,\s]+[\d.]+%[,\s]+([\d.]+)%/.exec(v);
    if (m) return +m[1] / 100;
    return -1;
  }
  function isDark() {
    const c = document.documentElement.classList;
    if (c.contains("dark") || c.contains("amoled")) return true;
    try {
      for (const v of [
        document.body && getComputedStyle(document.body).backgroundColor,
        getComputedStyle(document.documentElement).backgroundColor,
        getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
      ]) {
        const l = colorLum(v);
        if (l >= 0) return l < 0.5;
      }
    } catch (_) {}
    return false;
  }
  function syncDark() {
    const c = document.documentElement.classList;
    const d = isDark();
    if (c.contains("dui-dark") !== d) c.toggle("dui-dark", d);
    return d;
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
      [qpbApply, "프로필 등록 버튼 실패"], [miApply, "작성자 배지 실패"], [miApplyProfile, "프로필 배지 실패"], [() => { applyHeartPill(); applyNickIcon(); }, "모바일 표시 옵션 실패"],
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
    for (const id of ["dui-qpwrap", "dui-qptip", "dui-pmenu", "dui-qpbtn-style", "dui-pmenu-style", "dui-highlight-style", "dui-mipop", "dui-mimenu", "dui-micard", "dui-mipbadges", "dui-minfo-style"]) {
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
    const prevMode = minfo.popMode;
    minfo = normalizeMinfo(await duiRead(MINFO_KEY));
    miRev += 1;
    // 방식이 바뀌면 열려 있는 회원 메뉴를 닫는다. 팝업을 여는 동안 열려 있던 메뉴는 그대로 남고, 그 뒤 닉을 누르면
    // 첫 클릭이 그 메뉴를 닫기만 해서 새 방식이 안 뜨는 것처럼 보였다 (2026-09-28 사용자, 엣지 점검 중)
    if (prevMode !== minfo.popMode) {
      miCloseMiniMenu();
      miClosePop(true);
      const open = document.querySelector(MI_MENU_SEL);
      if (open) miMenuEscape(open);
    }
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
    if (duiChanged(changes, HL_KEY) || duiChanged(changes, FOLLOW_KEY) || duiChanged(changes, PMENU_KEY) || duiChanged(changes, PRIO_KEY) || duiChanged(changes, VIEW_KEY) || duiChanged(changes, QP_KEY) || duiChanged(changes, MINFO_KEY)) loadCfg();
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
      "html.dui-dark #dui-pmenu{background:#26262a;color:#f2f2f4;border-color:rgba(255,255,255,.12);}" +
      "html.dui-dark #dui-pmenu button:hover{background:rgba(255,255,255,.08);}" +
      "html.dui-dark #dui-pmenu .sep{border-color:rgba(255,255,255,.1);}" +
      "#dui-pmenu .dui-pmrow{display:flex;align-items:center;}" +
      "#dui-pmenu .dui-pmrow button:first-child{flex:1;width:auto;}" +
      "#dui-pmenu #dui-pminfo{display:inline-flex;align-items:center;justify-content:center;width:24px;" +
      "flex:none;padding:4px;color:#9ca3af;}" +
      "#dui-pmenu #dui-pminfo:hover{color:#6b7280;background:none;}" +
      "html.dui-dark #dui-pmenu #dui-pminfo{color:#6b7280;}" +
      "html.dui-dark #dui-pmenu #dui-pminfo:hover{color:#9ca3af;}";
    document.documentElement.append(style);
  }

  function closePmenu() {
    if (pmenuEl) qpbCloseTip();
    if (pmenuEl) pmenuEl.remove();
    pmenuEl = null;
    pmenuAnchor = null;
  }

  // SvelteKit 라우터가 가로채도록 합성 앵커 클릭으로 이동한다 (전체 로드 방지).
  // 표식을 달아 아래 가로채기가 이 클릭을 다시 잡지 않게 한다.
  // host: 사이트 다이얼로그 안에서 이동할 때는 앵커를 그 다이얼로그 안에 둔다. 밖에 두면 다이얼로그가
  // 바깥 클릭으로 보고 preventDefault 해 라우터가 무시한다 (공감 목록의 프로필 보기, 2026-09-27)
  function goTo(path, host) {
    const a = document.createElement("a");
    a.href = path;
    a.dataset.duiNav = "1";
    a.style.display = "none";
    (host && host.isConnected ? host : document.body).append(a);
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
            else qpbOpenTip(info, "다모앙 UI 확장이 추가한 메뉴입니다. 프로필을 누르면 마이페이지로 이동하는 대신 자주 쓰는 항목으로 바로 갑니다. 설정: 확장 팝업 › 추가 기능 › 메뉴 › 프로필 메뉴 [관리]");
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
    if (miMenuEl && miMenuEl.duiKey && e.key !== "Escape" && miMenuEl.duiKey(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === "Escape") {
      // 다모앙 메뉴 안에 들어간 팝업은 메뉴와 함께 닫히므로 사이트의 Escape 처리를 막지 않는다
      if (miMenuEl) e.stopImmediatePropagation();
      closePmenu();
      qpbCloseTip();
      miCloseMiniMenu();
      miClosePop(true);
    }
  }, true);
  listen(window, "scroll", (e) => {
    closePmenu();
    qpbFollowTip();
    // 팝업 안쪽 스크롤은 유지한다. 연 직후의 스크롤(다이얼로그 포커스 이동 등)도 무시한다
    // 우리 메뉴는 다모앙 메뉴처럼 닉을 따라간다
    if (miMenuEl && !(e.target && e.target.nodeType === 1 && miMenuEl.contains(e.target))) miMenuEl.duiPlace();
  }, true);
  listen(document, "click", (e) => {
    if (qpbTipEl && !qpbTipEl.contains(e.target) && !(e.target.closest && e.target.closest("#dui-qpinfo, #dui-pminfo, .dui-mic-info"))) qpbCloseTip();
  }, true);
  listen(document, "pointerdown", (e) => {
    if (e.target.closest && e.target.closest("#dui-qpinfo, #dui-pminfo, .dui-mic-info, #dui-mimenu, #dui-mipop .t a, #dui-mipop .r a")) e.preventDefault();
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
      "html.dui-dark #dui-qpbtn{border-color:rgba(255,255,255,.2);color:#9ca3af;}" +
      "html.dui-dark #dui-qpbtn:hover{background:rgba(255,255,255,.08);}" +
      "html.dui-dark #dui-qpbtn.on{color:#8ab4f8;}" +
      "#dui-qpwrap{display:inline-flex;gap:4px;align-items:center;}" +
      "#dui-qpinfo{display:inline-flex;align-items:center;justify-content:center;width:18px;height:28px;" +
      "border:0;background:none;color:#9ca3af;cursor:pointer;padding:0;}" +
      "#dui-qpinfo:hover{color:#6b7280;}" +
      "html.dui-dark #dui-qpinfo{color:#6b7280;}" +
      "html.dui-dark #dui-qpinfo:hover{color:#9ca3af;}" +
      "#dui-qptip{position:fixed;z-index:2147483000;pointer-events:auto;max-width:250px;padding:8px 10px;border-radius:8px;" +
      "background:#fff;color:#1c1c1e;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 24px rgba(0,0,0,.18);" +
      "font-size:12px;line-height:1.5;}" +
      "html.dui-dark #dui-qptip{background:#26262a;color:#f2f2f4;border-color:rgba(255,255,255,.12);}";
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
    miShield(qpbTipEl);
    qpbTipEl.textContent = text || "다모앙 UI 확장이 추가한 버튼입니다. 이 회원을 빠른 프로필 보기 목록에 등록하거나 제거합니다. 설정: 확장 팝업 › 추가 기능 › 표시 › 빠른 프로필 등록 버튼 [관리]. 등록한 목록은 빠른 실행 › 빠른 프로필 보기 [열기]";
    miHostOf(anchor).append(qpbTipEl);
    qpbPlaceTip();
  }

  function qpbPlaceTip() {
    if (!qpbTipEl || !qpbTipAnchor) return;
    const r = qpbTipAnchor.getBoundingClientRect();
    const b = miBoundsOf(qpbTipEl.parentElement);
    const w = qpbTipEl.offsetWidth;
    const h = qpbTipEl.offsetHeight;
    const left = Math.min(r.left, b.right - w);
    let top = r.bottom + 6;
    if (top + h > b.bottom) top = Math.max(b.top, r.top - h - 6);
    miPlaceFixed(qpbTipEl, Math.max(b.left, left), top);
  }

  // 띄울 수 있는 범위. 사이트 다이얼로그 안이면 그 상자 안 — 상자 밖으로 나간 부분은 보이긴 해도 클릭이 전혀 안 먹는다
  // (2026-09-27 사용자 확인: 공감 목록 상자 밖으로 나간 미니 프로필의 링크·항목이 전부 무반응, 안에 들어오면 정상)
  function miBoundsOf(host) {
    const b = { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    if (host && host !== document.body) {
      const r = host.getBoundingClientRect();
      b.left = Math.max(b.left, r.left + 4);
      b.top = Math.max(b.top, r.top + 4);
      b.right = Math.min(b.right, r.right - 4);
      b.bottom = Math.min(b.bottom, r.bottom - 4);
    }
    return b;
  }

  // 띄우는 요소는 항상 body 에 붙인다. 사이트 다이얼로그(bits-ui) 안에 붙이면 content 의 contain:layout 때문에
  // 상자 밖으로 나간 부분은 보여도 클릭이 안 먹고(2026-09-27 사용자 확인), 상자 안에 가두면 안쪽 스크롤이 생긴다.
  // 다이얼로그는 body 의 pointer-events 를 none 으로 두고 document 의 pointerdown(버블)으로 바깥 누름을 판정하므로
  // 우리 요소는 pointer-events:auto 를 주고 pointerdown 의 전파를 뿌리에서 끊는다(miShield). 포커스는 옮기지 않는다
  function miHostOf() {
    return document.body;
  }
  function miShield(el) {
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  function miPlaceFixed(el, left, top) {
    const host = el.parentElement;
    if (host && host !== document.body) {
      const hr = host.getBoundingClientRect();
      left -= hr.left + host.clientLeft;
      top -= hr.top + host.clientTop;
    }
    el.style.left = left + "px";
    el.style.top = top + "px";
  }

  // 스크롤 때는 닫지 않고 따라간다. 버튼이 사라졌거나 화면 밖이면 닫는다.
  // (누르는 순간 버튼이 포커스로 살짝 스크롤되거나 사이트가 스크롤 이벤트를 내면 열자마자 닫히던 문제, 2026-09-24 사용자 제보)
  function qpbFollowTip() {
    if (!qpbTipEl) return;
    if (!qpbTipAnchor || !qpbTipAnchor.isConnected) return qpbCloseTip();
    const r = qpbTipAnchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return qpbCloseTip();
    qpbPlaceTip();
  }

  // 말풍선이 붙은 ⓘ 가 root 안에 있으면 그 title 을 돌려준다. 다시 그린 뒤 같은 title 의 ⓘ 로 옮겨 붙인다
  function qpbTipIn(root) {
    return qpbTipEl && root && qpbTipAnchor && root.contains(qpbTipAnchor) ? qpbTipAnchor.title : "";
  }
  function qpbTipRebind(root, title) {
    if (!title || !qpbTipEl) return;
    const nb = root ? [...root.querySelectorAll("button")].find((b) => b.title === title) : null;
    if (!nb) return qpbCloseTip();
    qpbTipAnchor = nb;
    qpbPlaceTip();
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

  // ---- 작성자 배지 ----
  // 글 작성자의 회원 정보(가입일, 닉 변경, 삭제 비율, 이용제한)를 글 카드와 "작성자 최근 활동" 사이의 카드로,
  // 댓글 작성자는 댓글 본문 아래 한 줄의 작은 배지로 표시한다 (닉 옆에 붙이면 머리줄 레이아웃이 바뀌어 아래로 옮김, 2026-09-22).
  // 데이터는 프로필 페이지가 쓰는 SvelteKit __data.json (페이지 노드만). 글·댓글은 작성 당시 닉네임을 보여 주므로
  // 닉으로 조회하면 닉을 바꾼 회원은 못 찾고(옛 닉을 다른 회원이 쓰면 엉뚱한 사람) 아이디로 조회해야 한다.
  // 아이디는 글 페이지의 __data.json(post.author_id, 댓글마다 author_id)에서 한 번 받아 둔다. 못 받으면 닉으로 폴백
  // 글 작성자는 글 페이지에서 자동으로, 댓글 작성자는 그 댓글의 공감·답글·닉네임을 누를 때 조회한다.
  // 누르는 동작은 관찰만 한다 (캡처 단계 passive 리스너, 요청은 fire-and-forget). 닉별로 6시간 캐시
  const MINFO_URL = (nick) => "/member/" + encodeURIComponent(nick) + "/__data.json?x-sveltekit-invalidated=01";
  const MINFO_TTL = 30 * 60 * 1000;
  // 응답 형식이 바뀌거나 네트워크가 막히면 잠시 쉰다. 안 그러면 DOM 변화마다 다시 요청한다
  const MINFO_FAIL_TTL = 10 * 60 * 1000;
  // 캐시 레코드 형식 번호. 축약 형식이 바뀌면 올려서 옛 캐시를 버린다
  const MINFO_CACHE_V = 1;
  const MINFO_SS = "dui-minfo:";
  const MINFO_TRIGGER_SEL = "button[data-dropdown-menu-trigger], .comment-good-group button, button:has(svg.lucide-reply)";
  // 루트 레이아웃(토큰 포함, 큼)만 빼고 나머지 노드를 요청한다. 1 을 넉넉히 두면 라우트 깊이에 상관없이 페이지 노드가 포함된다
  const MINFO_PAGE_QUERY = "/__data.json?x-sveltekit-invalidated=0111111111";
  // 페이지에 노출되는 ⓘ 문구. 설정 위치를 정확히 적고, 서버 저장 여부는 확장 팝업의 설정 ⓘ 에 둔다 (2026-09-24 사용자)
  const MINFO_POP_TIP_TEXT = "다모앙 UI 확장이 추가한 미니 프로필입니다. 다모앙 회원 메뉴 맨 위에 회원의 프로필에 공개된 정보를 보여줍니다. 메뉴 항목은 다모앙 것 그대로입니다. 설정: 확장 팝업 › 추가 기능 › 표시 › 미니 프로필 표시 [관리]";
  const MINFO_POP_TIP_TEXT2 = "다모앙 UI 확장이 추가한 미니 프로필입니다. 다모앙 회원 메뉴 맨 위에 추가된 '미니 프로필' 항목으로 열리며 회원의 프로필에 공개된 정보를 보여줍니다. 닉네임이나 아이디를 누르면 프로필로 이동합니다. 설정: 확장 팝업 › 추가 기능 › 표시 › 미니 프로필 표시 [관리]";
  const MINFO_CARD_TIP_TEXT = "다모앙 UI 확장이 추가한 작성자 정보 카드입니다. 작성자의 프로필에 공개된 정보를 읽어 보여줍니다. 설정: 확장 팝업 › 추가 기능 › 표시 › 글 작성자 정보 바로 표시 [관리]";
  const MINFO_TIP_TEXT = "다모앙 UI 확장이 추가한 배지입니다. 작성자의 프로필에 공개된 정보(가입일, 닉네임 변경, 삭제율, 이용제한)로 판정합니다. 설정: 확장 팝업 › 추가 기능 › 강조 › 작성자 배지 [관리]";
  const miMem = new Map();
  const miPending = new Map();
  const miFail = new Map();
  // 현재 글의 아이디 표. { pathId, authorId, authorNick, byComment: Map(댓글 번호 → 아이디), byNick: Map(작성 당시 닉 → 아이디) }
  let miPage = null;
  let miPagePending = false;
  let miPageFailId = "";
  let miPageFailAt = 0;
  // 글 데이터를 기다리는 동안 눌린 댓글. 데이터가 오면 처리한다
  const miDeferred = new Set();
  let miRev = 0;
  let miPopEl = null;
  let miPopAnchor = null;
  let miPopKey = "";
  // 통합 표시에서는 팝업이 다모앙 메뉴(또는 그 모양의 우리 메뉴) 안에 들어간다

  // devalue 형식. 배열의 각 항목이 값이고 객체·배열 안의 숫자는 그 배열의 인덱스다.
  // 음수는 특수값(undefined 등), ["Date", iso] 같은 태그 배열은 문자열만 돌려준다
  function unflatten(arr) {
    const memo = new Map();
    const rev = (i) => {
      if (typeof i !== "number" || i < 0 || i >= arr.length) return undefined;
      const v = arr[i];
      if (v === null || typeof v !== "object") return v;
      if (memo.has(i)) return memo.get(i);
      let out;
      if (Array.isArray(v)) {
        if (typeof v[0] === "string") {
          out = v[0] === "Date" ? v[1] : undefined;
          memo.set(i, out);
          return out;
        }
        out = [];
        memo.set(i, out);
        for (const j of v) out.push(rev(j));
      } else {
        out = {};
        memo.set(i, out);
        for (const k of Object.keys(v)) out[k] = rev(v[k]);
      }
      return out;
    };
    return rev(0);
  }

  function miCompact(p) {
    const st = p.stats && typeof p.stats === "object" ? p.stats : {};
    const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const disc = (d) => (d && typeof d === "object" ? { period: num(d.penalty_period), from: String(d.penalty_date_from || ""), wr: num(d.wr_id) } : null);
    return {
      id: String(p.mb_id || ""),
      nick: String(p.mb_name || ""),
      reg: String(p.mb_datetime || ""),
      regDays: num(p.reg_days),
      login: String(p.mb_today_login || ""),
      level: num(p.as_level),
      posts: num(st.total_post_count),
      delPosts: num(st.delete_post_count),
      adminPosts: num(st.delete_post_by_admin),
      comments: num(st.total_comment_count),
      delComments: num(st.delete_comment_count),
      adminComments: num(st.delete_comment_by_admin),
      rcmd: num(st.total_rcmd_count),
      singo: num(st.total_singo_count),
      point: num(p.mb_point),
      followers: num(p.follower_count),
      following: num(p.following_count),
      left: !!p.is_left,
      disc: disc(p.discipline),
      discHist: (Array.isArray(p.discipline_history) ? p.discipline_history : []).map(disc).filter(Boolean).slice(0, 100),
      nickHist: (Array.isArray(p.nick_history) ? p.nick_history : []).map(h => (h && typeof h === "object"
        ? { old: String(h.old_nick || ""), nw: String(h.new_nick || ""), at: String(h.changed_at || "") } : null)).filter(Boolean).slice(0, 100)
    };
  }

  // p 가 null 이면 회원 없음. 네트워크 실패는 캐시하지 않는다
  function miGet(nick) {
    const m = miMem.get(nick);
    if (m && Date.now() - m.t < MINFO_TTL) return m;
    try {
      const v = JSON.parse(sessionStorage.getItem(MINFO_SS + nick));
      if (v && typeof v === "object" && v.v === MINFO_CACHE_V && Date.now() - v.t < MINFO_TTL) {
        miMem.set(nick, v);
        return v;
      }
    } catch (_) {}
    return null;
  }

  function miPut(nick, p) {
    const v = { v: MINFO_CACHE_V, t: Date.now(), p };
    miMem.set(nick, v);
    try { sessionStorage.setItem(MINFO_SS + nick, JSON.stringify(v)); } catch (_) {}
  }

  // 응답에서 회원 정보를 꺼낸다. 형식이 예상과 다르면 예외 (호출 쪽이 실패로 처리)
  function miParseResponse(j) {
    const node = j && Array.isArray(j.nodes) ? j.nodes.find(n => n && n.type === "data" && Array.isArray(n.data)) : null;
    if (!node) throw new Error("no data node");
    const root = unflatten(node.data);
    if (!root || typeof root !== "object") throw new Error("bad root");
    // profile 이 없고 error 만 있으면 회원 없음
    const p = root.profile;
    if (!p || typeof p !== "object") return null;
    if (typeof p.mb_id !== "string" && typeof p.mb_name !== "string") throw new Error("bad profile");
    return miCompact(p);
  }

  // 글 경로 /<게시판>/<번호>. 같은 꼴이지만 글이 아닌 경로(이용제한 기록 상세 등)는 뺀다
  const MINFO_NOT_BOARD = /^(disciplinelog|member|my|search|settings|messages?|notifications?|api)$/;
  function miPostIdFromPath() {
    const m = /^\/([A-Za-z0-9_-]+)\/(\d+)\/?$/.exec(location.pathname);
    return m && !MINFO_NOT_BOARD.test(m[1]) ? m[2] : "";
  }

  // 응답은 첫 줄이 본문이고 스트리밍 청크가 다음 줄들로 이어질 수 있어 첫 줄만 파싱한다
  function miParsePage(text) {
    const j = JSON.parse(text.split("\n")[0]);
    const nodes = j && Array.isArray(j.nodes) ? j.nodes : [];
    for (const n of nodes) {
      if (!n || n.type !== "data" || !Array.isArray(n.data)) continue;
      const root = unflatten(n.data);
      const post = root && typeof root === "object" ? root.post : null;
      if (!post || typeof post !== "object" || typeof post.author_id !== "string" || !post.author_id) continue;
      const byComment = new Map();
      const byNick = new Map();
      if (typeof post.author === "string" && post.author) byNick.set(post.author, post.author_id);
      const cd = root.commentsData;
      const items = cd && cd.comments && Array.isArray(cd.comments.items) ? cd.comments.items : [];
      for (const c of items) {
        if (!c || typeof c !== "object" || typeof c.author_id !== "string" || !c.author_id) continue;
        if (c.id !== undefined && c.id !== null) byComment.set(String(c.id), c.author_id);
        if (typeof c.author === "string" && c.author && !byNick.has(c.author)) byNick.set(c.author, c.author_id);
      }
      return { authorId: post.author_id, authorNick: String(post.author || ""), byComment, byNick };
    }
    throw new Error("no post node");
  }

  // "ready" | "pending" | "failed" | "none"(글 페이지 아님)
  function miPageState() {
    const pid = miPostIdFromPath();
    if (!pid) return "none";
    if (miPage && miPage.pathId === pid) return "ready";
    if (miPagePending) return "pending";
    if (miPageFailId === pid && Date.now() - miPageFailAt < MINFO_FAIL_TTL) return "failed";
    return "idle";
  }

  function miLoadPage() {
    const pid = miPostIdFromPath();
    if (!pid || miPageState() !== "idle") return;
    miPagePending = true;
    fetch(location.pathname.replace(/\/$/, "") + MINFO_PAGE_QUERY, { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return miParsePage(await r.text());
      })
      .then((pg) => {
        pg.pathId = pid;
        miPage = pg;
        for (const item of miDeferred) {
          if (item.isConnected) miRequest(miKeyForComment(item, miNickOf(item.querySelector(COMMENT_AUTHOR_SEL))));
        }
        miDeferred.clear();
        schedule();
        miRefreshPop();
      })
      .catch((e) => {
        miPageFailId = pid;
        miPageFailAt = Date.now();
        miDeferred.clear();
        // 글이 아닌 경로에서 post 노드가 없는 것은 예상된 경우라 경고로 올리지 않는다
        if (e && e.message === "no post node") console.debug("[다모앙UI] 글 데이터 조회 실패, 닉네임으로 조회합니다", e);
        else miLogFail("글 데이터 조회 실패, 닉네임으로 조회합니다", pid, e);
        schedule();
        miRefreshPop();
      })
      .finally(() => { miPagePending = false; });
  }

  // 조회 키: 글 데이터에서 아이디를 찾으면 아이디, 없으면 닉
  function miKeyForAuthor(nick) {
    return miPageState() === "ready" && miPage.authorId ? miPage.authorId : nick;
  }

  function miKeyForComment(item, nick) {
    if (miPageState() === "ready") {
      const m = /^c_(\d+)$/.exec(item.id || "");
      if (m && miPage.byComment.has(m[1])) return miPage.byComment.get(m[1]);
      if (nick && miPage.byNick.has(nick)) return miPage.byNick.get(nick);
    }
    return nick;
  }

  // 네트워크·HTTP 실패(운영 계정처럼 프로필이 없거나 이동 중 끊긴 요청)는 확장 오류 목록에 쌓지 않는다.
  // 응답 형식이 달라진 경우만 warn (2026-09-28 사용자 제보: 'admin' 조회의 Failed to fetch 가 오류로 표시)
  function miLogFail(msg, key, e) {
    const net = e instanceof TypeError || /^HTTP \d+/.test(e && e.message);
    (net ? console.debug : console.warn)("[다모앙UI] " + msg, key, e);
  }
  function miRequest(nick) {
    try {
      if (!nick || miGet(nick) || miPending.has(nick) || miPending.size >= 3) return;
      const failedAt = miFail.get(nick);
      if (failedAt && Date.now() - failedAt < MINFO_FAIL_TTL) return;
      const pr = fetch(MINFO_URL(nick), { credentials: "same-origin" })
        .then(async (r) => {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error("HTTP " + r.status);
          return miParseResponse(await r.json());
        })
        .then((p) => {
          miFail.delete(nick);
          miPut(nick, p);
          schedule();
          miRefreshPop();
        })
        .catch((e) => {
          miFail.set(nick, Date.now());
          miLogFail("작성자 정보 조회 실패", nick, e);
          miRefreshPop();
        })
        .finally(() => { miPending.delete(nick); });
      miPending.set(nick, pr);
    } catch (e) {
      miFail.set(nick, Date.now());
      miLogFail("작성자 정보 요청 실패", nick, e);
    }
  }

  function miDays(s) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? Math.floor((Date.now() - t) / 864e5) : -1;
  }

  // "2026-09-20 21:37:00.000000" 같은 서버 문자열도 받는다
  function miParse(s) {
    return Date.parse(s.indexOf("T") >= 0 ? s : s.replace(" ", "T").replace(/\.\d+$/, ""));
  }

  function miFmtDate(s) {
    const t = miParse(s);
    if (!Number.isFinite(t)) return s;
    const d = new Date(t);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  // 영구 제한은 penalty_period 가 -1 로 온다 (2026-09-23 표본 naver_80ae0812). 10년 이상도 영구로 취급.
  // 영구 정지 뒤 탈퇴한 회원은 프로필이 탈퇴 형태로만 오므로 탈퇴 = 영구로 넘겨짚지 않는다
  const MINFO_PERMANENT_DAYS = 3650;

  function miDiscPermanent(d) {
    return !!d && (d.period < 0 || d.period >= MINFO_PERMANENT_DAYS);
  }

  // discipline 은 가장 최근 기록일 뿐이라(기간 0 = 주의) 기간이 남아 있을 때만 제한 중으로 본다.
  // 남은 일수를 돌려준다 (영구는 Infinity)
  function miDiscLeft(d) {
    if (!d) return 0;
    if (miDiscPermanent(d)) return Infinity;
    if (!(d.period > 0)) return 0;
    const t = miParse(d.from);
    if (!Number.isFinite(t)) return 0;
    const left = Math.ceil((t + d.period * 864e5 - Date.now()) / 864e5);
    return left > 0 ? left : 0;
  }

  // 사이트의 이용제한 기록 표기: 영구 / N일 / 주의
  function miDiscLabel(h) {
    return miDiscPermanent(h) ? "영구" : h.period > 0 ? h.period + "일" : "주의";
  }

  function miDiscClass(h) {
    return miDiscPermanent(h) ? "dui-mic-bad" : h.period > 0 ? "dui-mic-warn" : "dui-mic-note";
  }

  // [문구, 색] 목록. g 회색(정보), a 주황(주의), r 빨강(제재)
  function miBadges(p) {
    const out = [];
    if (!p) return out;
    p.nickHist = Array.isArray(p.nickHist) ? p.nickHist : [];
    p.discHist = Array.isArray(p.discHist) ? p.discHist : [];
    // 탈퇴 회원은 나머지 값이 비어 오므로(가입 0일, 글 0) 탈퇴만 표시한다
    const c = minfo.colors;
    if (p.left) return minfo.left ? [["탈퇴", c.left]] : [];
    if (minfo.newDays > 0 && p.regDays >= 0 && p.regDays <= minfo.newDays) out.push(["가입 " + (p.regDays === 0 ? "오늘" : p.regDays + "일"), c.new]);
    if (minfo.nickDays > 0 && p.nickHist.length) {
      const d = miDays(p.nickHist[0].at);
      if (d >= 0 && d <= minfo.nickDays) out.push(["닉변경 " + (d === 0 ? "오늘" : d + "일"), c.nick]);
    }
    // 삭제율은 프로필 화면과 같은 계산 (건수 하한 없음 — 3건 중 3건 삭제도 100%, 2026-09-22 사용자)
    const pct = (del, total) => (total > 0 ? Math.round(del / total * 100) : -1);
    if (minfo.delPct > 0) {
      const pp = pct(p.delPosts, p.posts);
      if (pp >= minfo.delPct) out.push(["글 삭제율 " + pp + "%", c.del]);
    }
    if (minfo.cdelPct > 0) {
      const cp = pct(p.delComments, p.comments);
      if (cp >= minfo.cdelPct) out.push(["댓글 삭제율 " + cp + "%", c.cdel]);
    }
    // 글을 한 번도 안 쓴 회원만. 다 지운 경우는 삭제율 배지가 말해 준다 (겹치지 않게, 2026-09-22 사용자)
    if (minfo.noPost && p.posts === 0) out.push(["글 없음", c.noPost]);
    if (minfo.noComment && p.comments === 0) out.push(["댓글 없음", c.noComment]);
    // 배지는 지금 제한 중일 때만. 지난 내역은 요약 줄에만 둔다 (클리앙도 현재 제한만 배지, 횟수 배지는 과함 — 2026-09-22 사용자)
    const left = miDiscLeft(p.disc);
    if (minfo.discNow && left > 0) out.push(["이용제한 중 (" + (left === Infinity ? "영구" : left + "일 남음") + ")", c.disc]);
    return out;
  }

  function ensureMiStyle() {
    if (document.getElementById("dui-minfo-style")) return;
    const style = document.createElement("style");
    style.id = "dui-minfo-style";
    style.textContent =
      ".dui-mibox{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;}" +
      ".dui-mib{display:inline-block;margin:0;padding:0 6px;border:0;border-radius:5px;font:inherit;font-size:11px;line-height:18px;" +
      "font-weight:600;white-space:nowrap;cursor:default;}" +
      "#dui-micard{margin:0 0 1.5rem;padding:12px 14px;border-radius:12px;background:var(--background,#fff);color:var(--foreground,#1c1c1e);" +
      "border:1px solid rgba(0,0,0,.08);box-shadow:0 1px 2px rgba(0,0,0,.05);font-size:13px;line-height:1.5;}" +
      "html.dui-dark #dui-micard,html.dui-dark #dui-mipbadges{border-color:rgba(255,255,255,.12);}" +
      "#dui-micard .dui-mic-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;}" +
      "#dui-micard .dui-mic-title{font-weight:700;font-size:14px;}" +
      ".dui-mic-info{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin:0;padding:0;" +
      "border:0;background:none;color:#9ca3af;cursor:pointer;align-self:center;}" +
      ".dui-mic-info:hover{color:#6b7280;}" +
      "html.dui-dark .dui-mic-info{color:#6b7280;}" +
      "html.dui-dark .dui-mic-info:hover{color:#9ca3af;}" +
      ".dui-mibox .dui-mic-info{width:16px;height:16px;}" +
      "#dui-micard .dui-mic-who{margin-left:auto;}" +
      "#dui-micard .dui-mic-nick{font-weight:600;color:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer;}" +
      "#dui-micard .dui-mic-id{font-weight:400;font-size:12px;color:var(--muted-foreground,#6b7280);}" +
      "#dui-micard .dui-mic-lv{margin-left:6px;font-weight:400;font-size:12px;color:var(--muted-foreground,#6b7280);}" +
      ".dui-mic-badges{display:flex;flex-wrap:wrap;align-items:center;gap:6px;}" +
      ".dui-mic-badges .dui-mib{font-size:13px;line-height:24px;padding:0 10px;border-radius:7px;cursor:default;}" +
      "#dui-mipbadges{margin:0 0 1rem;padding:12px 14px;border-radius:12px;background:var(--background,#fff);color:var(--foreground,#1c1c1e);" +
      "border:1px solid rgba(0,0,0,.08);box-shadow:0 1px 2px rgba(0,0,0,.05);font-size:13px;line-height:1.5;}" +
      "#dui-micard .dui-mic-badges+.dui-mic-body{margin-top:10px;}" +
      "#dui-micard .dui-mic-line{margin-top:4px;font-size:12.5px;color:var(--muted-foreground,#6b7280);}" +
      "#dui-micard .dui-mic-line b{font-weight:600;color:var(--foreground,#1c1c1e);}" +
      ".dui-mic-sep{margin:0 7px;opacity:.45;}" +
      ".dui-mic-note,#dui-micard .dui-mic-line a.dui-mic-note,#dui-mipop a.dui-mic-note{color:var(--muted-foreground,#6b7280);}" +
      ".dui-mic-warn,#dui-micard .dui-mic-line a.dui-mic-warn,#dui-mipop a.dui-mic-warn{color:#b45309;font-weight:500;}" +
      ".dui-mic-bad,#dui-micard .dui-mic-line a.dui-mic-bad,#dui-mipop a.dui-mic-bad{color:#dc2626;font-weight:500;}" +
      ".dui-mic-now{font-weight:700;}" +
      "html.dui-dark .dui-mic-warn,html.dui-dark #dui-micard .dui-mic-line a.dui-mic-warn," +
      "html.dui-dark #dui-mipop a.dui-mic-warn{color:#f59e0b;}" +
      "html.dui-dark .dui-mic-bad,html.dui-dark #dui-micard .dui-mic-line a.dui-mic-bad," +
      "html.dui-dark #dui-mipop a.dui-mic-bad{color:#f87171;}" +
      "#dui-micard .dui-mic-line a{color:inherit;text-decoration:underline;text-underline-offset:2px;cursor:pointer;}" +
      ".dui-mib.g{background:rgba(120,120,128,.16);color:#4b5563;}" +
      ".dui-mib.a{background:#fef3c7;color:#92400e;}" +
      ".dui-mib.r{background:#fee2e2;color:#b91c1c;}" +
      ".dui-mib.b{background:#dbeafe;color:#1e40af;}" +
      ".dui-mib.e{background:#dcfce7;color:#166534;}" +
      ".dui-mib.p{background:#ede9fe;color:#5b21b6;}" +
      "html.dui-dark .dui-mib.g{background:rgba(255,255,255,.12);color:#d1d5db;}" +
      "html.dui-dark .dui-mib.a{background:rgba(245,158,11,.22);color:#fcd34d;}" +
      "html.dui-dark .dui-mib.r{background:rgba(239,68,68,.22);color:#fca5a5;}" +
      "html.dui-dark .dui-mib.b{background:rgba(59,130,246,.25);color:#93c5fd;}" +
      "html.dui-dark .dui-mib.e{background:rgba(34,197,94,.22);color:#86efac;}" +
      "html.dui-dark .dui-mib.p{background:rgba(139,92,246,.25);color:#c4b5fd;}" +
      // 미니 프로필 블록. 다모앙 메뉴(또는 그 모양의 우리 메뉴) 맨 위에 들어간다
      "#dui-mipop{box-sizing:border-box;margin:0 0 4px;padding:6px 8px 8px;border-bottom:1px solid rgba(0,0,0,.08);font-size:12.5px;line-height:1.5;text-align:left;font-weight:400;color:inherit;cursor:default;user-select:text;}" +
      "#dui-mipop .h{display:flex;align-items:center;gap:6px;font-size:11px;color:#9ca3af;margin-bottom:4px;}" +
      "#dui-mipop .hd{padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid rgba(0,0,0,.08);}" +
      "html.dui-dark #dui-mipop .hd{border-color:rgba(255,255,255,.1);}" +
      "#dui-mipop .t{font-weight:600;font-size:13px;}" +
      "#dui-mipop .t a{color:inherit;text-decoration:underline;text-underline-offset:2px;}" +
      "#dui-mipop .t .id{font-weight:400;font-size:11.5px;color:#9ca3af;}" +
      "#dui-mipop .t .lv{margin-left:6px;font-weight:400;font-size:11.5px;color:#9ca3af;}" +
      "#dui-mipop .r{margin:2px 0;}" +
      "#dui-mipop .r b{font-weight:600;}" +
      "#dui-mipop .m{color:#9ca3af;}" +
      "#dui-mipop .bd{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:0 0 8px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,.08);}" +
      "html.dui-dark #dui-mipop .bd{border-color:rgba(255,255,255,.1);}" +
      "#dui-mipop .bd .dui-mib{font-size:12px;line-height:20px;padding:0 8px;border-radius:6px;cursor:default;}" +
      "#dui-mipop a{color:#1a73e8;text-decoration:underline;cursor:pointer;}" +
      "html.dui-dark #dui-mipop{border-color:rgba(255,255,255,.1);}" +
      "html.dui-dark #dui-mipop a{color:#8ab4f8;}" +
      "html.dui-dark #dui-mipop .t a{color:inherit;}" +
      "[data-dui-qp2]:hover,[data-dui-qp2]:focus{background:var(--accent,rgba(0,0,0,.06));outline:none;}" +
      "[data-dui-qp2]>svg{width:14px;height:14px;flex:none;}" +
      // 다모앙 메뉴가 없는 곳에 띄우는 메뉴. 모양은 다모앙 메뉴의 클래스로 그리고 아래는 그 클래스가 안 먹을 때의 안전망
      "#dui-mimenu-wrap{position:fixed;left:0;top:0;z-index:2147483000;min-width:max-content;pointer-events:auto;}" +
      "#dui-mimenu{background:var(--popover,#fff);color:var(--popover-foreground,inherit);border:1px solid var(--border,rgba(0,0,0,.12));}" +
      "#dui-mimenu [role=menuitem]{color:inherit;text-decoration:none;}" +
      "#dui-mimenu [role=menuitem][data-highlighted]{background:var(--accent,rgba(0,0,0,.06));}" +
      "[data-dropdown-menu-content].dui-mi-host,[data-dui-menu].dui-mi-host{width:min(360px,calc(100vw - 16px))!important;}" +
      "[data-dropdown-menu-content].dui-mi-cols,[data-dui-menu].dui-mi-cols{display:grid;position:relative;grid-template-columns:1fr 1fr;grid-auto-flow:column;" +
      "grid-template-rows:auto repeat(var(--dui-rows,4),auto);column-gap:12px;}" +
      ".dui-mi-cols>#dui-mipop{grid-row:1;grid-column:1/-1;}" +
      ".dui-mi-cols>[data-dropdown-menu-separator]{visibility:hidden;height:0;margin:0;}" +
      ".dui-mi-cols>.dui-col2{border-left:1px solid rgba(0,0,0,.1);margin-left:-6px;padding-left:13px;border-top-left-radius:0;border-bottom-left-radius:0;}" +
      "html.dui-dark .dui-mi-cols>.dui-col2{border-color:rgba(255,255,255,.14);}" +
      ".dui-mi-only>:not(#dui-mipop){display:none!important;}" +
      ".dui-mi-only>#dui-mipop{margin-bottom:0;border-bottom:0;}";
    document.documentElement.append(style);
  }

  // ---- 미니 프로필 (닉네임 팝업) ----
  // 닉네임(드롭다운 버튼)을 누르면 다모앙 메뉴 대신 회원 정보를 띄우고 메뉴 항목은 팝업 안에 옮겨 그린다(못 읽으면 아래 버튼으로 원래 메뉴).
  // 작성자 배지(minfo.on)와는 독립된 기능이다. 배지 임계치·회원 정보 조회 코드만 같이 쓴다
  // bits-ui 드롭다운은 마우스·펜은 pointerdown, 터치는 pointerup 에서 열리므로 둘 다 캡처 단계에서 막고,
  // 터치는 스크롤일 수 있어 click 때 연다. 다모앙 메뉴를 열 때는 합성 이벤트를 보내며 그동안 가로채기를 쉰다
  // keepMenu: 사이트가 메뉴를 닫는 중(사용자 Escape)이라 우리가 또 닫지 않는다
  function miClosePop(keepMenu) {
    const host = miPopEl && !keepMenu ? miPopEl.closest("[data-dropdown-menu-content],[data-dui-menu]") : null;
    if (miPopEl) miPopEl.remove();
    miPopEl = null;
    miPopAnchor = null;
    miPopKey = "";
    // 다모앙 메뉴 안에 들어가 있었으면 메뉴도 닫는다. 블록의 링크로 이동할 때 메뉴만 남아 있다 늦게 사라지던 것 (2026-09-27 사용자)
    if (host && host.isConnected && host.getAttribute("data-state") === "open") miMenuEscape(host);
  }

  // 회원 메뉴(프로필 보기~차단하기)를 여는 닉네임 드롭다운 버튼인지. 다모앙 회원 메뉴가 뜨는 곳 어디서나 (2026-09-22 사용자).
  // 닉 버튼은 글자만 있고, 보기 옵션 같은 다른 드롭다운 버튼은 아이콘(svg)뿐이라 그것으로 가른다
  function miNickTrigger(t) {
    const btn = t && t.closest ? t.closest(COMMENT_AUTHOR_SEL) : null;
    if (!btn || btn.querySelector("svg") || !btn.textContent.trim()) return null;
    return btn;
  }

  // 목록 행이면 목록 데이터의 작성자 아이디. 데이터를 기다리는 중이면 null (닉으로 잘못 찾지 않게)
  function miKeyForTrigger(btn) {
    const nick = miNickOf(btn);
    const item = btn.closest(COMMENT_SEL);
    if (item) return miKeyForComment(item, nick);
    const card = miPostCard();
    if (card && card.contains(btn)) return miKeyForAuthor(nick);
    const pid = miListRowId(btn);
    if (pid) {
      if (miList && miList.url === miListUrl()) return miList.byPost.get(pid) || nick;
      miLoadList();
      if (miListPending === miListUrl()) return null;
    }
    return nick;
  }

  // ---- 목록 데이터 ----
  // 목록 행도 화면에는 닉네임뿐이라 목록의 __data.json 을 화면당 1회 받아 글 번호 → 작성자 아이디 표를 만든다
  // (다모앙 메뉴의 프로필 보기가 옛 닉 행에서도 아이디로 가는 것을 보고 같은 원천을 쓴다, 2026-09-27 사용자).
  // 구조는 고정하지 않고 id + author_id 를 가진 객체를 훑는다. 실패하면 닉으로 조회한다
  let miList = null;
  let miListPending = "";
  let miListFail = { url: "", at: 0 };
  function miListUrl() {
    return location.pathname + location.search;
  }
  function miListRowId(btn) {
    const a = btn.closest("a.post-row");
    const m = a ? /\/(\d+)\/?$/.exec(a.getAttribute("href") || "") : null;
    return m ? m[1] : "";
  }
  function miScanPosts(v, out, depth) {
    if (!v || typeof v !== "object" || depth > 8) return;
    if (Array.isArray(v)) {
      for (const x of v) miScanPosts(x, out, depth + 1);
      return;
    }
    if (typeof v.author_id === "string" && v.author_id && (typeof v.id === "number" || typeof v.id === "string")) out.set(String(v.id), v.author_id);
    for (const k in v) miScanPosts(v[k], out, depth + 1);
  }
  function miLoadList() {
    const url = miListUrl();
    if ((miList && miList.url === url) || miListPending === url) return;
    if (miListFail.url === url && Date.now() - miListFail.at < MINFO_FAIL_TTL) return;
    miListPending = url;
    const dataUrl = location.pathname.replace(/\/$/, "") + "/__data.json" + (location.search ? location.search + "&" : "?") + "x-sveltekit-invalidated=0111111111";
    fetch(dataUrl, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then((text) => {
        const j = JSON.parse(text.split("\n")[0]);
        const byPost = new Map();
        for (const n of Array.isArray(j.nodes) ? j.nodes : []) {
          if (n && n.type === "data" && Array.isArray(n.data)) miScanPosts(unflatten(n.data), byPost, 0);
        }
        if (!byPost.size) throw new Error("no posts");
        miList = { url, byPost };
      })
      .catch((e) => {
        miListFail = { url, at: Date.now() };
        console.debug("[다모앙UI] 목록 데이터 조회 실패, 닉네임으로 조회합니다", e);
      })
      .finally(() => {
        if (miListPending === url) miListPending = "";
        miRefreshPop();
      });
  }

  // 아래에 안 들어가면 위, 둘 다 안 되면 넓은 쪽에 맞춰 높이를 줄여(안쪽 스크롤) 닉 버튼을 가리지 않는다.
  // 가리면 그 위에서 뗀 click 의 target 이 공통 조상이 된다. 양쪽 다 좁으면 그냥 덮는다
  function miRenderPop() {
    if (!miPopEl || !miPopAnchor) return;
    const pop = miPopEl;
    const btn = miPopAnchor;
    const nick = miNickOf(btn);
    const tipTitle = qpbTipIn(pop);
    pop.textContent = "";
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const infoBtn = (title, text) => {
      const info = el("button", "dui-mic-info");
      info.type = "button";
      info.title = title;
      info.append(duiIcon("pageInfo"));
      info.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qpbTipEl && qpbTipAnchor === info) qpbCloseTip();
        else qpbOpenTip(info, text);
      });
      return info;
    };
    const rec = miPopKey ? miGet(miPopKey) : null;
    // 배지 줄은 맨 위, 작성자 배지 설정(mini)이 켠다. 글 작성자 상자와 같은 구성 (2026-09-27 사용자)
    const topBadges = rec && rec.p && minfo.mini ? miBadges(rec.p) : [];
    if (topBadges.length) {
      const bd = el("div", "bd");
      for (const [text, cls] of topBadges) bd.append(el("span", "dui-mib " + cls, text));
      if (minfo.info) bd.append(infoBtn("이 배지는 무엇인가요?", MINFO_TIP_TEXT));
      pop.append(bd);
    }
    const head = el("div", "h", "미니 프로필");
    if (minfo.popInfo) head.append(infoBtn("이 팝업은 무엇인가요?", minfo.popMode === "menu" ? MINFO_POP_TIP_TEXT2 : MINFO_POP_TIP_TEXT));
    pop.append(head);
    if (!rec) {
      const st = miPageState();
      const waiting = (miPopKey && miPending.has(miPopKey)) || (!miPopKey && (st === "pending" || st === "idle" || miListPending === miListUrl()));
      pop.append(el("div", "t", nick));
      pop.append(el("div", "r m", waiting ? "불러오는 중…" : "회원 정보를 가져오지 못했습니다"));
    } else if (!rec.p) {
      pop.append(el("div", "t", nick));
      pop.append(el("div", "r m", "회원 정보를 찾을 수 없습니다 (닉네임이 바뀌었거나 탈퇴한 회원)"));
    } else {
      const p = rec.p;
      const t = el("div", "t");
      const a = el("a", "", p.nick || nick);
      const path = "/member/" + (p.id || encodeURIComponent(nick));
      a.href = path;
      a.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const host = miHostOf(a);
        miClosePop();
        goTo(path, host);
      });
      const show = minfo.popShow;
      if (p.id) a.append(el("span", "id", "(" + p.id + ")"));
      t.append(a);
      if (!p.left) t.append(el("span", "lv", "Lv." + p.level));
      // 닉 줄(과 옛 닉 안내)은 가로줄로 나눈다
      const hd = el("div", "hd");
      hd.append(t);
      // 글에 보이는 닉과 현재 닉이 다르면 알려 준다
      if (p.nick && nick && p.nick !== nick) hd.append(el("div", "r m", "이 글에서는 " + nick));
      pop.append(hd);
      for (const l of miLines(p, show, true)) pop.append(miLineEl(l, "r"));
      const leftLine = show.disc ? miLeftLine(p) : null;
      if (leftLine) pop.append(miLineEl(leftLine, "r"));
    }
    const host = pop.closest("[data-dui-menu]");
    if (host && host.duiPlace) host.duiPlace();
    qpbTipRebind(pop, tipTitle);
  }


  // 다모앙 회원 메뉴가 없는 곳(공감 목록)에는 그 메뉴와 같은 모양의 메뉴를 우리가 그린다 (2026-09-27 사용자 —
  // 글·댓글의 닉 메뉴에서 프로필 보기만 남긴 구성). 클래스는 다모앙 메뉴 것을 빌려 색·애니메이션·하이라이트가 같고
  // 방향키·Enter·Escape 도 같이 동작한다. 페이지에서 다모앙 메뉴가 한 번 열리면 그때 클래스를 받아 두고, 없으면 2026-09 표본
  const MI_MENU_CLS = {
    content: "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-end-2 data-[side=right]:slide-in-from-start-2 data-[side=top]:slide-in-from-bottom-2 max-h-(--bits-dropdown-menu-content-available-height) origin-(--bits-dropdown-menu-content-transform-origin) z-50 min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border p-1 shadow-md outline-none w-40",
    item: "data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground outline-hidden relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 cursor-pointer gap-2",
    sep: "bg-border -mx-1 my-1 h-px",
  };
  let miMenuCls = null;
  function miMenuCapture(c) {
    const it = c.querySelector(MI_MENU_ITEM_SEL);
    if (!it || !c.className || !it.className) return;
    const sep = c.querySelector("[data-dropdown-menu-separator]");
    miMenuCls = { content: c.className, item: it.className, sep: sep && sep.className ? sep.className : MI_MENU_CLS.sep };
    try {
      sessionStorage.setItem("dui-menucls", JSON.stringify(miMenuCls));
    } catch (_) {}
  }
  function miMenuClasses() {
    if (!miMenuCls) {
      try {
        const v = JSON.parse(sessionStorage.getItem("dui-menucls") || "null");
        if (v && v.content && v.item && v.sep) miMenuCls = v;
      } catch (_) {}
    }
    return miMenuCls || MI_MENU_CLS;
  }

  let miMenuEl = null;
  let miMenuAnchor = null;
  let miMenuOpenedAt = 0;
  function miCloseMiniMenu() {
    const c = miMenuEl;
    miMenuEl = null;
    miMenuAnchor = null;
    if (!c) return;
    // 블록이 이 메뉴 안에 있으면 상태만 정리하고 요소는 메뉴와 함께 사라지게 둔다 (닫힘 애니메이션 동안 그대로 보이게)
    if (miPopEl && c.contains(miPopEl)) {
      miPopEl = null;
      miPopAnchor = null;
      miPopKey = "";
    }
    const wrap = c.parentElement;
    const done = () => (wrap || c).remove();
    c.setAttribute("data-state", "closed");
    c.addEventListener("animationend", done, { once: true });
    setTimeout(done, 250);
  }
  // items: { label, icon, href } 는 링크(이동은 사이트 라우터가 처리), { label, icon, run } 은 동작, { sep: true } 는 구분선
  function miSiteMenu(anchor, items) {
    miCloseMiniMenu();
    for (const w of document.querySelectorAll("#dui-mimenu-wrap")) w.remove();
    ensureMiStyle();
    const cls = miMenuClasses();
    const wrap = document.createElement("div");
    wrap.id = "dui-mimenu-wrap";
    miShield(wrap);
    const c = document.createElement("div");
    c.id = "dui-mimenu";
    c.className = cls.content;
    c.setAttribute("data-dui-menu", "");
    c.setAttribute("role", "menu");
    c.setAttribute("aria-orientation", "vertical");
    c.setAttribute("data-state", "open");
    c.setAttribute("data-align", "start");
    c.style.pointerEvents = "auto";
    const menuItems = () => [...c.querySelectorAll("[role=menuitem]")];
    // 포커스는 옮기지 않는다 (다이얼로그의 포커스 스코프가 밖으로 나간 포커스를 되돌린다). 하이라이트 속성만
    const highlight = (el) => {
      for (const x of menuItems()) if (x !== el) x.removeAttribute("data-highlighted");
      if (el) el.setAttribute("data-highlighted", "");
    };
    for (const it of items) {
      if (it.sep) {
        const sp = document.createElement("div");
        sp.className = cls.sep;
        sp.setAttribute("role", "separator");
        c.append(sp);
        continue;
      }
      const el = document.createElement(it.href ? "a" : "div");
      el.className = cls.item;
      el.setAttribute("role", "menuitem");
      if (it.href) el.href = it.href;
      if (it.icon) el.append(duiIcon(it.icon));
      el.append(document.createTextNode(it.label));
      el.addEventListener("click", (e) => {
        if (it.href) {
          // 이동은 사이트 라우터에 맡기고, 메뉴는 이벤트가 다 돈 뒤에 닫는다 (사이트 처리기가 떨어진 요소를 보지 않게)
          setTimeout(() => {
            if (miMenuEl === c) miCloseMiniMenu();
          }, 0);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (!it.keep) miCloseMiniMenu();
        it.run(c, el);
      });
      el.addEventListener("pointermove", () => {
        if (!el.hasAttribute("data-highlighted")) highlight(el);
      });
      c.append(el);
    }
    c.addEventListener("pointerleave", () => highlight(null));
    // document 캡처 keydown 에서 부른다. 처리했으면 true (호출 쪽이 preventDefault·stopImmediatePropagation)
    c.duiKey = (e) => {
      const list = menuItems();
      const i = list.findIndex((x) => x.hasAttribute("data-highlighted"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
        let n = e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : i + (e.key === "ArrowDown" ? 1 : -1);
        if (i < 0 && e.key === "ArrowUp") n = list.length - 1;
        highlight(list[Math.max(0, Math.min(list.length - 1, n))]);
        return true;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (i >= 0) list[i].click();
        return true;
      }
      if (e.key === "Tab") {
        miCloseMiniMenu();
        return false;
      }
      return false;
    };
    wrap.append(c);
    const host = miHostOf(anchor);
    host.append(wrap);
    // bits-ui 와 같은 배치: 아래 4px, 왼쪽 정렬, 아래가 모자라고 위가 더 넓으면 위로. 닉이 스크롤로 가려지면 닫는다
    const clip = (() => {
      for (let n = anchor.parentElement; n && n !== host && n !== document.body; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if (o === "auto" || o === "scroll") return n;
      }
      return null;
    })();
    const place = () => {
      if (!wrap.isConnected) return true;
      const r = anchor.getBoundingClientRect();
      if (clip) {
        const cr = clip.getBoundingClientRect();
        if (r.bottom < cr.top || r.top > cr.bottom) return false;
      }
      if (r.bottom < 0 || r.top > window.innerHeight) return false;
      const b = miBoundsOf(host);
      const below = b.bottom - r.bottom - 4;
      const above = r.top - b.top - 4;
      const fit = (v) => {
        const px = Math.max(80, v) + "px";
        c.style.setProperty("--bits-dropdown-menu-content-available-height", px);
        c.style.maxHeight = px;
      };
      fit(Math.max(below, above));
      const h = c.offsetHeight;
      const side = h > below && above > below ? "top" : "bottom";
      fit(side === "top" ? above : below);
      c.setAttribute("data-side", side);
      c.style.setProperty("--bits-dropdown-menu-content-transform-origin", side === "top" ? "0 100%" : "0 0");
      const top = side === "top" ? Math.max(b.top, r.top - 4 - c.offsetHeight) : r.bottom + 4;
      miPlaceFixed(wrap, Math.max(b.left, Math.min(r.left, b.right - c.offsetWidth)), top);
      return true;
    };
    c.duiPlace = () => {
      if (!place() && miMenuEl === c && Date.now() - miMenuOpenedAt > 300) miCloseMiniMenu();
    };
    place();
    miMenuEl = c;
    miMenuAnchor = anchor;
    miMenuOpenedAt = Date.now();
    return c;
  }
  // 추가 표시: [미니 프로필 | 프로필 보기]. 미니 프로필을 고르면 그 항목 자리에 블록이 펼쳐진다 (메뉴는 열린 채)
  function miOpenMiniMenu(a, id, path) {
    miClosePop();
    miSiteMenu(a, [
      {
        label: QP2_LABEL,
        icon: "eye",
        keep: true,
        run: (c, el) => {
          // 우리 메뉴라 항목을 지워도 된다. 블록만 남는다
          for (const x of [...c.children]) x.remove();
          miEmbedPop(c, a, id, true);
        },
      },
      { sep: true },
      { label: "프로필 보기", icon: "user", href: path },
    ]);
  }

  // 글 데이터·프로필이 도착할 때마다 다시 그린다
  function miRefreshPop() {
    if (!miPopEl) return;
    if (!miPopAnchor || !miPopAnchor.isConnected) {
      miClosePop();
      return;
    }
    if (!miPopKey) {
      const st = miPageState();
      if (st === "pending" || st === "idle") miLoadPage();
      else miPopKey = miKeyForTrigger(miPopAnchor) || "";
    }
    if (miPopKey && !miGet(miPopKey)) miRequest(miPopKey);
    miRenderPop();
  }

  const MI_MENU_SEL = "[data-dropdown-menu-content][data-state=\"open\"]";
  const MI_MENU_ITEM_SEL = "[data-dropdown-menu-item]";

  // bits-ui 는 document 의 Escape keydown 으로 맨 위 레이어를 닫는다
  function miMenuEscape(c) {
    c.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true, composed: true }));
  }

  // 바깥 누름은 pointerdown 에서 닫는다. click 은 pointerdown·pointerup 위치가 다르면 공통 조상이 target 이라 오판한다
  listen(document, "pointerdown", (e) => {
    if (miMenuEl && !miMenuEl.contains(e.target) && !(miMenuAnchor && miMenuAnchor.contains(e.target))) miCloseMiniMenu();
  }, true);

  // ---- 미니 프로필과 다모앙 메뉴 ----
  // 닉네임 클릭은 건드리지 않고 다모앙 메뉴가 열리는 것을 닉 버튼 누름 뒤 잠깐 폴링해서 잡는다 (문서 전체 옵저버를 더 두지 않으려고).
  // 통합 표시: 메뉴 맨 위에 미니 프로필 블록을 끼워 넣는다 — 메뉴 항목·열림·닫힘은 전부 다모앙 것이라 팔로우 전환도 그대로
  //   (한때 메뉴를 감춰 열어 항목을 베끼고 합성 클릭으로 대신 누르는 방식이었으나 깜빡임·멋대로 닫힘으로 폐기, 2026-09-27).
  // 추가 표시: 맨 위에 "미니 프로필" 항목과 구분선을 끼워 넣고(메뉴 폭 w-40 이라 글자를 더 넣으면 줄이 바뀐다),
  //   고르면 메뉴를 닫고 회원 정보 팝업을 띄운다. 팝업의 닉·아이디가 프로필 링크다. ⓘ 는 팝업의 것을 쓴다
  const QP2_LABEL = "미니 프로필";
  const miQp2Btn = new WeakMap();
  let miQp2Obs = null;
  let miQp2Poll = 0;

  function miQp2Apply(c, btn) {
    miQp2Btn.set(c, btn);
    if (!c.querySelector("[data-dui-qp2]") && !c.querySelector("#dui-mipop")) {
      const first = c.querySelector(MI_MENU_ITEM_SEL);
      if (!first) return;
      ensureMiStyle();
      // 사이트 항목의 클래스(모양)만 복제한다. bits-ui 가 DOM 으로 항목을 찾으므로 data-dropdown-menu-item 은 남겨 방향키 이동에 포함되게 한다
      const it = first.cloneNode(false);
      it.removeAttribute("id");
      it.removeAttribute("aria-disabled");
      it.setAttribute("data-dui-qp2", "");
      it.append(duiIcon("eye"), " " + QP2_LABEL);
      const sep = c.querySelector("[data-dropdown-menu-separator]");
      first.before(it);
      if (sep) {
        const sp = sep.cloneNode(false);
        sp.removeAttribute("id");
        sp.setAttribute("data-dui-qp2-sep", "");
        first.before(sp);
      }
    }
    if (miQp2Obs) miQp2Obs.disconnect();
    // 메뉴가 열린 채 다시 그려져(팔로우 상태 변화 등) 우리 항목이 사라지면 다시 넣는다
    miQp2Obs = new MutationObserver(() => {
      if (!c.isConnected) {
        miQp2Obs.disconnect();
        miQp2Obs = null;
        return;
      }
      miQp2Apply(c, btn);
    });
    miQp2Obs.observe(c, { childList: true, subtree: true });
  }

  function miQp2Watch(btn) {
    clearTimeout(miQp2Poll);
    const t0 = performance.now();
    const poll = () => {
      const c = document.querySelector(MI_MENU_SEL);
      if (c && c.contains(btn) === false) {
        if (!miQp2Btn.has(c)) {
          miMenuCapture(c);
          if (minfo.popMode === "menu") miQp2Apply(c, btn);
          else miEmbedPop(c, btn);
        }
        return;
      }
      if (performance.now() - t0 < 500) miQp2Poll = setTimeout(poll, 16);
    };
    miQp2Poll = setTimeout(poll, 0);
  }

  // 통합 표시: 열린 다모앙 메뉴 맨 위에 미니 프로필 블록을 넣는다. 메뉴가 닫히면 블록도 같이 사라진다.
  // key 를 주면 그 아이디로 조회한다 (공감 목록 — 링크의 아이디).
  // only: 추가 표시에서 '미니 프로필' 항목을 고른 경우 — 메뉴 항목은 감추고 블록만 보인다 (2026-09-28 사용자, 통합 표시와 같으면 이상함).
  // 사이트 항목은 지우지 않고 CSS 로 감춘다 (bits-ui 가 다시 그리는 요소라)
  function miEmbedPop(c, btn, key, only) {
    miQp2Btn.set(c, btn);
    if (c.querySelector("#dui-mipop")) return;
    miClosePop();
    if (miMenuEl !== c) miCloseMiniMenu();
    closePmenu();
    qpbCloseTip();
    ensureMiStyle();
    c.classList.add("dui-mi-host");
    c.classList.toggle("dui-mi-only", !!only);
    miPopEl = document.createElement("div");
    miPopEl.id = "dui-mipop";
    c.prepend(miPopEl);
    miEmbedCols(c);
    miPopAnchor = btn;
    miPopKey = key || "";
    miRefreshPop();
    if (miQp2Obs) miQp2Obs.disconnect();
    // 메뉴가 열린 채 다시 그려져 블록이 빠지면 다시 넣고, 메뉴가 닫히면 상태를 정리한다
    const el = miPopEl;
    miQp2Obs = new MutationObserver(() => {
      if (!c.isConnected) {
        miQp2Obs.disconnect();
        miQp2Obs = null;
        if (miPopEl === el) miClosePop();
        return;
      }
      if (miPopEl === el && !el.isConnected) c.prepend(el);
      miEmbedCols(c);
    });
    miQp2Obs.observe(c, { childList: true, subtree: true });
  }

  // 메뉴 항목을 구분선 앞뒤 두 묶음으로 나눠 두 열에 세운다 (예전 미러링 팝업의 두 열 모양, 2026-09-27 사용자).
  // 구분선이 하나일 때만. 행 수 = max(앞 묶음 + 구분선 칸, 뒤 묶음) 이라 앞 묶음이 1열, 뒤 묶음이 2열에 온다
  function miEmbedCols(c) {
    if (c.classList.contains("dui-mi-only")) {
      c.classList.remove("dui-mi-cols");
      return;
    }
    const kids = [...c.children].filter((x) => x.id !== "dui-mipop");
    const seps = kids.filter((x) => x.hasAttribute("data-dropdown-menu-separator"));
    if (seps.length !== 1 || kids.length < 4) {
      c.classList.remove("dui-mi-cols");
      for (const x of kids) x.classList.remove("dui-col2");
      return;
    }
    const g1 = kids.indexOf(seps[0]);
    const rows = Math.max(g1 + 1, kids.length - g1 - 1);
    c.style.setProperty("--dui-rows", String(rows));
    c.classList.add("dui-mi-cols");
    // 둘째 열 항목에 왼쪽 실선 (그리드 가상 요소는 사이트 스타일과 얽혀 안 보였음)
    kids.forEach((x, i) => x.classList.toggle("dui-col2", i > g1));
  }

  // 항목을 고르면 메뉴를 닫지 않고 그 자리에서 블록으로 바꾼다 — 통합 표시와 같은 구성이라 스크롤 유지·바깥 클릭 차단·
  // 애니메이션·키보드가 전부 다모앙 것 (예전엔 메뉴를 닫고 독립 팝업을 띄워 동작이 달랐다, 2026-09-28 사용자)
  function miQp2Open(it) {
    const c = it.closest("[data-dropdown-menu-content]");
    const btn = c ? miQp2Btn.get(c) : null;
    if (!btn || !btn.isConnected) return;
    qpbCloseTip();
    if (it.contains(document.activeElement)) c.focus({ preventScroll: true });
    const sep = c.querySelector("[data-dui-qp2-sep]");
    if (sep) sep.remove();
    it.remove();
    miEmbedPop(c, btn, undefined, true);
  }


  listen(document, "pointerdown", (e) => {
    if (!minfo.pop) return;
    const btn = miNickTrigger(e.target);
    if (!btn) return;
    miQp2Watch(btn);
  }, true);
  listen(document, "click", (e) => {
    if (!minfo.pop) return;
    const it = e.target.closest ? e.target.closest("[data-dui-qp2]") : null;
    if (it) {
      e.preventDefault();
      e.stopPropagation();
      miQp2Open(it);
      return;
    }
    const btn = miNickTrigger(e.target);
    if (btn) miQp2Watch(btn);
  }, true);
  listen(document, "keydown", (e) => {
    if (!minfo.pop) return;
    if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown") return;
    const it = e.target && e.target.closest ? e.target.closest("[data-dui-qp2]") : null;
    if (it && e.key !== "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      miQp2Open(it);
      return;
    }
    const btn = miNickTrigger(e.target);
    if (btn) miQp2Watch(btn);
  }, true);

  // 이용제한 기록 검색 주소. 탈퇴한 회원은 프로필에 제재 내역이 없어 기록 목록에서 아이디로 찾는다
  const MINFO_DLOG_SEARCH = "/disciplinelog?member_id=";

  // 탈퇴 회원에게 붙는 줄. 이용제한 내역 항목이 켜진 곳(카드·프로필 팝업)에 붙는다
  function miLeftLine(p) {
    if (!p.left || !p.id) return null;
    return [["b", "이용제한 내역"], " — ", ["a", "이용제한 기록에서 찾기", MINFO_DLOG_SEARCH + encodeURIComponent(p.id), ""]];
  }

  function miSummary(p) {
    return "가입 " + (p.reg ? miFmtDate(p.reg) : "?") + " · 게시글 " + p.posts + " · 댓글 " + p.comments;
  }

  // 요약 줄들. 프로필 화면의 용어를 따른다 (공감·신고는 그 회원이 한 수, 관리자·글작성자 삭제, 이용제한 내역의 주의).
  // 각 줄은 [문자열 | ["b", 문자열] | ["a", 문자열, 경로]] 배열
  // show: 줄 선택 { account, activity, rcmd, nick, disc }. 없으면 전부.
  // split: 항목마다 줄을 나눈다 (좁은 프로필 팝업, 2026-09-24 사용자). 카드는 " | " 로 한 줄에 잇는다
  function miLines(p, show, split) {
    if (p.left) return [];
    const on = (k) => !show || show[k] !== false;
    const n = (v) => v.toLocaleString();
    const pct = (del, total) => (total > 0 ? Math.round(del / total * 100) : 0);
    const lines = [];
    // 항목 사이는 " | ", 항목 안의 세부는 " · " (2026-09-22 사용자 결정)
    const SEP = ["sep"];
    const push = (items) => {
      if (split) {
        for (const it of items) lines.push(it);
        return;
      }
      const l = [];
      items.forEach((it, i) => { if (i) l.push(SEP); l.push(...it); });
      lines.push(l);
    };
    if (on("account")) push([
      ["가입 ", ["b", p.reg ? miFmtDate(p.reg) : "?"], " (" + p.regDays + "일)"],
      ["최종 접속 ", ["b", p.login ? miFmtDate(p.login) : "?"]],
      ["포인트 ", ["b", n(p.point)]],
      ["팔로워 ", ["b", n(p.followers)], " · 팔로잉 ", ["b", n(p.following)]]
    ]);
    // 게시글·댓글(activity)과 공감·신고(rcmd)는 따로 켜고 끄며 줄도 따로 (2026-09-24 사용자)
    if (on("activity")) {
      const items = [
        ["게시글 ", ["b", n(p.posts)], " (삭제 " + n(p.delPosts) + " · 삭제율 " + pct(p.delPosts, p.posts) + "%)"],
        ["댓글 ", ["b", n(p.comments)], " (삭제 " + n(p.delComments) + " · 삭제율 " + pct(p.delComments, p.comments) + "%)"]
      ];
      if (p.adminPosts || p.adminComments) items.push(["관리자·글작성자 삭제 (게시글 " + n(p.adminPosts) + " · 댓글 " + n(p.adminComments) + ")"]);
      push(items);
    }
    if (on("rcmd")) lines.push(["공감 ", ["b", n(p.rcmd)], " · 신고 ", ["b", n(p.singo)]]);
    if (on("nick") && p.nickHist.length) {
      // 횟수는 적지 않는다 (이용제한 내역과 같은 이유)
      const l = [["b", "닉네임 변경"]];
      p.nickHist.forEach((h, i) => { l.push((i ? " · " : " — ") + miFmtDate(h.at) + " " + h.old + " → " + h.nw); });
      lines.push(l);
    }
    const left = miDiscLeft(p.disc);
    if (on("disc") && (left > 0 || p.discHist.length)) {
      // 횟수는 적지 않는다. 프로필의 내역이 전체인지 확인되지 않았다.
      // 제한 중이면 그 부분만 굵게, 색은 내역 항목과 같은 기준 (2026-09-24 사용자)
      const l = left > 0
        ? [["s", "이용제한 중 (" + (left === Infinity ? "영구, " : p.disc.period + "일, ") + miFmtDate(p.disc.from) + " 부터" + (left === Infinity ? "" : ", " + left + "일 남음") + ")", miDiscClass(p.disc) + " dui-mic-now"], p.discHist.length ? " · 내역" : ""]
        : [["b", "이용제한 내역"]];
      // 전부 나열한다 (요약해서 줄이지 않기로 함, 2026-09-22 사용자)
      p.discHist.forEach((h, i) => {
        l.push(i ? " · " : " — ");
        const text = miDiscLabel(h) + " " + miFmtDate(h.from);
        // 색은 사이트의 이용제한 기록 목록과 같게: 주의 muted, N일 amber-700(다크 amber-500), 영구 red-600(다크 red-400) (2026-09-23 사용자)
        const cls = miDiscClass(h);
        l.push(h.wr ? ["a", text, "/disciplinelog/" + h.wr, cls] : ["s", text, cls]);
      });
      // 이용제한 기록 목록의 회원별 보기
      if (p.id) l.push(" · ", ["a", "전체 보기", MINFO_DLOG_SEARCH + encodeURIComponent(p.id), ""]);
      lines.push(l);
    }
    return lines;
  }

  function miLineEl(parts, cls) {
    const d = document.createElement("div");
    d.className = cls;
    for (const x of parts) {
      if (typeof x === "string") {
        d.append(x);
      } else if (x[0] === "sep") {
        const sp = document.createElement("span");
        sp.className = "dui-mic-sep";
        sp.textContent = "|";
        d.append(sp);
      } else if (x[0] === "b") {
        const b = document.createElement("b");
        b.textContent = x[1];
        d.append(b);
      } else if (x[0] === "s") {
        const sp = document.createElement("span");
        sp.textContent = x[1];
        if (x[2]) sp.className = x[2];
        d.append(sp);
      } else {
        const a = document.createElement("a");
        a.textContent = x[1];
        a.href = x[2];
        if (x[3]) a.className = x[3];
        a.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const host = miHostOf(a);
          miClosePop();
          goTo(x[2], host);
        });
        d.append(a);
      }
    }
    return d;
  }

  function miNickOf(btn) {
    return btn ? btn.textContent.trim() : "";
  }

  // 글 페이지의 글 카드. 제목(h1)이 있는 카드 머리글을 가진 카드
  function miPostCard() {
    if (!/^\/[A-Za-z0-9_-]+\/\d+\/?$/.test(location.pathname)) return null;
    const h1 = document.querySelector('[data-slot="card-header"] h1[data-slot="card-title"]');
    return h1 ? h1.closest('[data-slot="card"]') : null;
  }

  function miAuthorBtn(card) {
    const head = card && card.querySelector('[data-slot="card-header"]');
    return head ? head.querySelector(COMMENT_AUTHOR_SEL) : null;
  }

  // 글 작성자 카드. 글 카드 바로 뒤(작성자 최근 활동 앞)에 붙이고, 내용이 같으면 손대지 않는다
  // 글 작성자 상자. 글 카드 바로 뒤(작성자 최근 활동 앞). 배지 줄(작성자 배지)과 작성자 정보(글 작성자 정보 바로 표시)가
  // 한 상자를 같이 쓴다: 배지 줄이 위, 정보가 아래. 둘 다 독립된 기능이라 한쪽만 켜져도 상자를 만든다 (2026-09-24 사용자)
  function miRenderCard(postCard, key, nick) {
    const rec = miGet(key);
    const p = rec ? rec.p : null;
    const old = document.getElementById("dui-micard");
    const badges = p && minfo.on ? miBadges(p) : [];
    // 탈퇴 회원의 정보는 이용제한 기록 찾기 링크뿐이다
    const lines = !!p && minfo.card.on && (!p.left || minfo.card.show.disc);
    if (!badges.length && !lines) {
      if (old) old.remove();
      return;
    }
    const sig = miRev + ":" + rec.t + ":" + minfo.info + minfo.card.info + lines + JSON.stringify(minfo.card.show) + ":" + badges.map(b => b[0] + "|" + b[1]).join(",");
    if (old && old.dataset.duiNick === key && old.dataset.duiSig === sig && old.previousElementSibling === postCard) return;
    const card = document.createElement("div");
    card.id = "dui-micard";
    card.dataset.duiNick = key;
    card.dataset.duiSig = sig;
    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const infoBtn = (title, text) => {
      const info = el("button", "dui-mic-info");
      info.type = "button";
      info.title = title;
      info.append(duiIcon("pageInfo"));
      info.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qpbTipEl && qpbTipAnchor === info) qpbCloseTip();
        else qpbOpenTip(info, text);
      });
      return info;
    };
    if (badges.length) {
      const row = el("div", "dui-mic-badges");
      for (const [text, cls] of badges) row.append(el("span", "dui-mib " + cls, text));
      if (minfo.info) row.append(infoBtn("이 배지는 무엇인가요?", MINFO_TIP_TEXT));
      card.append(row);
    }
    if (lines) {
      const body = el("div", "dui-mic-body");
      const head = el("div", "dui-mic-head");
      head.append(el("span", "dui-mic-title", "작성자 정보"));
      if (minfo.card.info) head.append(infoBtn("이 카드는 무엇인가요?", MINFO_CARD_TIP_TEXT));
      // 닉과 아이디. 누르면 프로필로 이동한다
      const nickEl = el("a", "dui-mic-nick", p.nick || nick);
      nickEl.href = "/member/" + (p.id || encodeURIComponent(nick));
      nickEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        goTo("/member/" + (p.id || encodeURIComponent(nick)));
      });
      if (p.id) nickEl.append(el("span", "dui-mic-id", "(" + p.id + ")"));
      const who = el("span", "dui-mic-who");
      who.append(nickEl);
      if (!p.left) who.append(el("span", "dui-mic-lv", "Lv." + p.level));
      head.append(who);
      body.append(head);
      for (const l of miLines(p, minfo.card.show)) body.append(miLineEl(l, "dui-mic-line"));
      const leftLine = minfo.card.show.disc ? miLeftLine(p) : null;
      if (leftLine) body.append(miLineEl(leftLine, "dui-mic-line"));
      card.append(body);
    }
    const tipTitle = qpbTipIn(old);
    if (old) old.replaceWith(card);
    else postCard.after(card);
    qpbTipRebind(card, tipTitle);
  }

  // ---- 프로필 페이지 배지 ----
  // 회원 프로필(/member/아이디)의 머리 카드와 탭 카드 사이에 배지 상자를 끼운다 (2026-09-27 사용자, 작성자 배지 설정 profile)
  function miApplyProfile() {
    const old = document.getElementById("dui-mipbadges");
    const id = mtabId();
    const first = minfo.profile && id ? document.querySelector('[data-slot="card"]:has([data-slot="card-content"] h1)') : null;
    if (!first) {
      if (old) old.remove();
      return;
    }
    ensureMiStyle();
    let key = id;
    try { key = decodeURIComponent(id); } catch (_) {}
    const rec = miGet(key);
    if (!rec) miRequest(key);
    const badges = rec && rec.p ? miBadges(rec.p) : [];
    if (!badges.length) {
      if (old) old.remove();
      return;
    }
    const sig = miRev + ":" + rec.t + ":" + minfo.info + ":" + badges.map(b => b[0] + "|" + b[1]).join(",");
    if (old && old.dataset.duiNick === key && old.dataset.duiSig === sig && old.previousElementSibling === first) return;
    const box = document.createElement("div");
    box.id = "dui-mipbadges";
    box.dataset.duiNick = key;
    box.dataset.duiSig = sig;
    const row = document.createElement("div");
    row.className = "dui-mic-badges";
    for (const [text, cls] of badges) {
      const b = document.createElement("span");
      b.className = "dui-mib " + cls;
      b.textContent = text;
      row.append(b);
    }
    if (minfo.info) {
      const info = document.createElement("button");
      info.type = "button";
      info.className = "dui-mic-info";
      info.title = "이 배지는 무엇인가요?";
      info.append(duiIcon("pageInfo"));
      info.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qpbTipEl && qpbTipAnchor === info) qpbCloseTip();
        else qpbOpenTip(info, MINFO_TIP_TEXT);
      });
      row.append(info);
    }
    box.append(row);
    const tipTitle = qpbTipIn(old);
    if (old) old.replaceWith(box);
    else first.after(box);
    qpbTipRebind(box, tipTitle);
  }

  // 댓글의 배지 줄. 본문(.comment-body)을 감싼 div 바로 뒤에 둔다 (댓글 목록은 평면이라 항목당 하나)
  function miBoxOf(item) {
    const body = item.querySelector(".comment-body");
    const anchor = body ? body.parentElement : item.firstElementChild;
    return [anchor, item.querySelector(".dui-mibox")];
  }

  // 같은 내용이면 손대지 않는다 (옵저버 되먹임 방지)
  function miRender(item, key) {
    const [anchor, old] = miBoxOf(item);
    if (!anchor) return;
    const rec = miGet(key);
    const badges = rec ? miBadges(rec.p) : [];
    if (!badges.length) {
      if (old) old.remove();
      return;
    }
    const sig = miRev + ":" + minfo.info + ":" + badges.map(b => b[0] + "|" + b[1]).join(",");
    if (old && old.dataset.duiSig === sig && old.dataset.duiNick === key) return;
    const box = old || document.createElement("div");
    box.className = "dui-mibox";
    const tipTitle = qpbTipIn(box);
    box.textContent = "";
    box.dataset.duiSig = sig;
    box.dataset.duiNick = key;
    // 배지는 표시만 한다 (누르면 아무 동작 없음, 2026-09-22 사용자). 상세는 닉네임 팝업에서
    for (const [text, cls] of badges) {
      const b = document.createElement("span");
      b.className = "dui-mib " + cls;
      b.textContent = text;
      b.title = miSummary(rec.p);
      box.append(b);
    }
    if (minfo.info) {
      const info = document.createElement("button");
      info.type = "button";
      info.className = "dui-mic-info";
      info.title = "이 배지는 무엇인가요?";
      info.append(duiIcon("pageInfo"));
      info.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (qpbTipEl && qpbTipAnchor === info) qpbCloseTip();
        else qpbOpenTip(info, MINFO_TIP_TEXT);
      });
      box.append(info);
    }
    if (!old) anchor.after(box);
    qpbTipRebind(box, tipTitle);
  }

  // 글 작성자 배지(on)·글 작성자 정보(card.on)·댓글 작성자 배지(comments)는 서로 독립이다.
  // 글 작성자 상자는 앞의 둘 중 하나만 켜져도 만들고, 댓글 배지는 글 작성자가 단 댓글이라도 comments 만 따른다
  function miApply() {
    if (!minfo.comments) for (const b of document.querySelectorAll(".dui-mibox")) b.remove();
    const wantPost = minfo.on || minfo.card.on;
    if (!wantPost) {
      const old = document.getElementById("dui-micard");
      if (old) old.remove();
    }
    if (!wantPost && !minfo.comments) return;
    ensureMiStyle();
    if (wantPost) {
      const postCard = miPostCard();
      const abtn = miAuthorBtn(postCard);
      const anick = miNickOf(abtn);
      if (postCard && anick) {
        miLoadPage();
        const st = miPageState();
        // 글 데이터를 기다리는 동안은 조회하지 않는다 (옛 닉으로 잘못 찾는 것을 막는다)
        if (st === "ready" || st === "failed") {
          const akey = miKeyForAuthor(anick);
          if (!miGet(akey)) miRequest(akey);
          miRenderCard(postCard, akey, anick);
        }
      } else {
        const old = document.getElementById("dui-micard");
        if (old) old.remove();
      }
    }
    if (!minfo.comments) return;
    for (const item of document.querySelectorAll(COMMENT_SEL)) {
      const btn = item.querySelector(COMMENT_AUTHOR_SEL);
      const nick = miNickOf(btn);
      if (!btn || !nick) continue;
      miRender(item, miKeyForComment(item, nick));
    }
  }

  // 댓글의 공감·답글·닉네임을 누르면 그 작성자를 조회한다. 동작은 그대로 흘려보낸다
  function miTrigger(e) {
    try {
      if (!minfo.comments) return;
      const t = e.target;
      if (!t || !t.closest) return;
      const item = t.closest(COMMENT_SEL);
      if (!item) return;
      const hit = t.closest(MINFO_TRIGGER_SEL);
      if (!hit || !item.contains(hit)) return;
      const nick = miNickOf(item.querySelector(COMMENT_AUTHOR_SEL));
      if (!nick) return;
      const st = miPageState();
      if (st === "pending" || st === "idle") {
        miDeferred.add(item);
        miLoadPage();
        return;
      }
      const key = miKeyForComment(item, nick);
      if (!miGet(key)) miRequest(key);
    } catch (e) {
      console.warn("[다모앙UI] 작성자 정보 트리거 실패", e);
    }
  }
  listen(document, "pointerdown", miTrigger, { capture: true, passive: true });
  listen(document, "click", miTrigger, { capture: true, passive: true });

  // ---- 공감한 사람들 목록의 미니 프로필 ----
  // 목록의 닉네임은 프로필 페이지로 가는 링크라 불편하다 (2026-09-24 사용자). 링크 대신 다모앙 메뉴 모양의 메뉴를 띄운다.
  // 아이디는 href 에서 바로 얻는다
  function miLikedDialog(dlg) {
    if (!dlg) return false;
    if (!dlg.dataset.duiLiked) {
      const title = dlg.querySelector('[data-slot="dialog-title"], h1, h2, h3');
      dlg.dataset.duiLiked = title && title.textContent.indexOf("공감한 사람들") >= 0 ? "1" : "0";
    }
    return dlg.dataset.duiLiked === "1";
  }
  listen(document, "click", (e) => {
    if (!minfo.pop) return;
    const a = e.target.closest ? e.target.closest('[data-dialog-content] a[href^="/member/"]') : null;
    if (!a || a.dataset.duiNav || a.closest("#dui-mipop, #dui-mimenu")) return;
    if (!miLikedDialog(a.closest("[data-dialog-content]"))) return;
    let id = "";
    try {
      id = decodeURIComponent(new URL(a.getAttribute("href"), location.origin).pathname.split("/")[2] || "");
    } catch (_) {}
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    const path = a.getAttribute("href");
    if (minfo.popMode === "menu") {
      // 추가 표시: 다모앙 메뉴가 없는 곳이라 [미니 프로필 | 프로필 보기] 작은 메뉴를 띄운다
      if (miMenuEl && miMenuAnchor === a) miCloseMiniMenu();
      else miOpenMiniMenu(a, id, path);
    } else if (miMenuEl && miMenuAnchor === a) {
      miCloseMiniMenu();
    } else {
      // 통합 표시: 프로필 보기만 있는 메뉴에 미니 프로필 블록을 끼운다 (글·댓글의 닉 메뉴와 같은 구성)
      miClosePop();
      miEmbedPop(miSiteMenu(a, [{ label: "프로필 보기", icon: "user", href: path }]), a, id);
    }
  }, true);

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
    if (!miLikedDialog(dlg)) return;
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
  const onTheme = () => {
    if (!alive()) return;
    syncDark();
    updateStyle();
  };
  const themeObserver = new MutationObserver(onTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  if (document.body) themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
  try {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onTheme);
  } catch (_) {}
  syncDark();
  observers.push(domObserver, themeObserver);
})();
