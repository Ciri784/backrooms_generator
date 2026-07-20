// i18n.js — language packs + switching.
// Pure data + helpers. Loaded by game.html before other modules.
// zh-TW uses Taiwan Mandarin (台灣用語).
const I18N = { en: {}, zhTW: {} };

let currentLang = "en";
try {
    const saved = localStorage.getItem("backrooms_lang");
    if (saved === "en" || saved === "zhTW") currentLang = saved;
} catch (e) {}

function setLang(lang) {
    if (lang !== "en" && lang !== "zhTW") return;
    currentLang = lang;
    try { localStorage.setItem("backrooms_lang", lang); } catch (e) {}
    if (typeof applyLanguage === "function") applyLanguage();
}

function getLang() { return currentLang; }

function t(key, ...args) {
    const pack = I18N[currentLang] || I18N.en;
    let s = pack[key];
    if (s === undefined) {
        s = I18N.en[key];
        if (s === undefined) return key;
    }
    if (typeof s !== "string") return s;
    if (args.length === 0) return s;
    for (let i = 0; i < args.length; i++) {
        s = s.split("{" + i + "}").join(args[i]);
    }
    return s;
}

// helper: render narrative with i18n key + args + mode
function nt(key, args, cls, mode) {
    return narrative(t(key, ...(args || [])), cls || "", mode);
}

// helper: language label display
function langLabel(code) {
    if (code === "zhTW") return "中文";
    return "EN";
}

if (typeof window !== "undefined") {
    window.I18N = I18N;
    window.t = t;
    window.setLang = setLang;
    window.getLang = getLang;
    window.nt = nt;
    window.langLabel = langLabel;
}
