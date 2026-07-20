# Backrooms Generator

> You shouldn't have come here.

A generator that creates liminal space descriptions. Inspired by the Backrooms, Kane Pixels, and the uncanny feeling of familiar spaces becoming wrong.

## Live Demo

**https://Ciri784.github.io/backrooms_generator/**

## Features

- **Room Generator** — Generate unsettling descriptions of impossible rooms
- **Entity Generator** — Create descriptions of the things that live in the Backrooms
- **Survival Game** — Explore the Backrooms, survive entities, find items
- **Static HTML** — Runs entirely in your browser, no backend needed
- **Atmospheric Design** — Yellow-tinted color scheme with scanline effects and CRT flicker

## Survival Mode

Navigate through **9 levels** of the Backrooms (Level 0–8). Each level has different entities, a boss, and its own atmosphere. Last level is reached only after surviving Levels 0–7.

**Actions:**
- **Move Forward** — Explore new rooms, risk entity encounters
- **Search** — Find useful items, but risk disturbing something
- **Hide** — Wait out dangers, or prepare for encounters
- **Hold Still** — Freeze. Sometimes the thing passes by.
- **Use Item** — Use collected items for bonuses
- **Open Door / Ignore Door** — Doors appear on 20% of rooms. Both choices have a cost.

**Entities:**
- Each entity requires a specific action to escape
- Wrong action = damage to your Stability
- Correct action = higher escape chance
- Same entity met twice in a run = it learns your patterns. Escape chance drops, and its description shifts ("its eyes know you better now", "it has been waiting").

**Items:**
- Flashlight — Helps escape Wretches (+25%)
- Painkillers — Reduces damage taken
- Almond Water — Helps escape The Thing That Tastes Color
- Gaunt Meter — Detects entities nearby
- Bandages — Restore Stability

**Persistent Death Records:**
Last 10 deaths + lifetime stats are stored in `localStorage`. Next run opens with a fragment of memory: where you died, your last words, the rooms you cleared per level. Cleared via **FORGET EVERYTHING** on the death screen.

## Unsettling Mechanics

The game has six small mechanics designed to make you question what the architecture is doing — or whether you are.

- **Death Echo** — Die in LEVEL N at room M, and the next run's LEVEL N at room M surfaces a fragment: a dark stain on the tiles, the air feeling too familiar. Fires at most once per room per run.
- **Entity Memory** — Meet the same entity twice in a run. Its description shifts ("Its eyes know you better now"), and your escape chance drops. The third time you meet it, it has been waiting.
- **Echo Room** — Re-enter a room you've been in before. 30% chance it renders with a subtle difference: a chair that wasn't there, a light fixture angled differently, a scuff mark on the wall. The building, or you, has shifted.
- **NARRATOR FAULT** — When your Stability is high (>70), the narrative occasionally contradicts itself. "You turn left. There is no left." "Your shadow points a different direction than you do." Fires on 5% of narrative beats, outside scripted transitions.
- **Doors** — On 20% of rooms, a door appears. Open it (+10 Stability, but the room signatures get scrambled and 40% chance of an entity on the other side). Ignore it, and the next entity you meet in that level references the door behind you.
- **Level 9: THE LOBBY YOU REMEMBER** — After Level 7, the floor shifts one more time. You arrive at a room you've been in before. The window is locked from the outside. Through the glass you can see the room you woke up in. The light is on. Someone is still there. The boss is **Yourself**. SPEAK is the safe action.

## Levels

| Level | Name | Difficulty |
|-------|------|------------|
| 0 | THE LOBBY | ★☆☆☆☆ |
| 1 | THE PACKING ROOMS | ★☆☆☆☆ |
| 2 | PIPE HEAVEN | ★★☆☆☆ |
| 3 | THE OFFICES | ★★☆☆☆ |
| 4 | ABANDONED CONCRETE | ★★★☆☆ |
| 5 | HOTELS & ROOMS | ★★★☆☆ |
| 6 | THE WATER ZONE | ★★★★☆ |
| 7 | THE GOLF COURSE | ★★★★★ |
| 8 | THE LOBBY YOU REMEMBER | ★★★★★+ |

## For Developers

The `index.html` is the main page with generators.
The `game.html` is the survival text adventure.

`game.html` loads four pure-JS modules (no build step):

- `data.js` — `LEVELS`, `BOSS_TEMPLATES`, `ENV_EVENTS`, `ENTITY_TEMPLATES`, `ITEMS`, `SLOW_ROOMS`, `SAFE_ACTIONS`, `REWARD_ITEM_IDS`, `MAX_INVENTORY`
- `state.js` — `state` object, `initState()`, persistent death records (localStorage), utilities (`pick` / `chance` / `clamp` / `getCurrentLevel`), `ENTITY_OBSERVE_KNOWLEDGE`, `checkDeathEcho`
- `render.js` — `narrative()`, `enterSlowRoom()`, `generateRoomDesc()` (with Echo Room logic), `updateUI()`, `renderInventory()`, `renderKnowledge()`, `renderDeathStats()`, `forgetRecords()`
- `mechanics.js` — `moveOn()`, `search()`, `hide()`, `holdStill()`, `descendToLevel()`, `useItem()`, `addItem()`, `spawnEntity()`, `entityEncounter()`, `spawnEnvironmentEvent()`, `environmentEvent()`, `spawnBossEncounter()`, `bossEncounter()`, `spawnDoorChoice()`, `openDoor()`, `ignoreDoor()`, `checkGameOver()`, `startGame()`

All modules expose their public API on `window` so the inline `onclick="..."` attributes in `game.html` can reach them. `node --check` passes for all four files.

## Disclaimer

This is a creative writing tool for horror enthusiasts. No actual Backrooms exist. Probably.
