// render.js — DOM rendering, narrative display, inventory + knowledge UI.
// Depends on data.js + state.js. Loaded before mechanics.js so mechanics
// can call into these UI functions (narrative / updateUI / etc.) freely.

// ---- Narrative ----
// The text panel is the game's primary surface. Every game state change
// pushes through here, so the side effects (room counting, last-words
// capture) live next to the rendering they support.
function narrative(text, cls = "") {
    const el = document.getElementById("narrative");
    el.textContent = text;
    el.className = cls || "";
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
function generateRoomDesc() {
    const sizes = ["small", "cramped", "vast", "narrow", "seemingly infinite"];
    const types = ["room", "hallway", "corridor", "space", "chamber"];
    const details = [
        "The fluorescent lights buzz overhead.", "Yellow wallpaper peels from the walls.",
        "The air is thick and stale.", "Something drips in the distance.",
        "You hear something moving.", "The walls feel wrong. Too close.",
        "Muffled sounds echo from somewhere.", "The floor is wet.",
    ];
    return `You are in a ${pick(sizes)} ${pick(types)}. ${pick(details)}`;
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
    document.getElementById("level-name").textContent = `LEVEL ${lv.num} — ${lv.name}`;
    document.getElementById("room-desc").textContent = lv.desc;

    renderInventory();
    renderKnowledge();
}

function renderKnowledge() {
    const knowledgeDiv = document.getElementById("knowledge-list");
    const known = Object.keys(ENTITY_OBSERVE_KNOWLEDGE);
    const pending = state.observedEntity;
    if (known.length === 0 && !pending) {
        knowledgeDiv.innerHTML = "No observations yet.";
    } else {
        let html = "";
        known.forEach(name => {
            html += `<span class="known-entity">${name}</span> (+${Math.round(ENTITY_OBSERVE_KNOWLEDGE[name] * 100)}%)<br>`;
        });
        if (pending) {
            html += `<span class="pending-entity">${pending}</span> (observing...)<br>`;
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
            slot.innerHTML = `<span class="item-name">${item.name}</span><span class="item-desc">${item.desc}</span>`;
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
        recEl.textContent = `Last run: LEVEL ${last.level} — ${getLevelName(last.level)} · ${last.rooms} rooms · ${last.cause}`;
        if (last.lastWords) {
            wordsEl.textContent = `Last words: "${last.lastWords}"`;
        } else {
            wordsEl.textContent = "";
        }
    } else {
        recEl.textContent = "";
        wordsEl.textContent = "";
    }
    statsEl.textContent = `Lifetime · deaths: ${agg.totalDeaths} · best level: ${agg.bestLevel} · total escaped: ${agg.totalEscaped}`;
}

function forgetRecords() {
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
    document.getElementById("death-record").textContent = "";
    document.getElementById("death-stats").textContent = "Records forgotten.";
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
}
