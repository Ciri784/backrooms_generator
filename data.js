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
