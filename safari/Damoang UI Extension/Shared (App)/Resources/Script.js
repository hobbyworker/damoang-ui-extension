function show(platform, enabled) {
    document.body.classList.add("platform-" + platform);
    if (typeof enabled === "boolean") {
        document.body.classList.toggle("state-on", enabled);
        document.body.classList.toggle("state-off", !enabled);
    } else {
        document.body.classList.remove("state-on");
        document.body.classList.remove("state-off");
    }
}

function setSyncStatus(available, count, lastMs) {
    document.body.classList.toggle("sync-available", !!available);
    document.body.classList.toggle("sync-unavailable", !available);
    for (const el of document.querySelectorAll(".sync-count")) el.textContent = String(count || 0);
    const when = lastMs ? new Date(lastMs).toLocaleString() : "";
    // 시각은 동기화가 일어난 때가 아니라 설정을 마지막으로 바꾼 때다
    const ko = (navigator.language || "").toLowerCase().startsWith("ko");
    for (const el of document.querySelectorAll(".sync-last")) el.textContent = when ? " · " + (ko ? "마지막 변경 " : "last change ") + when : "";
}

const lang = (navigator.language || "").toLowerCase().startsWith("ko") ? "ko" : "en";
document.documentElement.lang = lang;
document.body.classList.add("lang-" + lang);

for (const button of document.querySelectorAll("button.open-preferences")) {
    button.addEventListener("click", () => webkit.messageHandlers.controller.postMessage("open-preferences"));
}

document.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) return;
    event.preventDefault();
    webkit.messageHandlers.controller.postMessage("open-url:" + link.href);
});
