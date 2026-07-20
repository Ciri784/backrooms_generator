// state.js — global state, records, and small utilities.
// Depends on data.js (LEVELS, ITEMS, ENTITY_TEMPLATES, etc.).
// Loaded by game.html after data.js, before render.js, before mechanics.js.

// The mutable game state. Mechanics reads/writes fields here; render reads
// for display. Initialized in initState() which is called from startGame().
let state = {};

// Knowledge gained from OBSERVE-ing entities. Tracked separately from state
// so it survives across startGame() (intentional — you remember what you
// learned). Cleared only by "FORGET EVERYTHING" on the death screen.
const ENTITY_OBSERVE_KNOWLEDGE = {};

function initState() {
    state = {
        stability: 100, level: 0, rooms: 0, escaped: 0,
        inventory: [], hasFlashlight: false, damageReduction: 0,
        currentEntity: null, inEncounter: false, inTransition: false,
        currentBoss: null, inBossEncounter: false,
        currentEnvEvent: null,
        bossesDefeated: Array(LEVELS.length).fill(false),
        roomsPerLevel: Array(LEVELS.length).fill(0),
        lastNarrative: "",
    };
}

// ---- Small utilities ----
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function chance(prob) { return Math.random() < prob; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function getCurrentLevel() { return LEVELS[state.level]; }

function getLevelName(num) {
    const lv = LEVELS[num];
    return lv ? lv.name : "—";
}

// ---- Persistent death records via localStorage ----
// Tracks the last 10 deaths plus lifetime aggregate stats.
// Shown on the death screen and on the opening narrative.
const RECORDS_KEY = "backrooms_records_v1";

function loadRecords() {
    try {
        const raw = localStorage.getItem(RECORDS_KEY);
        if (!raw) return { deaths: [], totalDeaths: 0, bestLevel: 0, bestEscaped: 0, totalEscaped: 0 };
        const parsed = JSON.parse(raw);
        return Object.assign({ deaths: [], totalDeaths: 0, bestLevel: 0, bestEscaped: 0, totalEscaped: 0 }, parsed);
    } catch (e) {
        return { deaths: [], totalDeaths: 0, bestLevel: 0, bestEscaped: 0, totalEscaped: 0 };
    }
}

function saveRecords(rec) {
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); }
    catch (e) { /* localStorage unavailable */ }
}

function saveDeathRecord(entry) {
    const rec = loadRecords();
    rec.deaths.unshift(entry);
    if (rec.deaths.length > 10) rec.deaths.length = 10;
    rec.totalDeaths = (rec.totalDeaths || 0) + 1;
    rec.bestLevel = Math.max(rec.bestLevel || 0, entry.level);
    rec.bestEscaped = Math.max(rec.bestEscaped || 0, entry.escaped);
    rec.totalEscaped = (rec.totalEscaped || 0) + (entry.escaped || 0);
    saveRecords(rec);
}

function getLastRecord() {
    return loadRecords().deaths[0] || null;
}

function getAggregate() {
    const rec = loadRecords();
    return {
        totalDeaths: rec.totalDeaths || 0,
        bestLevel: rec.bestLevel || 0,
        bestEscaped: rec.bestEscaped || 0,
        totalEscaped: rec.totalEscaped || 0,
    };
}

if (typeof window !== "undefined") {
    window.state = state;
    window.ENTITY_OBSERVE_KNOWLEDGE = ENTITY_OBSERVE_KNOWLEDGE;
    window.initState = initState;
    window.pick = pick;
    window.chance = chance;
    window.clamp = clamp;
    window.getCurrentLevel = getCurrentLevel;
    window.getLevelName = getLevelName;
    window.RECORDS_KEY = RECORDS_KEY;
    window.loadRecords = loadRecords;
    window.saveRecords = saveRecords;
    window.saveDeathRecord = saveDeathRecord;
    window.getLastRecord = getLastRecord;
    window.getAggregate = getAggregate;
}
