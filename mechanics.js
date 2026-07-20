// mechanics.js — game actions, encounters, and state transitions.
// Depends on data.js + state.js + render.js. Loaded last by game.html.

function addItem() {
    if (state.inventory.length >= MAX_INVENTORY) return false;
    const item = pick(ITEMS);
    state.inventory.push(item);
    return item;
}

function useItem(slotIndex) {
    if (state.inEncounter || state.inTransition) return;
    const item = state.inventory[slotIndex];
    if (!item) return;
    state.inventory.splice(slotIndex, 1);
    switch (item.effect) {
        case "stability_restore":
            state.stability = clamp(state.stability + item.value, 0, 100);
            nt("item.useBandage", [t("item." + item.id + ".name"), t("item." + item.id + ".bandageDesc")], "item");
            break;
        case "damage_reduction":
            state.damageReduction = item.value;
            nt("item.usePainkillers", [t("item." + item.id + ".name"), item.value], "item");
            break;
        case "escape_bonus":
            state.hasFlashlight = true;
            nt("item.useFlashlight", [t("item." + item.id + ".name")], "item");
            break;
        case "detect":
            nt("item.useGaunt", [t("item." + item.id + ".name")], "item");
            break;
    }
    updateUI();
}

function checkGameOver() {
    if (state.stability <= 0) {
        const msgs = [
            "death.cause0",
            "death.cause1",
            "death.cause2",
            "death.cause3",
        ];
        document.getElementById("death-msg").textContent = t(pick(msgs));
        const lv = getCurrentLevel();
        const lvName = lv ? t("level." + lv.num + ".name") : t("death.unnamed");
        const cause = state.currentBoss
            ? t("death.killedByBoss", state.currentBoss, state.level, lvName)
            : state.currentEnvEvent
            ? t("death.consumedByEnv", state.currentEnvEvent.id.replace(/_/g, " "), state.level, lvName)
            : state.currentEntity
            ? t("death.takenByEntity", state.currentEntity, state.level, lvName)
            : t("death.collapsed", state.level, lvName);
        saveDeathRecord({
            level: state.level,
            rooms: state.rooms,
            cause: cause,
            escaped: state.escaped,
            lastWords: state.lastNarrative || "",
            roomsPerLevel: (state.roomsPerLevel || []).slice(),
        });
        renderDeathStats();
        document.getElementById("game-over").classList.add("show");
        return true;
    }
    return false;
}

function moveOn() {
    if (state.inEncounter) return;
    state.rooms++;
    if (chance(0.12) && state.level < 7) {
        state.level++;
        descendToLevel(state.level);
    } else if (chance(0.25) && !state.inTransition) {
        enterSlowRoom();
        return;
    } else {
        nt("move.forward", [getCurrentLevel().name, generateRoomDesc()]);
    }
    updateUI();

    // Death Echo: if this room matches the room we died in last run,
    // surface a fragment of memory in the narrative.
    const echo = checkDeathEcho();
    if (echo) {
        const echoKeys = ["echo.0", "echo.1", "echo.2"];
        const el = document.getElementById("narrative");
        el.textContent = el.textContent + t(pick(echoKeys));
    }
    if (chance(0.15 + state.level * 0.05)) {
        setTimeout(spawnEntity, 400);
    }
    if (chance(0.10 + state.level * 0.02)) {
        setTimeout(spawnEnvironmentEvent, 500);
    }
    // Doors: 20% chance a door appears. OPEN it: +10 stability,
    // room signature gets scrambled (you end up somewhere new),
    // but you trigger an entity encounter on the other side.
    // IGNORE it: the door stays in your memory and the next entity
    // you meet in this level will reference the door you walked past.
    if (chance(0.20) && !state.inEncounter && !state.inTransition) {
        spawnDoorChoice();
    }
}

function descendToLevel(newLevel) {
    const lv = getCurrentLevel();
    const direction = newLevel > 4 ? "up" : "down";
    const lines = [
        `The floor shifts under your feet.`,
        `You find a passage leading ${direction}.`,
        `The air changes. The hum drops in pitch.`,
        `You step through.`,
        `LEVEL ${newLevel} — ${lv.name}`,
        lv.desc,
    ];
    const el = document.getElementById("narrative");
    el.className = "";
    el.textContent = lines[0];
    state.inTransition = true;
    setActionButtonsEnabled(false);
    let i = 1;
    const tick = () => {
        if (i >= lines.length) {
            state.inTransition = false;
            updateUI();
            if (lv.boss && !state.bossesDefeated[newLevel] && newLevel < LEVELS.length) {
                setTimeout(spawnBossEncounter, 600);
            } else {
                setActionButtonsEnabled(true);
            }
            return;
        }
        el.textContent = el.textContent + "\n\n" + lines[i];
        i++;
        setTimeout(tick, 700);
    };
    setTimeout(tick, 700);
}

function search() {
    if (state.inEncounter || state.inTransition) return;
    state.rooms++;
    const found = addItem();
    if (found) {
        nt("search.found", [t("item." + found.id + ".name"), t("item." + found.id + ".desc")], "item");
    } else if (state.inventory.length >= MAX_INVENTORY) {
        nt("search.full", [], "");
    } else {
        nt("search.nothing", [], "");
    }
    updateUI();
    if (chance(0.2 + state.level * 0.03)) {
        setTimeout(spawnEntity, 600);
    }
}

function hide() {
    if (state.inTransition) return;
    if (state.inEncounter) {
        entityEncounter("HIDE");
        return;
    }
    state.rooms++;
    updateUI();
    if (chance(0.5)) {
        nt("hide.safe", [], "");
    } else {
        nt("hide.danger", [], "");
        if (chance(0.5)) {
            setTimeout(spawnEntity, 500);
        }
    }
}

function holdStill() {
    if (state.inEncounter) {
        entityEncounter("HOLD STILL");
        return;
    }
    state.rooms++;
    updateUI();
    if (chance(0.5)) {
        nt("still.safe", [], "");
    } else {
        nt("still.danger", [], "");
        if (chance(0.5)) {
            setTimeout(spawnEntity, 500);
        }
    }
}

function spawnEntity() {
    if (state.inEncounter || state.inTransition) return;
    state.inEncounter = true;
    const lv = getCurrentLevel();
    const entityName = pick(lv.entities);
    const entity = ENTITY_TEMPLATES[entityName];
    state.currentEntity = entityName;
    if (!state.entityEncounterCount) state.entityEncounterCount = {};
    state.entityEncounterCount[entityName] = (state.entityEncounterCount[entityName] || 0) + 1;
    const repeatCount = state.entityEncounterCount[entityName];
    let desc = entity.desc;
    if (repeatCount === 2) {
        desc = entity.desc + "\n\nIts eyes know you better now.";
    } else if (repeatCount >= 3) {
        desc = entity.desc + "\n\nIt remembers you. It has been waiting.";
    }
    if (state.doorsIgnoredThisLevel && state.doorsIgnoredThisLevel > 0) {
        const doorCallbackKeys = ["door.callback0", "door.callback1", "door.callback2"];
        desc += "\n\n" + t(pick(doorCallbackKeys));
    }
    nt("encounter.warning", [entityName.toUpperCase(), desc, entity.action], "entity");
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="entityEncounter('RUN')">RUN</button>
        <button class="action-btn" onclick="entityEncounter('HIDE')">HIDE</button>
        <button class="action-btn" onclick="entityEncounter('HOLD STILL')">HOLD STILL</button>
        <button class="action-btn" onclick="entityEncounter('${entity.action}')">${entity.action}</button>
    `;
    const actions = document.querySelectorAll('.action-btn');
    const btnTexts = Array.from(actions).map(b => b.textContent);
    const duplicates = btnTexts.filter(t => t === entity.action).length;
    if (duplicates > 1) {
        actions[3].textContent = 'OBSERVE';
        actions[3].onclick = () => entityEncounter('OBSERVE');
    }
}

function spawnEntityForEncounter(entityName) {
    const entity = ENTITY_TEMPLATES[entityName];
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="entityEncounter('RUN')">RUN</button>
        <button class="action-btn" onclick="entityEncounter('HIDE')">HIDE</button>
        <button class="action-btn" onclick="entityEncounter('HOLD STILL')">HOLD STILL</button>
        <button class="action-btn" onclick="entityEncounter('${entity.action}')">${entity.action}</button>
    `;
    const actions = document.querySelectorAll('.action-btn');
    const btnTexts = Array.from(actions).map(b => b.textContent);
    const duplicates = btnTexts.filter(t => t === entity.action).length;
    if (duplicates > 1) {
        actions[3].textContent = 'OBSERVE';
        actions[3].onclick = () => entityEncounter('OBSERVE');
    }
}

function spawnEnvironmentEvent() {
    if (state.inEncounter || state.inTransition || state.inBossEncounter) return;
    const ev = pick(ENV_EVENTS);
    state.currentEnvEvent = ev;
    state.inEncounter = true;
    const label = ev.id.replace(/_/g, " ");
    nt("env.event", [label.toUpperCase(), ev.intro], "event");
    const buttons = ev.options.map(opt =>
        `<button class="action-btn" onclick="environmentEvent('${opt}')">${opt}</button>`
    ).join("");
    document.getElementById("actions").innerHTML = buttons;
}

function environmentEvent(action) {
    if (!state.inEncounter) return;
    const ev = state.currentEnvEvent;
    if (!ev) return;
    if (action === ev.safe) {
        state.escaped++;
        if (ev.reward && state.inventory.length < MAX_INVENTORY) {
            const item = ITEMS.find(i => i.id === ev.reward);
            if (item) {
                state.inventory.push(item);
                nt("env.successItem", [action.toLowerCase(), ev.success, t("item." + item.id + ".name"), t("item." + item.id + ".desc")], "item");
            } else {
                nt("env.success", [action.toLowerCase(), ev.success], "item");
            }
        } else {
            nt("env.success", [action.toLowerCase(), ev.success], "item");
        }
    } else {
        nt("env.fail", [action.toLowerCase(), ev.wrong, damage], "event");
        state.stability = clamp(state.stability - damage, 0, 100);
    }
    state.currentEnvEvent = null;
    state.inEncounter = false;
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">MOVE</button>
        <button class="action-btn" onclick="search()">SEARCH</button>
        <button class="action-btn" onclick="hide()">HIDE</button>
        <button class="action-btn" onclick="holdStill()">HOLD STILL</button>
    `;
    updateUI();
    checkGameOver();
}

function spawnBossEncounter() {
    if (state.inEncounter || state.inBossEncounter || state.inTransition) return;
    const lv = getCurrentLevel();
    const bossName = lv.boss;
    const boss = BOSS_TEMPLATES[bossName];
    if (!boss) {
        setActionButtonsEnabled(true);
        return;
    }
    state.inBossEncounter = true;
    state.currentBoss = bossName;
    nt("boss.warning", [bossName.toUpperCase(), boss.intro, boss.desc, boss.action], "entity");
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="bossEncounter('RUN')">RUN</button>
        <button class="action-btn" onclick="bossEncounter('HIDE')">HIDE</button>
        <button class="action-btn" onclick="bossEncounter('HOLD STILL')">HOLD STILL</button>
        <button class="action-btn" onclick="bossEncounter('${boss.action}')">${boss.action}</button>
    `;
    const actions = document.querySelectorAll('.action-btn');
    const btnTexts = Array.from(actions).map(b => b.textContent);
    const duplicates = btnTexts.filter(t => t === boss.action).length;
    if (duplicates > 1) {
        actions[3].textContent = 'OBSERVE';
        actions[3].onclick = () => bossEncounter('OBSERVE');
    }
    disableInventory();
}

function bossEncounter(action) {
    if (!state.inBossEncounter) return;
    const bossName = state.currentBoss;
    const boss = BOSS_TEMPLATES[bossName];
    let escapeChance = boss.escapeChance;
    if (action === 'OBSERVE') {
        nt("boss.observe", [bossName, boss.action], "");
        state.observedBoss = bossName;
        setTimeout(() => {
            if (state.stability <= 0) return;
            nt("boss.observeStill", [bossName, boss.action], "entity");
        }, 1500);
        return;
    }
    if (action === boss.action) escapeChance += 0.25;
    if (state.observedBoss === bossName) escapeChance += 0.10;
    if (chance(escapeChance)) {
        state.escaped++;
        state.bossesDefeated[state.level] = true;
        nt("boss.escape", [action, bossName], "");
        state.inBossEncounter = false;
        state.currentBoss = null;
        state.observedBoss = null;
        setActionButtonsEnabled(true);
        enableInventory();
        document.getElementById("actions").innerHTML = `
            <button class="action-btn" onclick="moveOn()">${t("btn.move")}</button>
            <button class="action-btn" onclick="search()">${t("btn.search")}</button>
            <button class="action-btn" onclick="hide()">${t("btn.hide")}</button>
            <button class="action-btn" onclick="holdStill()">${t("btn.holdStill")}</button>
        `;
        updateUI();
    } else {
        nt("boss.fail", [action, bossName, damage], "entity");
        state.stability = clamp(state.stability - damage, 0, 100);
        state.observedBoss = null;
        updateUI();
        if (checkGameOver()) {
            state.inBossEncounter = false;
            state.currentBoss = null;
        }
    }
}

function entityEncounter(action) {
    if (!state.inEncounter) return;
    const entityName = state.currentEntity;
    const entity = ENTITY_TEMPLATES[entityName];
    let escapeChance = entity.escapeChance;
    // Entity Memory: same entity hit twice+ this run learns your patterns.
    // 2nd encounter -0.05, 3rd+ -0.10. Capped so it stays escapable.
    const repeat = (state.entityEncounterCount && state.entityEncounterCount[entityName]) || 0;
    if (repeat >= 3) escapeChance -= 0.10;
    else if (repeat === 2) escapeChance -= 0.05;
    if (action === 'OBSERVE') {
        nt("entity.observe", [entityName], "");
        state.observedEntity = entityName;
        state.inEncounter = false;
        setTimeout(() => {
            if (state.inTransition || state.stability <= 0) return;
            if (state.stability > 0) {
                nt("entity.observeStill", [entityName], "entity");
                state.inEncounter = true;
                spawnEntityForEncounter(entityName);
            }
        }, 1500);
        updateUI();
        return;
    } else {
        if (action === SAFE_ACTIONS[entityName]) escapeChance += 0.25;
    }
    if (ENTITY_OBSERVE_KNOWLEDGE[entityName]) {
        escapeChance += ENTITY_OBSERVE_KNOWLEDGE[entityName];
    }
    if (state.hasFlashlight && entityName === "Wretches") escapeChance += 0.3;
    const hasAlmond = state.inventory.some(i => i.id === "almond");
    if (hasAlmond && entityName === "The Thing That Tastes Color") escapeChance += 0.2;
    if (chance(escapeChance)) {
        state.escaped++;
        if (state.observedEntity === entityName) {
            ENTITY_OBSERVE_KNOWLEDGE[entityName] = 0.15;
        }
        nt("entity.escape", [action, entityName], "");
        state.hasFlashlight = false;
        state.damageReduction = 0;
        state.observedEntity = null;
    } else {
        let damage = entity.damage;
        if (state.damageReduction > 0) damage = Math.max(5, damage - state.damageReduction);
        if (state.observedEntity === entityName) {
            damage = Math.min(50, damage + 10);
            nt("entity.failObserved", [action, entityName, damage], "entity");
        } else {
            nt("entity.fail", [action, entityName, damage], "entity");
        }
        state.stability = clamp(state.stability - damage, 0, 100);
        state.hasFlashlight = false;
        state.damageReduction = 0;
        state.observedEntity = null;
    }
    state.currentEntity = null;
    state.inEncounter = false;
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">${t("btn.move")}</button>
        <button class="action-btn" onclick="search()">${t("btn.search")}</button>
        <button class="action-btn" onclick="hide()">${t("btn.hide")}</button>
        <button class="action-btn" onclick="holdStill()">${t("btn.holdStill")}</button>
    `;
    updateUI();
    checkGameOver();
}

// ---- Doors ----
// 20% chance per moveOn(). A door appears. OPEN it: +10 stability,
// roomsPerLevel counter for this level gets scrambled so Echo Room
// can't fire here for the rest of the run (you've been somewhere
// new), and an entity encounter triggers on the other side. IGNORE
// it: the door persists in your memory, and the next entity you
// meet in this level gets a "the door is still behind you" line.
function spawnDoorChoice() {
    if (state.inEncounter || state.inTransition || state.inBossEncounter) return;
    state.inEncounter = true;
    state.pendingDoor = true;
    const doorDescKeys = ["door.appear0", "door.appear1", "door.appear2", "door.appear3", "door.appear4"];
    narrative(t(pick(doorDescKeys)), "event");
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="openDoor()">${t("btn.open")}</button>
        <button class="action-btn" onclick="ignoreDoor()">${t("btn.ignore")}</button>
    `;
}

function openDoor() {
    if (!state.pendingDoor) return;
    state.pendingDoor = false;
    state.stability = clamp(state.stability + 10, 0, 100);
    if (state.visitedRoomSignatures) {
        state.visitedRoomSignatures = state.visitedRoomSignatures.filter(
            s => !s.startsWith(state.level + ":")
        );
    }
    nt("door.open", [], "item");
    state.inEncounter = false;
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">${t("btn.move")}</button>
        <button class="action-btn" onclick="search()">${t("btn.search")}</button>
        <button class="action-btn" onclick="hide()">${t("btn.hide")}</button>
        <button class="action-btn" onclick="holdStill()">${t("btn.holdStill")}</button>
    `;
    updateUI();
    if (chance(0.4)) {
        setTimeout(spawnEntity, 600);
    }
}

function ignoreDoor() {
    if (!state.pendingDoor) return;
    state.pendingDoor = false;
    state.doorsIgnoredThisLevel = (state.doorsIgnoredThisLevel || 0) + 1;
    if (state.visitedRoomSignatures) {
        state.visitedRoomSignatures = state.visitedRoomSignatures.filter(
            s => !s.startsWith(state.level + ":")
        );
    }
    nt("door.ignore", [], "event");
    state.inEncounter = false;
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">${t("btn.move")}</button>
        <button class="action-btn" onclick="search()">${t("btn.search")}</button>
        <button class="action-btn" onclick="hide()">${t("btn.hide")}</button>
        <button class="action-btn" onclick="holdStill()">${t("btn.holdStill")}</button>
    `;
    updateUI();
}

function startGame() {
    initState();
    Object.keys(ENTITY_OBSERVE_KNOWLEDGE).forEach(key => delete ENTITY_OBSERVE_KNOWLEDGE[key]);
    document.getElementById("game-over").classList.remove("show");
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">MOVE</button>
        <button class="action-btn" onclick="search()">SEARCH</button>
        <button class="action-btn" onclick="hide()">HIDE</button>
        <button class="action-btn" onclick="holdStill()">HOLD STILL</button>
    `;
    updateUI();
    const last = getLastRecord();
    const agg = getAggregate();
    let opening = t("intro.wake") + "\n\nExplore carefully. Find items. Avoid entities. Survive.";
    let prefix = "";
    if (last) {
        const lvName = getLevelName ? t("level." + last.level + ".name") : ("LEVEL " + last.level);
        prefix += t("death.lastPrefix", last.level, lvName, last.rooms, last.cause);
        if (last.lastWords) prefix += t("death.lastWordsPrefix", last.lastWords);
        const deathWord = agg.totalDeaths === 1 ? "death" : "deaths";
        prefix += t("death.lifetimePrefix", agg.totalDeaths, deathWord, agg.bestLevel, agg.totalEscaped);
    } else if (agg.totalDeaths > 0) {
        const deathWord = agg.totalDeaths === 1 ? "death" : "deaths";
        prefix += t("death.lifetimePrefix", agg.totalDeaths, deathWord, agg.bestLevel, agg.totalEscaped);
    }
    if (last && last.roomsPerLevel && last.roomsPerLevel[0] >= 5) {
        const startLv = last.roomsPerLevel[0];
        prefix += t("death.memoryFragment", t("level.0.name"), startLv) + "\n\n";
    }
    narrative(prefix + opening);
}

startGame();

if (typeof window !== "undefined") {
    window.addItem = addItem;
    window.useItem = useItem;
    window.checkGameOver = checkGameOver;
    window.moveOn = moveOn;
    window.search = search;
    window.hide = hide;
    window.holdStill = holdStill;
    window.descendToLevel = descendToLevel;
    window.spawnEntity = spawnEntity;
    window.spawnEntityForEncounter = spawnEntityForEncounter;
    window.entityEncounter = entityEncounter;
    window.spawnEnvironmentEvent = spawnEnvironmentEvent;
    window.environmentEvent = environmentEvent;
    window.spawnBossEncounter = spawnBossEncounter;
    window.bossEncounter = bossEncounter;
    window.startGame = startGame;
    window.spawnDoorChoice = spawnDoorChoice;
    window.openDoor = openDoor;
    window.ignoreDoor = ignoreDoor;
}
