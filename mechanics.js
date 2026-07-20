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
            narrative(`You use ${item.name}.\n\n${item.desc}\n\nStability restored.`, "item");
            break;
        case "damage_reduction":
            state.damageReduction = item.value;
            narrative(`You use ${item.name}.\n\nStability loss reduced by ${item.value}% for next encounter.`, "item");
            break;
        case "escape_bonus":
            state.hasFlashlight = true;
            narrative(`You equip ${item.name}.\n\nWretches will fear you. Escape chance +25%.`, "item");
            break;
        case "detect":
            narrative(`You turn on the ${item.name}.\n\nThe needle twitches. Something is nearby.`, "item");
            break;
    }
    updateUI();
}

function checkGameOver() {
    if (state.stability <= 0) {
        const msgs = [
            "The Backrooms claimed another victim.",
            "You wandered too far. There is no way back.",
            "Something caught up to you.",
            "You should have run when you had the chance.",
        ];
        document.getElementById("death-msg").textContent = pick(msgs);
        const lv = getCurrentLevel();
        const where = lv ? `in LEVEL ${lv.num} — ${lv.name}` : "somewhere unnamed";
        const cause = state.currentBoss
            ? `Killed by ${state.currentBoss} ${where}`
            : state.currentEnvEvent
            ? `Consumed by ${state.currentEnvEvent.id.replace(/_/g, " ")} ${where}`
            : state.currentEntity
            ? `Taken by ${state.currentEntity} ${where}`
            : `The architecture collapsed around you ${where}`;
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
        narrative(`You move forward through the ${getCurrentLevel().name}.\n\n${generateRoomDesc()}`);
    }
    updateUI();

    // Death Echo: if this room matches the room we died in last run,
    // surface a fragment of memory in the narrative.
    const echo = checkDeathEcho();
    if (echo) {
        const echoLines = [
            `\n\nYou notice a dark stain on the tiles.`,
            `\n\nThe air here feels familiar. Too familiar.`,
            `\n\nSomething happened here before. You can't remember what.`,
        ];
        const el = document.getElementById("narrative");
        el.textContent = el.textContent + pick(echoLines);
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
            if (lv.boss && !state.bossesDefeated[newLevel] && newLevel < LEVELS.length - 1) {
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
        narrative(`You search the area.\n\nYou find: ${found.name}\n${found.desc}`, "item");
    } else if (state.inventory.length >= MAX_INVENTORY) {
        narrative(`You search but your inventory is full.\n\nMaybe you should use some items first.`, "");
    } else {
        narrative(`You search but find nothing useful.\n\nJust dust and the smell of wet carpet.`, "");
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
        narrative(`You find a hiding spot and stay still.\n\nThe sounds fade. You're alone. For now.`, "");
    } else {
        narrative(`You hide but hear something getting closer.\n\nIt knows you're here.`, "");
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
        narrative(`You stay completely still.\n\nThe sounds fade. You're alone. For now.`, "");
    } else {
        narrative(`You freeze. You hear something getting closer.\n\nIt knows you're here.`, "");
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
        const doorCallbacks = [
            "A door is still behind you. You can feel it. It wants you to know that.",
            "Behind you, somewhere, a door you ignored creaks on its hinges.",
            "You walked past a door. The thing in front of you knows.",
        ];
        desc += "\n\n" + pick(doorCallbacks);
    }
    narrative(`WARNING: ${entityName.toUpperCase()}\n\n${desc}\n\nRecommended: ${entity.action}`, "entity");
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
    narrative(`⚠ ENVIRONMENT — ${label.toUpperCase()} ⚠\n\n${ev.intro}`, "event");
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
        let msg = `You ${action.toLowerCase()}.\n\n${ev.success}`;
        if (ev.reward && state.inventory.length < MAX_INVENTORY) {
            const item = ITEMS.find(i => i.id === ev.reward);
            if (item) {
                state.inventory.push(item);
                msg += `\n\nYou find: ${item.name} (${item.desc})`;
            }
        }
        narrative(msg, "item");
    } else {
        const damage = ev.damage;
        narrative(`You ${action.toLowerCase()}.\n\n${ev.wrong}\n\n-${damage}% Stability`, "event");
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
    narrative(
        `⚠ BOSS — ${bossName.toUpperCase()} ⚠\n\n${boss.intro}\n\n${boss.desc}\n\nRecommended: ${boss.action}`,
        "entity"
    );
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
        narrative(
            `You study the ${bossName}.\n\nThe recommended action is: ${boss.action}\n\nYou have one chance. Make it count.`,
            ""
        );
        state.observedBoss = bossName;
        setTimeout(() => {
            if (state.stability <= 0) return;
            narrative(
                `The ${bossName} is waiting.\n\nYou remember: ${boss.action}.\n\nWhat will you do?`,
                "entity"
            );
        }, 1500);
        return;
    }
    if (action === boss.action) escapeChance += 0.25;
    if (state.observedBoss === bossName) escapeChance += 0.10;
    if (chance(escapeChance)) {
        state.escaped++;
        state.bossesDefeated[state.level] = true;
        narrative(
            `You ${action}.\n\nThe ${bossName} recoils. It dissolves into the architecture around you.\n\nYou survived. For now.`,
            ""
        );
        state.inBossEncounter = false;
        state.currentBoss = null;
        state.observedBoss = null;
        setActionButtonsEnabled(true);
        enableInventory();
        document.getElementById("actions").innerHTML = `
            <button class="action-btn" onclick="moveOn()">MOVE</button>
            <button class="action-btn" onclick="search()">SEARCH</button>
            <button class="action-btn" onclick="hide()">HIDE</button>
            <button class="action-btn" onclick="holdStill()">HOLD STILL</button>
        `;
        updateUI();
    } else {
        const damage = boss.damage;
        narrative(
            `You ${action}.\n\nThe ${bossName} overwhelms you.\n\n-${damage}% Stability`,
            "entity"
        );
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
        narrative(`You keep your eyes on the ${entityName}.\n\nYou study its movements, its patterns.\n\nThis knowledge may help you survive the next encounter.`, "");
        state.observedEntity = entityName;
        state.inEncounter = false;
        setTimeout(() => {
            if (state.inTransition || state.stability <= 0) return;
            if (state.stability > 0) {
                narrative(`The ${entityName} is still here.\n\nWhat will you do?`, "entity");
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
        narrative(`You ${action}.\n\nIt works. The ${entityName} loses interest and fades into the shadows.\n\nYou escaped.`, "");
        state.hasFlashlight = false;
        state.damageReduction = 0;
        state.observedEntity = null;
    } else {
        let damage = entity.damage;
        if (state.damageReduction > 0) damage = Math.max(5, damage - state.damageReduction);
        if (state.observedEntity === entityName) {
            damage = Math.min(50, damage + 10);
            narrative(`You ${action}.\n\nThe ${entityName} catches you.\n\nYour observation made you hesitate. -\n${damage}% Stability`, "entity");
        } else {
            narrative(`You ${action}.\n\nThe ${entityName} catches you.\n\n-${damage}% Stability`, "entity");
        }
        state.stability = clamp(state.stability - damage, 0, 100);
        state.hasFlashlight = false;
        state.damageReduction = 0;
        state.observedEntity = null;
    }
    state.currentEntity = null;
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
    const doorDesc = pick([
        "A door stands in the middle of the room. It wasn't here before.",
        "The wall is open. A passage leads to somewhere else.",
        "There's a door painted on the wall. It is not painted.",
        "An elevator. The buttons are all the same number.",
        "A heavy door, slightly ajar. The light beyond is wrong.",
    ]);
    narrative(doorDesc, "event");
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="openDoor()">OPEN</button>
        <button class="action-btn" onclick="ignoreDoor()">IGNORE</button>
    `;
}

function openDoor() {
    if (!state.pendingDoor) return;
    state.pendingDoor = false;
    state.stability = clamp(state.stability + 10, 0, 100);
    // Scramble the room counter so Echo Room can't fire on the
    // current level for the rest of the run.
    if (state.visitedRoomSignatures) {
        state.visitedRoomSignatures = state.visitedRoomSignatures.filter(
            s => !s.startsWith(state.level + ":")
        );
    }
    narrative(`You open the door. The air on the other side is different. The architecture is different.\n\nStability +10%.`, "item");
    state.inEncounter = false;
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">MOVE</button>
        <button class="action-btn" onclick="search()">SEARCH</button>
        <button class="action-btn" onclick="hide()">HIDE</button>
        <button class="action-btn" onclick="holdStill()">HOLD STILL</button>
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
    narrative(`You walk past the door. It is still there. You can feel it behind you.`, "event");
    state.inEncounter = false;
    document.getElementById("actions").innerHTML = `
        <button class="action-btn" onclick="moveOn()">MOVE</button>
        <button class="action-btn" onclick="search()">SEARCH</button>
        <button class="action-btn" onclick="hide()">HIDE</button>
        <button class="action-btn" onclick="holdStill()">HOLD STILL</button>
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
    let opening = "You wake up somewhere you shouldn't be. Yellow light flickers above. The air smells wrong. You need to find a way out.\n\nExplore carefully. Find items. Avoid entities. Survive.";
    let prefix = "";
    if (last) {
        const death = agg.totalDeaths === 1 ? "death" : "deaths";
        prefix += `(Last run: LEVEL ${last.level} — ${getLevelName(last.level)} · ${last.rooms} rooms · ${last.cause})\n`;
        if (last.lastWords) prefix += `(Last words: "${last.lastWords}")\n`;
        prefix += `(Lifetime: ${agg.totalDeaths} ${death} · best level ${agg.bestLevel} · ${agg.totalEscaped} escaped)\n\n`;
    } else if (agg.totalDeaths > 0) {
        prefix += `(Lifetime: ${agg.totalDeaths} death${agg.totalDeaths === 1 ? "" : "s"} · best level ${agg.bestLevel} · ${agg.totalEscaped} escaped)\n\n`;
    }
    if (last && last.roomsPerLevel && last.roomsPerLevel[0] >= 5) {
        const startLv = last.roomsPerLevel[0];
        prefix += `(You remember LEVEL 0 — ${getLevelName(0)}. ${startLv} rooms. The hum was the same.)\n\n`;
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
