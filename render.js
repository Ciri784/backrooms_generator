// render.js — DOM rendering, narrative display, inventory + knowledge UI.
// Depends on data.js + state.js. Loaded before mechanics.js so mechanics
// can call into these UI functions (narrative / updateUI / etc.) freely.

// ---- Narrative ----
// The text panel is the game's primary surface. Every game state change
// pushes through here, so the side effects (room counting, last-words
// capture) live next to the rendering they support.
//
// Rendering modes:
//   - normal: full text shown immediately (default for short beats)
//   - slow: typewriter-style, char-by-char at 18-32ms jitter (used
//           for room entries, entity warnings, death narrative —
//           makes the architecture feel slow and patient)
//   - glitch: like slow, but each character has a 12% chance of being
//           replaced by a corrupted glyph (▒ ▓ █ ░ ╳ ▘ ▝ ▗ ▖) for
//           the duration of that beat
// Choice between modes is deterministic per call (caller picks via
// the `mode` arg) so transition sequences can stay unified.
const GLITCH_GLYPHS = ["▒","▓","█","░","╳","▘","▝","▗","▖","▚","▞","■","◘","◙","◦","●","◊","○"];
function _narrativeTypewriter(el, text, perCharMs, glitch) {
    el.textContent = "";
    let i = 0;
    const tick = () => {
        if (i >= text.length) return;
        const ch = text[i];
        if (glitch && Math.random() < 0.12) {
            el.textContent = el.textContent + GLITCH_GLYPHS[Math.floor(Math.random() * GLITCH_GLYPHS.length)];
            // The corrupted glyph lingers for 1-2 extra ticks before
            // being overwritten by the real char — gives it a flicker
            // feel without using a separate "settle" pass.
        } else {
            el.textContent = el.textContent + ch;
        }
        i++;
        const jitter = perCharMs + (Math.random() * 14 - 7);
        setTimeout(tick, Math.max(8, jitter));
    };
    setTimeout(tick, perCharMs);
}

function narrative(text, cls = "", mode) {
    const el = document.getElementById("narrative");
    el.className = cls || "";
    // Pick rendering mode: explicit > entity/boss default slow >
    // transition slow > default fast.
    if (!mode) {
        if (cls === "entity" || cls === "boss" || cls === "death") mode = "slow";
        else if (state.inTransition) mode = "slow";
        else if (cls === "item" || cls === "room-still" || cls === "event") mode = "slow";
        else mode = "instant";
    }
    // Low stability: inject glitch into slow beats.
    const allowGlitch = (state.stability <= 40) ||
                        (state.stability <= 60 && Math.random() < 0.4) ||
                        (cls === "death");
    if (mode === "slow") {
        _narrativeTypewriter(el, text, 22, allowGlitch);
    } else {
        el.textContent = text;
    }
    // Side effects: every narrative beat in a non-transition state
    // counts as the player being present in this room on this level.
    // Skipped during transition so the level-down sequence doesn't
    // double-count the arrival room.
    if (!state.inTransition && state.level != null) {
        state.roomsPerLevel[state.level] = (state.roomsPerLevel[state.level] || 0) + 1;
        if (!state.visitedRoomSignatures) state.visitedRoomSignatures = [];
        const sig = state.level + ":" + state.roomsPerLevel[state.level];
        state.visitedRoomSignatures.push(sig);
        if (state.visitedRoomSignatures.length > 50) state.visitedRoomSignatures.shift();
    }
    // NARRATOR FAULT: at high stability the narrative occasionally
    // contradicts itself. Only outside transitions / encounters so
    // the contradiction doesn't bleed into scripted beats.
    if (text && !state.inTransition && !state.inEncounter &&
        !state.inBossEncounter && state.stability > 70 && Math.random() < 0.05) {
        const faultKeys = [
            "fault.0", "fault.1", "fault.2", "fault.3", "fault.4",
            "fault.5", "fault.6", "fault.7", "fault.8", "fault.9",
        ];
        el.textContent = el.textContent + t(pick(faultKeys));
    }
    // Keep the last 280 chars of the most recent narrative so we
    // can show it as "last words" on the death screen.
    if (text) state.lastNarrative = String(text).slice(-280);
}

// ---- Slow Hours ----
// 5-8 line ambient scenes that play out line by line at 800ms cadence,
// same rhythm as descendToLevel. Triggered on room entry with 25%
// chance. While a slow room is unfolding, no entity or environmental
// event can fire. The point is to make the player feel the building
// breathe between crises.
function pickSlowRoom() { return pick(SLOW_ROOMS); }

function enterSlowRoom() {
    const lines = pickSlowRoom();
    const el = document.getElementById("narrative");
    el.className = "room-still";
    el.textContent = lines[0];
    state.inTransition = true;

    let i = 1;
    const tick = () => {
        if (i >= lines.length) {
            state.inTransition = false;
            el.className = "";
            updateUI();
            return;
        }
        el.textContent = el.textContent + "\n\n" + lines[i];
        i++;
        setTimeout(tick, 800);
    };
    setTimeout(tick, 800);
}

// ---- Room description (random) ----
// Echo Room: 30% chance a re-visited room renders with a subtle
// difference (a piece of furniture moved, a new mark on the wall).
// The point isn't to scare — it's to make the player wonder if the
// architecture is wrong, or if they are.
function generateRoomDesc() {
    const sizes = ["small", "cramped", "vast", "narrow", "seemingly infinite"];
    const types = ["room", "hallway", "corridor", "space", "chamber"];
    const details = [
        "slow.pool.0.0", "slow.pool.0.1", "slow.pool.0.2", "slow.pool.0.3",
        "slow.pool.1.0", "slow.pool.1.1", "slow.pool.1.2", "slow.pool.1.3",
    ];
    const echoKeys = [
        "slow.pool.2.0", "slow.pool.2.1", "slow.pool.2.2", "slow.pool.2.3",
        "slow.pool.3.0", "slow.pool.3.1",
    ];
    const sig = state.level + ":" + state.roomsPerLevel[state.level];
    const seenCount = state.visitedRoomSignatures
        ? state.visitedRoomSignatures.filter(s => s === sig).length
        : 0;
    if (seenCount >= 2 && Math.random() < 0.30) {
        return `You are in a ${pick(sizes)} ${pick(types)}. ${t(pick(details))}`;
    }
    return `You are in a ${pick(sizes)} ${pick(types)}. ${t(pick(details))}`;
}

// ---- UI refresh ----
function updateUI() {
    const stab = document.getElementById("stability");
    stab.textContent = state.stability + "%";
    stab.className = "stat-value" + (state.stability <= 25 ? " danger" : state.stability <= 50 ? " warning" : "");
    document.getElementById("level").textContent = state.level;
    document.getElementById("rooms").textContent = state.rooms;
    document.getElementById("escaped").textContent = state.escaped;

    const lv = getCurrentLevel();
    document.getElementById("level-name").textContent = `${t("descend.toLevel", lv.num, t("level." + lv.num + ".name"))}`;
    document.getElementById("room-desc").textContent = t("level." + lv.num + ".desc");

    // Apply static UI labels to current language.
    applyStaticLabels();

    renderInventory();
    renderKnowledge();
}

// Re-applies labels in #game.html that don't get refreshed on every
// updateUI() call. Cheap to call often.
function applyStaticLabels() {
    const map = {
        "stab-label": "ui.stability",
        "level-label": "ui.level",
        "rooms-label": "ui.rooms",
        "escaped-label": "ui.escaped",
        "inventory-h": "ui.inventory",
        "knowledge-h": "ui.knowledge",
        "knowledge-header": "ui.knowledge",
        "death-title": "death.title",
        "restart-btn": "btn.tryAgain",
        "forget-btn": "btn.forgetEverything",
        "game-title": "ui.title",
        "game-subtitle": "ui.subtitle",
        "back-link-text": "ui.backToMain",
    };
    for (const id in map) {
        const el = document.getElementById(id);
        if (el) el.textContent = t(map[id]);
    }
    const note = document.getElementById("inventory-note");
    if (note) note.textContent = t("ui.slotsHint", MAX_INVENTORY);
    // Re-render action buttons to current language.
    if (typeof rebuildActionButtons === "function") rebuildActionButtons();
}

function renderKnowledge() {
    const knowledgeDiv = document.getElementById("knowledge-list");
    const known = Object.keys(ENTITY_OBSERVE_KNOWLEDGE);
    const pending = state.observedEntity;
    if (known.length === 0 && !pending) {
        knowledgeDiv.innerHTML = t("ui.noKnowledge");
    } else {
        let html = "";
        known.forEach(name => {
            html += `<span class="known-entity">${name}</span> (+${Math.round(ENTITY_OBSERVE_KNOWLEDGE[name] * 100)}%)<br>`;
        });
        if (pending) {
            html += `<span class="pending-entity">${pending}</span>${t("ui.observingTag")}<br>`;
        }
        knowledgeDiv.innerHTML = html;
    }
}

function renderInventory() {
    const slots = document.querySelectorAll('.inv-slot');
    slots.forEach((slot, i) => {
        const item = state.inventory[i];
        if (item) {
            slot.className = `inv-slot ${item.cssClass || ''}`;
            slot.innerHTML = `<span class="item-name">${t("item." + item.id + ".name")}</span><span class="item-desc">${t("item." + item.id + ".desc")}</span>`;
            slot.onclick = () => useItem(i);
        } else {
            slot.className = 'inv-slot empty';
            slot.innerHTML = '';
            slot.onclick = null;
        }
    });
}

function renderDeathStats() {
    const last = getLastRecord();
    const agg = getAggregate();
    const recEl = document.getElementById("death-record");
    const statsEl = document.getElementById("death-stats");
    const wordsEl = document.getElementById("death-lastwords");
    if (last) {
        const lvName = (typeof getLevelName === "function") ? t("level." + last.level + ".name") : "";
        recEl.textContent = t("death.lastRun", last.level, lvName, last.rooms, last.cause);
        if (last.lastWords) {
            wordsEl.textContent = t("death.lastWords", last.lastWords);
        } else {
            wordsEl.textContent = "";
        }
    } else {
        recEl.textContent = "";
        wordsEl.textContent = "";
    }
    const key = agg.totalDeaths === 1 ? "death.lifetimeSingular" : "death.lifetimePlural";
    statsEl.textContent = t(key, agg.totalDeaths, agg.bestLevel, agg.totalEscaped);
}

function forgetRecords() {
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
    document.getElementById("death-record").textContent = "";
    document.getElementById("death-stats").textContent = t("death.recordsForgotten");
}

// ---- Action button helpers ----
function setActionButtonsEnabled(enabled) {
    document.querySelectorAll(".action-btn").forEach(b => { b.disabled = !enabled; });
}

function disableInventory() {
    document.querySelectorAll('.inv-slot').forEach(s => {
        s.classList.add('locked');
        s.onclick = null;
    });
}

function enableInventory() {
    // re-render restores onclick handlers via renderInventory
    renderInventory();
}

// Rebuilt on language change to swap button labels in-place without
// losing the current state (encounter / boss / door). Keeps the
// onclick handlers from the source buttons.
function rebuildActionButtons() {
    const map = {
        moveOn: t("btn.move"),
        search: t("btn.search"),
        hide: t("btn.hide"),
        holdStill: t("btn.holdStill"),
        openDoor: t("btn.open"),
        ignoreDoor: t("btn.ignore"),
    };
    document.querySelectorAll(".action-btn").forEach(btn => {
        const onclick = btn.getAttribute("onclick") || "";
        const m = onclick.match(/^(\w+)\(/);
        if (m && map[m[1]]) btn.textContent = map[m[1]];
    });
}

// Called by setLang() in i18n.js to refresh visible text in-place
// after the user switches language. State is preserved.
function applyLanguage() {
    rebuildActionButtons();
    if (typeof renderInventory === "function") renderInventory();
    if (typeof renderKnowledge === "function") renderKnowledge();
    if (typeof updateUI === "function") updateUI();
    // Refresh death screen text if it's visible.
    if (document.getElementById("game-over").classList.contains("show")) {
        if (typeof renderDeathStats === "function") renderDeathStats();
    }
    // Refresh language toggle button text.
    const langBtn = document.getElementById("lang-toggle");
    if (langBtn) langBtn.textContent = langLabel(getLang() === "en" ? "zhTW" : "en");
}

if (typeof window !== "undefined") {
    window.narrative = narrative;
    window.pickSlowRoom = pickSlowRoom;
    window.enterSlowRoom = enterSlowRoom;
    window.generateRoomDesc = generateRoomDesc;
    window.updateUI = updateUI;
    window.renderKnowledge = renderKnowledge;
    window.renderInventory = renderInventory;
    window.renderDeathStats = renderDeathStats;
    window.forgetRecords = forgetRecords;
    window.setActionButtonsEnabled = setActionButtonsEnabled;
    window.disableInventory = disableInventory;
    window.enableInventory = enableInventory;
    window.rebuildActionButtons = rebuildActionButtons;
    window.applyLanguage = applyLanguage;
}
