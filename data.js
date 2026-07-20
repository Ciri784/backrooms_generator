// data.js — static content pools for the Backrooms survival game.
// Pure data, no side effects. Loaded by game.html before state.js, render.js, mechanics.js.
//
// Each export is a top-level const so mechanics.js / render.js can reference
// them via destructuring or by reading from the global window object.

const LEVELS = [
    { num: 0, name: "THE LOBBY", desc: "Office maze. Yellow walls. The hum.", entities: ["Wretches", "Faceless"], boss: "The Hum Itself" },
    { num: 1, name: "THE PACKING ROOMS", desc: "Wooden crates everywhere. Some are open.", entities: ["Wretches", "Smiler"], boss: "The Crate Watcher" },
    { num: 2, name: "PIPE HEAVEN", desc: "An endless network of pipes. It hums.", entities: ["Deathmoth", "Cursor"], boss: "The Pipe Choir" },
    { num: 3, name: "THE OFFICES", desc: "Filing cabinets. Papers everywhere.", entities: ["Faceless", "Skinless"], boss: "The Filing Ghost" },
    { num: 4, name: "ABANDONED CONCRETE", desc: "Structural supports that make no sense.", entities: ["Smiler", "Partygoers"], boss: "The Concrete Mouth" },
    { num: 5, name: "HOTELS & ROOMS", desc: "A hotel that goes on forever.", entities: ["Partygoers", "The Thing That Tastes Color"], boss: "Room 5 Occupant" },
    { num: 6, name: "THE WATER ZONE", desc: "Pools of liquid in dark rooms.", entities: ["The Thing That Tastes Color", "Cursor"], boss: "The Drowned Conductor" },
    { num: 7, name: "THE GOLF COURSE", desc: "An endless course. The flag is always the same distance away.", entities: ["Cursor", "Skinless"], boss: "The Final Flag" },
];

// Boss entities — one per level, always triggered on level transition.
// These are the level's "final memory". They demand a specific safe action.
// Harder than regular entities: lower escape chance, higher damage.
const BOSS_TEMPLATES = {
    "The Hum Itself": {
        desc: "The fluorescent hum is louder here. It isn't coming from the lights anymore. It is coming from inside the walls. From inside you.",
        action: "HOLD STILL",
        escapeChance: 0.35,
        damage: 35,
        intro: "The yellow light stops flickering. It stares back.",
    },
    "The Crate Watcher": {
        desc: "A wooden crate in the corner is breathing. Its slats expand and contract in slow, patient rhythm. It has been waiting for you.",
        action: "HIDE",
        escapeChance: 0.30,
        damage: 40,
        intro: "Every open crate in the room turns toward you at once.",
    },
    "The Pipe Choir": {
        desc: "The pipes are singing. A low, harmonic drone that vibrates in your molars. A face is forming in the condensation on the largest pipe.",
        action: "CLOSE EYES",
        escapeChance: 0.30,
        damage: 40,
        intro: "The water stops. The pipes speak.",
    },
    "The Filing Ghost": {
        desc: "A filing cabinet drawer opens by itself. Papers shuffle. A hand — translucent, made of stapled receipts — reaches out and points at you.",
        action: "RUN",
        escapeChance: 0.35,
        damage: 35,
        intro: "Every drawer in the office slides open in sequence.",
    },
    "The Concrete Mouth": {
        desc: "A support beam has split down the middle. Inside: teeth. Concrete teeth. They are chewing slowly on the air itself.",
        action: "HIDE",
        escapeChance: 0.25,
        damage: 45,
        intro: "The walls lean in. They are listening.",
    },
    "Room 5 Occupant": {
        desc: "The door to Room 5 is open. It has never been open before. Inside, a figure in a concierge uniform smiles. Its face is yours.",
        action: "HOLD BREATH",
        escapeChance: 0.25,
        damage: 50,
        intro: "The hallway numbers skip from 3 to 5. Room 4 is gone.",
    },
    "The Drowned Conductor": {
        desc: "A figure in soaked formal wear stands in the deepest pool, arms raised as if leading an orchestra. The water is rising.",
        action: "HOLD BREATH",
        escapeChance: 0.20,
        damage: 55,
        intro: "The water level rises without a source.",
    },
    "The Final Flag": {
        desc: "The flag is right there. It has always been right there. As you approach, the flag unfolds — and it is made of skin. It is waving at you.",
        action: "KEEP QUIET",
        escapeChance: 0.20,
        damage: 60,
        intro: "The grass under your feet starts breathing.",
    },
};

// Expose globally for the inline game.html bootstrap and other scripts.
if (typeof window !== "undefined") {
    window.LEVELS = LEVELS;
    window.BOSS_TEMPLATES = BOSS_TEMPLATES;
}

const MAX_INVENTORY = 4;

// ---- Environmental events ----
// Triggers when the player moves into a new room. Not entities —
// these are the architecture itself becoming hostile. Always offer
// 2-3 actions with one safe choice; failing costs Stability but
// doesn't end the run. Success gives a small reward.
const ENV_EVENTS = [
    {
        id: "walls_closing",
        intro: "The walls are breathing. They are exhaling — and the room is getting smaller.",
        safe: "HOLD STILL",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "The walls brush your shoulders. The room shrinks another inch.",
        success: "You freeze. The walls exhale once more and stop. They remember you, for now.",
        damage: 25,
        reward: null,
    },
    {
        id: "thick_air",
        intro: "The air thickens. Each breath costs you something. Your vision blurs at the edges.",
        safe: "HOLD STILL",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "You gasp for air. Each breath is heavier than the last. Something is feeding.",
        success: "You stop breathing. The air around you settles. It loses interest.",
        damage: 20,
        reward: "almond",
    },
    {
        id: "cracking_floor",
        intro: "The floor is cracking under your feet. Hairline fractures spreading outward.",
        safe: "RUN",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "A piece of floor gives way beneath you. You catch yourself — but the fall cost you.",
        success: "You run. The floor collapses behind you, one step at a time. You are faster than the building.",
        damage: 30,
        reward: null,
    },
    {
        id: "low_hum",
        intro: "The hum drops. A frequency that should not be audible settles in your molars.",
        safe: "CLOSE EYES",
        options: ["HOLD STILL", "HIDE", "CLOSE EYES"],
        wrong: "The hum finds a crack in your attention. It crawls in.",
        success: "You close your eyes. The hum passes around you like a current around a stone.",
        damage: 15,
        reward: "bandage",
    },
    {
        id: "moving_lights",
        intro: "The fluorescent lights above you are moving. Slowly. Toward you.",
        safe: "HIDE",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "A light passes over you. Your skin prickles. Something has seen you.",
        success: "You duck under a desk. The light passes overhead, searching. It moves on.",
        damage: 20,
        reward: "flashlight",
    },
    {
        id: "wrong_door",
        intro: "A door you have not seen before. It is open. Beyond it: a room you recognise. Yours. From before.",
        safe: "HOLD STILL",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "You step through. The room behind you is the same. You have lost a layer of yourself.",
        success: "You do not move. The door slowly, patiently, closes.",
        damage: 35,
        reward: null,
    },
    {
        id: "wet_carpet",
        intro: "The carpet is wet. Not water-wet. The wetness is moving.",
        safe: "RUN",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "It touches your ankle. The wetness climbs. You shake it off, but something stays.",
        success: "You step back. The wetness flows past, looking for something slower.",
        damage: 18,
        reward: "painkiller",
    },
    {
        id: "echoing_voice",
        intro: "Someone is calling your name. From the next room. They sound like you.",
        safe: "HIDE",
        options: ["RUN", "HIDE", "HOLD STILL"],
        wrong: "You answer. The voice answers back. Closer. It knew you would.",
        success: "You do not answer. The voice loses patience. It stops calling.",
        damage: 22,
        reward: "gauss",
    },
];

// Map reward id to actual ITEMS entry
const REWARD_ITEM_IDS = {
    "almond": "almond",
    "bandage": "bandage",
    "flashlight": "flashlight",
    "painkiller": "painkiller",
    "gauss": "gauss",
};

const ENTITY_TEMPLATES = {
    "Wretches": { desc: "Crawling things. They used to be human. They skitter in the dark.", action: "RUN", escapeChance: 0.6, damage: 20 },
    "Faceless": { desc: "No face. Just smooth skin where features should be. It's looking for something.", action: "HIDE", escapeChance: 0.4, damage: 15 },
    "Smiler": { desc: "It smiles. Always. Its face frozen in joy. But its eyes are wrong.", action: "CLOSE EYES", escapeChance: 0.5, damage: 25 },
    "Deathmoth": { desc: "Moths the size of dogs. They circle lights that don't exist.", action: "HOLD STILL", escapeChance: 0.8, damage: 5 },
    "Partygoers": { desc: "They wear colorful masks. They dance in rooms that shouldn't exist.", action: "KEEP QUIET", escapeChance: 0.7, damage: 10 },
    "The Thing That Tastes Color": { desc: "A wet, clicking sound. Then it appears. It tilts its head. Tasting the air.", action: "HOLD BREATH", escapeChance: 0.3, damage: 35 },
    "Cursor": { desc: "A shadow that moves wrong. It drifts. It has too many joints.", action: "RUN", escapeChance: 0.5, damage: 30 },
    "Skinless": { desc: "Almost human. But skinless. Red, wet tissue glistens under the light.", action: "RUN", escapeChance: 0.4, damage: 40 },
};

const ITEMS = [
    { id: "flashlight", name: "Flashlight", desc: "Wretches fear light", effect: "escape_bonus", value: 0.25, cssClass: "flashlight" },
    { id: "painkiller", name: "Painkiller", desc: "-10% Stability loss", effect: "damage_reduction", value: 10, cssClass: "painkiller" },
    { id: "almond", name: "Almond Water", desc: "Stability +25%", effect: "stability_restore", value: 25, cssClass: "almond" },
    { id: "bandage", name: "Bandage", desc: "Stability +15%", effect: "stability_restore", value: 15, cssClass: "" },
    { id: "gauss", name: "Gauss Meter", desc: "Detects entities", effect: "detect", value: 1, cssClass: "" },
];

const SAFE_ACTIONS = {
    "Wretches": "RUN", "Faceless": "HIDE", "Smiler": "CLOSE EYES",
    "Deathmoth": "HOLD STILL", "Partygoers": "KEEP QUIET",
    "The Thing That Tastes Color": "HOLD BREATH", "Cursor": "RUN", "Skinless": "RUN",
};

// ---- Slow Hours ----
// 5-8 line ambient scenes that play out line by line at 800ms cadence,
// same rhythm as descendToLevel. Triggered on room entry with 25%
// chance. While a slow room is unfolding, no entity or environmental
// event can fire. The point is to make the player feel the building
// breathe between crises.
const SLOW_ROOMS = [
    [
        "The room is quiet.",
        "A light flickers. Once. Twice.",
        "The hum is softer here, almost kind.",
        "You stand still. Nothing comes.",
        "You are, for a moment, alone with the wallpaper.",
    ],
    [
        "Water drips somewhere out of sight.",
        "Drip.",
        "Drip.",
        "You count them without meaning to.",
        "Three drops. Then silence.",
        "The silence is louder than the drips.",
    ],
    [
        "A chair sits in the middle of the floor.",
        "It faces away from you.",
        "There is no reason for a chair to be there.",
        "There is no reason for you to look at it this long.",
    ],
    [
        "The walls are covered in handwriting.",
        "You cannot read it. You do not want to.",
        "Some of it looks like your own.",
        "Some of it looks like everyone's.",
    ],
    [
        "A door is slightly open.",
        "Beyond it, another room.",
        "Beyond that, another door.",
        "Beyond that, you do not look.",
    ],
    [
        "The lights are off.",
        "You cannot remember turning them off.",
        "You cannot remember the lights being on.",
        "The dark is patient. It does not need you to move.",
    ],
    [
        "Something is breathing nearby.",
        "You freeze.",
        "The breathing stops.",
        "You wonder if you imagined it.",
        "You did not imagine it.",
    ],
    [
        "A radio is playing somewhere.",
        "There is no station it could be on.",
        "The voice on it knows your name.",
        "It does not say it out loud. It just knows.",
    ],
    [
        "The carpet is warm under your feet.",
        "Warmer than it should be.",
        "You lift your foot. The warmth follows.",
    ],
    [
        "A photograph is on the floor.",
        "You do not pick it up.",
        "You do not need to.",
        "You know whose face is in it.",
    ],
    [
        "The hum drops. Rises. Drops again.",
        "It is testing you.",
        "It is testing the room.",
        "It is testing something that is not you.",
    ],
    [
        "Footsteps pass by outside the door.",
        "They slow down at your room.",
        "They keep going.",
        "The next room, they stop.",
    ],
];

if (typeof window !== "undefined") {
    window.MAX_INVENTORY = MAX_INVENTORY;
    window.ENV_EVENTS = ENV_EVENTS;
    window.REWARD_ITEM_IDS = REWARD_ITEM_IDS;
    window.ENTITY_TEMPLATES = ENTITY_TEMPLATES;
    window.ITEMS = ITEMS;
    window.SAFE_ACTIONS = SAFE_ACTIONS;
    window.SLOW_ROOMS = SLOW_ROOMS;
}
