// audio.js — procedural audio layer for the Backrooms survival game.
// Pure Web Audio API. No samples, no external files.
//
// The idea: every sound is synthesized from noise + filters + LFOs.
// Different levels get different "soundtracks" built from the same
// primitive building blocks. The result is unique per play, slightly
// unstable, and reacts to the same state the text does (Stability,
// encounter proximity, level transition).
//
// Browser autoplay policies: nothing can start before the user has
// interacted with the page. We lazily resume() the context on the
// first click/keydown and try to fail soft if AudioContext is blocked.
//
// Public API on window:
//   Audio.init()           — call once after game.html loads
//   Audio.unlock()         — call on first user gesture
//   Audio.startLevel(n)    — change ambient soundscape for level n
//   Audio.stopAll()        — silence everything (death / return to menu)
//   Audio.heartbeat()      — call on every player action to keep the
//                            ambient bed reactive to movement
//   Audio.entityApproach() — call when an entity is about to spawn
//   Audio.entityEncounter()— call the moment an encounter starts
//   Audio.entityDefeat()   — call after a successful escape
//   Audio.entityHit()      — call when the player takes entity damage
//   Audio.bossEncounter()  — call when a boss appears
//   Audio.bossDefeat()     — call after the boss is beaten
//   Audio.doorOpen()       — call when a door is opened
//   Audio.doorIgnore()     — call when a door is ignored
//   Audio.slowRoom()       — call when a slow room starts
//   Audio.transition()     — call when descending to a new level
//   Audio.death()          — call on game over
//   Audio.setStability(s)  — continuous, lower stability = more drone
//   Audio.fakeFootsteps()  — 1-in-N chance to play a phantom footstep
//                            from the "next room over"

(function () {
    "use strict";

    if (typeof window === "undefined") return;

    // -------- internals --------

    let ctx = null;
    let masterGain = null;
    let masterFilter = null;     // global low-pass — pulled down as stability drops
    let ambientBus = null;       // gain for the always-on bed
    let fxBus = null;            // gain for one-shots

    // Layered ambient voices for the current level. Each is a chain
    // of (source -> filter -> LFO -> gain) into the ambient bus.
    // We tear these down on level change.
    let ambientLayers = [];
    let ambientStarted = false;

    // Last reported stability — used to bend the master filter and
    // the hum drift.
    let lastStability = 100;

    // Unlock status — separate from startLevel. Audio.init() can be
    // called before the user has clicked; sounds will be queued and
    // flushed on unlock.
    let unlocked = false;
    let pendingStart = null;     // level number waiting to start

    // Small PRNG so the "phantom footsteps" and random LFO seeds are
    // deterministic within a beat but not globally seeded.
    function r(min, max) { return Math.random() * (max - min) + min; }
    function ri(min, max) { return Math.floor(r(min, max + 1)); }

    // -------- primitives --------

    // Brown noise buffer (~2s, looping). Used as the basis for the
    // hum and the room air bed.
    function makeBrownNoiseBuffer(seconds) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const wn = Math.random() * 2 - 1;
            // Simple integrator → brownian motion. Scale so peak stays ~1.
            last = (last + 0.02 * wn) / 1.02;
            data[i] = last * 3.5;
        }
        return buf;
    }

    // White noise buffer (~1s, looping). Used for drips, breath, wind.
    function makeWhiteNoiseBuffer(seconds) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buf;
    }

    // Build an LFO oscillator and connect it to a target param.
    // Returns the LFO node so the caller can stop it later.
    function makeLFO(freqHz, depth, target) {
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = freqHz;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = depth;
        lfo.connect(lfoGain);
        lfoGain.connect(target);
        lfo.start();
        return { lfo, lfoGain };
    }

    // A looping noise source. Returns { source, output } where output
    // is a GainNode ready to chain filters into.
    function makeNoiseSource(buf) {
        const source = ctx.createBufferSource();
        source.buffer = buf;
        source.loop = true;
        const out = ctx.createGain();
        out.gain.value = 1.0;
        source.connect(out);
        source.start();
        return { source, output: out };
    }

    // -------- level soundscapes --------
    // Each builder is responsible for constructing 2-4 ambient layers
    // for its level. They are torn down by stopAll() / startLevel().

    function buildHum(opts) {
        // Brown noise through a narrow bandpass that drifts in pitch.
        // This is "the hum" — the signature sound of Level 0.
        const { source, output } = makeNoiseSource(makeBrownNoiseBuffer(2.0));
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = opts.center || 110;
        bp.Q.value = opts.q || 4;
        const lfo = makeLFO(opts.drift || 0.18, opts.driftDepth || 12, bp.frequency);
        const g = ctx.createGain();
        g.gain.value = opts.gain || 0.18;
        output.connect(bp);
        bp.connect(g);
        g.connect(ambientBus);
        return { source, output, filter: bp, lfo: lfo.lfo, lfoGain: lfo.lfoGain, gain: g, teardown: () => {
            try { lfo.lfo.stop(); } catch (e) {}
        }};
    }

    function buildFluorescent(opts) {
        // Higher, sharper band — a separate fluorescent buzz that
        // sits on top of the hum. Tinnitus-y.
        const { source, output } = makeNoiseSource(makeBrownNoiseBuffer(2.0));
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = opts.center || 2200;
        bp.Q.value = opts.q || 18;
        const lfo = makeLFO(opts.drift || 0.6, opts.driftDepth || 30, bp.frequency);
        const g = ctx.createGain();
        g.gain.value = opts.gain || 0.05;
        output.connect(bp);
        bp.connect(g);
        g.connect(ambientBus);
        return { source, output, filter: bp, lfo: lfo.lfo, lfoGain: lfo.lfoGain, gain: g, teardown: () => {
            try { lfo.lfo.stop(); } catch (e) {}
        }};
    }

    function buildDrips(opts) {
        // Stochastic "drip" layer: a low-gain noise burst into a
        // short delay, scheduled every couple of seconds. Each burst
        // is a brief envelope on a filtered noise source.
        const out = ctx.createGain();
        out.gain.value = 1.0;
        out.connect(ambientBus);

        const noiseBuf = makeWhiteNoiseBuffer(0.4);
        const intervalId = { id: null };
        function scheduleNext() {
            const wait = r(opts.minGap || 2200, opts.maxGap || 6000);
            intervalId.id = setTimeout(() => {
                const src = ctx.createBufferSource();
                src.buffer = noiseBuf;
                src.playbackRate.value = r(0.6, 1.4);
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = r(800, 1800);
                bp.Q.value = 6;
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, ctx.currentTime);
                g.gain.linearRampToValueAtTime(r(0.04, 0.10), ctx.currentTime + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
                src.connect(bp);
                bp.connect(g);
                g.connect(out);
                src.start();
                src.stop(ctx.currentTime + 0.3);
                scheduleNext();
            }, wait);
        }
        scheduleNext();
        return {
            source: null, output: out, gain: out, teardown: () => {
                if (intervalId.id) clearTimeout(intervalId.id);
            },
        };
    }

    function buildWind(opts) {
        // White noise through a low-pass with a slow LFO on the
        // cutoff — gives the "air moving through a long corridor"
        // feel. Used on levels 4, 5, 7.
        const { source, output } = makeNoiseSource(makeWhiteNoiseBuffer(2.0));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = opts.cutoff || 600;
        lp.Q.value = 0.7;
        const lfo = makeLFO(opts.drift || 0.08, opts.driftDepth || 250, lp.frequency);
        const g = ctx.createGain();
        g.gain.value = opts.gain || 0.06;
        output.connect(lp);
        lp.connect(g);
        g.connect(ambientBus);
        return { source, output, filter: lp, lfo: lfo.lfo, lfoGain: lfo.lfoGain, gain: g, teardown: () => {
            try { lfo.lfo.stop(); } catch (e) {}
        }};
    }

    function buildWater(opts) {
        // Underwater slosh. Low-passed white noise with a slow
        // tremolo (gain LFO) and a pitch-modulated bandpass for the
        // occasional "groan" of water settling.
        const { source, output } = makeNoiseSource(makeWhiteNoiseBuffer(3.0));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 700;
        lp.Q.value = 0.6;
        const tremoloLFO = makeLFO(0.25, 0.04, output.gain);
        const g = ctx.createGain();
        g.gain.value = opts.gain || 0.12;
        output.connect(lp);
        lp.connect(g);
        g.connect(ambientBus);

        // Random water groan — a low bandpass noise burst every so often.
        const groanBuf = makeBrownNoiseBuffer(1.5);
        const groanId = { id: null };
        function scheduleGroan() {
            const wait = r(opts.minGroan || 5000, opts.maxGroan || 14000);
            groanId.id = setTimeout(() => {
                const src = ctx.createBufferSource();
                src.buffer = groanBuf;
                src.playbackRate.value = r(0.3, 0.6);
                const bp = ctx.createBiquadFilter();
                bp.type = "bandpass";
                bp.frequency.value = r(120, 280);
                bp.Q.value = 3;
                const g2 = ctx.createGain();
                g2.gain.setValueAtTime(0, ctx.currentTime);
                g2.gain.linearRampToValueAtTime(r(0.06, 0.12), ctx.currentTime + 0.4);
                g2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.5);
                src.connect(bp);
                bp.connect(g2);
                g2.connect(ambientBus);
                src.start();
                src.stop(ctx.currentTime + 2.6);
                scheduleGroan();
            }, wait);
        }
        scheduleGroan();
        return { source, output, filter: lp, lfo: tremoloLFO.lfo, lfoGain: tremoloLFO.lfoGain, gain: g, teardown: () => {
            try { tremoloLFO.lfo.stop(); } catch (e) {}
            if (groanId.id) clearTimeout(groanId.id);
        }};
    }

    function buildConductor(opts) {
        // Level 6's Drowned Conductor hint: a sub-bass drone with a
        // "string section" shimmer (high bandpass on white noise) and
        // a very slow tremolo — feels like orchestra tuning.
        const { source, output } = makeNoiseSource(makeBrownNoiseBuffer(3.0));
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 180;
        const lfo = makeLFO(0.15, 0.05, output.gain);
        const g = ctx.createGain();
        g.gain.value = opts.gain || 0.18;
        output.connect(lp);
        lp.connect(g);
        g.connect(ambientBus);

        // Shimmer
        const sh = makeNoiseSource(makeWhiteNoiseBuffer(2.0));
        const shp = ctx.createBiquadFilter();
        shp.type = "bandpass";
        shp.frequency.value = 3500;
        shp.Q.value = 8;
        const shLFO = makeLFO(0.3, 800, shp.frequency);
        const shg = ctx.createGain();
        shg.gain.value = 0.015;
        sh.output.connect(shp);
        shp.connect(shg);
        shg.connect(ambientBus);

        return { source, output, filter: lp, lfo: lfo.lfo, lfoGain: lfo.lfoGain, gain: g, teardown: () => {
            try { lfo.lfo.stop(); } catch (e) {}
            try { shLFO.lfo.stop(); } catch (e) {}
            try { sh.source.stop(); } catch (e) {}
        }};
    }

    function buildGolf(opts) {
        // Level 7 — wind + an occasional distant metal "ding"
        // (triangle osc with long decay) that sounds like a flagpole
        // in the breeze.
        const windLayer = buildWind({ cutoff: 400, gain: 0.10, drift: 0.06, driftDepth: 200 });
        const dingBuf = (() => {
            // synthesize once
            const len = Math.floor(ctx.sampleRate * 1.5);
            const b = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = b.getChannelData(0);
            for (let i = 0; i < len; i++) {
                const t = i / ctx.sampleRate;
                d[i] = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 1.5) * 0.3
                      + Math.sin(2 * Math.PI * 1320 * t) * Math.exp(-t * 2.0) * 0.2;
            }
            return b;
        })();
        const dingId = { id: null };
        function scheduleDing() {
            const wait = r(8000, 20000);
            dingId.id = setTimeout(() => {
                const src = ctx.createBufferSource();
                src.buffer = dingBuf;
                src.playbackRate.value = r(0.95, 1.05);
                const g = ctx.createGain();
                g.gain.value = r(0.04, 0.08);
                src.connect(g);
                g.connect(ambientBus);
                src.start();
                src.stop(ctx.currentTime + 1.5);
                scheduleDing();
            }, wait);
        }
        scheduleDing();
        // We return a composite teardown that stops the wind + clears ding.
        return { source: windLayer.source, output: windLayer.output, gain: windLayer.gain, teardown: () => {
            windLayer.teardown();
            if (dingId.id) clearTimeout(dingId.id);
        }};
    }

    function buildLobbyYouRemember(opts) {
        // Level 8: a dead, almost-silent hum (the lobby you remember
        // from Level 0) layered with a faint high-pitched tinnitus
        // ring. Periodically a single very soft piano note rings
        // out and decays — the "someone is still there" beat.
        const hum = buildHum({ center: 110, q: 4, gain: 0.10, drift: 0.10, driftDepth: 8 });

        // Tinnitus: a pure sine at ~4500 Hz, very low gain.
        const ring = ctx.createOscillator();
        ring.type = "sine";
        ring.frequency.value = 4500;
        const ringG = ctx.createGain();
        ringG.gain.value = 0.012;
        ring.connect(ringG);
        ringG.connect(ambientBus);
        ring.start();

        // Pre-render a soft piano-like note buffer.
        const noteBuf = (() => {
            const len = Math.floor(ctx.sampleRate * 3.0);
            const b = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = b.getChannelData(0);
            const freqs = [261.63, 329.63, 392.00, 523.25]; // C4 E4 G4 C5
            for (let i = 0; i < len; i++) {
                const t = i / ctx.sampleRate;
                let s = 0;
                for (let k = 0; k < freqs.length; k++) {
                    s += Math.sin(2 * Math.PI * freqs[k] * t) * Math.exp(-t * (0.8 + k * 0.3)) * 0.15;
                }
                d[i] = s;
            }
            return b;
        })();
        const noteId = { id: null };
        function scheduleNote() {
            const wait = r(6000, 14000);
            noteId.id = setTimeout(() => {
                const src = ctx.createBufferSource();
                src.buffer = noteBuf;
                src.playbackRate.value = r(0.97, 1.03);
                const g = ctx.createGain();
                g.gain.value = r(0.05, 0.10);
                src.connect(g);
                g.connect(ambientBus);
                src.start();
                src.stop(ctx.currentTime + 3.0);
                scheduleNote();
            }, wait);
        }
        scheduleNote();

        return { source: hum.source, output: hum.output, gain: hum.gain, teardown: () => {
            hum.teardown();
            try { ring.stop(); } catch (e) {}
            if (noteId.id) clearTimeout(noteId.id);
        }};
    }

    // -------- level configurations --------
    // Each level gets an array of layer builders. Order matters for
    // teardown but not for audio (everything sums to the ambient bus).
    const LEVEL_CONFIGS = {
        0: [ // THE LOBBY — the canonical hum
            () => buildHum({ center: 110, q: 4, gain: 0.20, drift: 0.18, driftDepth: 12 }),
            () => buildFluorescent({ center: 2200, q: 18, gain: 0.05, drift: 0.6, driftDepth: 30 }),
        ],
        1: [ // PACKING ROOMS — wooden creaks (low rumble) + hum
            () => buildHum({ center: 100, q: 3, gain: 0.14, drift: 0.12, driftDepth: 10 }),
            () => buildWind({ cutoff: 350, gain: 0.05, drift: 0.09, driftDepth: 150 }),
            () => buildDrips({ minGap: 4000, maxGap: 9000 }),
        ],
        2: [ // PIPE HEAVEN — hum + water
            () => buildHum({ center: 130, q: 5, gain: 0.16, drift: 0.22, driftDepth: 15 }),
            () => buildWater({ gain: 0.08, minGroan: 7000, maxGroan: 16000 }),
        ],
        3: [ // OFFICES — paper-rustly high noise + low hum
            () => buildHum({ center: 95, q: 3, gain: 0.12, drift: 0.10, driftDepth: 8 }),
            () => buildWind({ cutoff: 500, gain: 0.04, drift: 0.07, driftDepth: 120 }),
            () => buildFluorescent({ center: 2400, q: 22, gain: 0.04, drift: 0.4, driftDepth: 25 }),
        ],
        4: [ // ABANDONED CONCRETE — wind + low rumble
            () => buildWind({ cutoff: 280, gain: 0.12, drift: 0.06, driftDepth: 180 }),
            () => buildHum({ center: 80, q: 2.5, gain: 0.10, drift: 0.08, driftDepth: 6 }),
        ],
        5: [ // HOTELS — distant door slams + corridor air
            () => buildWind({ cutoff: 600, gain: 0.07, drift: 0.10, driftDepth: 200 }),
            () => buildHum({ center: 105, q: 3, gain: 0.10, drift: 0.14, driftDepth: 9 }),
            () => buildDrips({ minGap: 3000, maxGap: 8000 }),
        ],
        6: [ // WATER ZONE — full water + low conductor hint
            () => buildWater({ gain: 0.18, minGroan: 4000, maxGroan: 10000 }),
            () => buildConductor({ gain: 0.12 }),
        ],
        7: [ // GOLF COURSE — wind + flag ding
            () => buildGolf({}),
        ],
        8: [ // THE LOBBY YOU REMEMBER — dying hum + tinnitus + lonely piano
            () => buildLobbyYouRemember({}),
        ],
    };

    // -------- one-shots --------

    function playFootstep(opts) {
        if (!ctx) return;
        const buf = makeWhiteNoiseBuffer(0.15);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = r(0.7, 1.3);
        const bp = ctx.createBiquadFilter();
        bp.type = "lowpass";
        bp.frequency.value = r(200, 500);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(opts.gain || 0.18, ctx.currentTime + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        src.connect(bp);
        bp.connect(g);
        g.connect(fxBus);
        src.start();
        src.stop(ctx.currentTime + 0.2);
    }

    function playDoorCreak() {
        if (!ctx) return;
        const buf = makeWhiteNoiseBuffer(0.6);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.35;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 800;
        bp.Q.value = 6;
        const lfo = makeLFO(6, 400, bp.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        src.connect(bp);
        bp.connect(g);
        g.connect(fxBus);
        src.start();
        src.stop(ctx.currentTime + 0.65);
        setTimeout(() => { try { lfo.lfo.stop(); } catch (e) {} }, 700);
    }

    function playDoorSlam() {
        if (!ctx) return;
        const buf = makeBrownNoiseBuffer(0.4);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.4;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 300;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        src.connect(lp);
        lp.connect(g);
        g.connect(fxBus);
        src.start();
        src.stop(ctx.currentTime + 0.55);
    }

    function playEntityWarning() {
        if (!ctx) return;
        // A low, descending pitch sweep — the "something noticed you" cue.
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 0.15);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
        osc.frequency.setValueAtTime(160, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 1.4);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 400;
        osc.connect(lp);
        lp.connect(g);
        g.connect(fxBus);
        osc.start();
        osc.stop(ctx.currentTime + 1.7);
    }

    function playEntityDefeat() {
        if (!ctx) return;
        // The footsteps recede: a quick burst that fades with a slight
        // upward pitch bend.
        const buf = makeWhiteNoiseBuffer(0.4);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(700, ctx.currentTime);
        bp.frequency.exponentialRampToValueAtTime(2200, ctx.currentTime + 0.6);
        bp.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.10, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
        src.connect(bp);
        bp.connect(g);
        g.connect(fxBus);
        src.start();
        src.stop(ctx.currentTime + 0.75);
    }

    function playEntityHit() {
        if (!ctx) return;
        // A sharp low thud + a brief noise crackle. The "it got you" cue.
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.25);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.30, ctx.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        osc.connect(g);
        g.connect(fxBus);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);

        // Crackle overlay
        const buf = makeWhiteNoiseBuffer(0.2);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const cg = ctx.createGain();
        cg.gain.setValueAtTime(0.15, ctx.currentTime);
        cg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        src.connect(cg);
        cg.connect(fxBus);
        src.start();
        src.stop(ctx.currentTime + 0.3);
    }

    function playBossDrone() {
        if (!ctx) return;
        // Heavy sub-bass drone with slow pulse — the boss is here.
        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.value = 45;
        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.value = 67;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 200;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.6);
        osc1.connect(lp);
        osc2.connect(lp);
        lp.connect(g);
        g.connect(fxBus);
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 4.0);
        osc2.stop(ctx.currentTime + 4.0);
        g.gain.setValueAtTime(0.25, ctx.currentTime + 3.0);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 4.0);
    }

    function playBossDefeat() {
        if (!ctx) return;
        // A single rising sine that cracks into noise at the top.
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 1.2);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.20, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.5);
        osc.connect(g);
        g.connect(fxBus);
        osc.start();
        osc.stop(ctx.currentTime + 1.6);
    }

    function playDeath() {
        if (!ctx) return;
        // A long descending sweep into brown noise that fades.
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 2.5);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(800, ctx.currentTime);
        lp.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 2.5);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.0);
        osc.connect(lp);
        lp.connect(g);
        g.connect(fxBus);
        osc.start();
        osc.stop(ctx.currentTime + 3.0);
    }

    function playPhantomFootstep() {
        if (!ctx) return;
        // Same as a real footstep but very quiet, with a slight stereo
        // "distance" feel (we only have mono so we just attenuate hard
        // and add a slap delay of ~120ms).
        playFootstep({ gain: 0.06 });
        setTimeout(() => playFootstep({ gain: 0.04 }), 120);
        setTimeout(() => playFootstep({ gain: 0.02 }), 280);
    }

    function playTransition() {
        if (!ctx) return;
        // Descending whoosh for "you descend to a new level".
        const buf = makeWhiteNoiseBuffer(0.8);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(1800, ctx.currentTime);
        bp.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.9);
        bp.Q.value = 5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.1);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
        src.connect(bp);
        bp.connect(g);
        g.connect(fxBus);
        src.start();
        src.stop(ctx.currentTime + 1.1);
    }

    // -------- control --------

    function teardownAmbient() {
        for (const layer of ambientLayers) {
            try { if (layer.source) layer.source.stop(); } catch (e) {}
            try { if (layer.teardown) layer.teardown(); } catch (e) {}
        }
        ambientLayers = [];
    }

    function startLevel(n) {
        if (!ctx) {
            pendingStart = n;
            return;
        }
        if (!unlocked) {
            pendingStart = n;
            return;
        }
        teardownAmbient();
        const cfg = LEVEL_CONFIGS[n] || LEVEL_CONFIGS[0];
        for (const builder of cfg) {
            try {
                const layer = builder();
                if (layer) ambientLayers.push(layer);
            } catch (e) {
                // Layer failed to build — skip it, don't kill the rest.
            }
        }
        ambientStarted = true;
    }

    function stopAll() {
        teardownAmbient();
        ambientStarted = false;
    }

    function init() {
        if (ctx) return;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return; // No Web Audio — silently disable.
        try {
            ctx = new Ctor();
        } catch (e) {
            return;
        }
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.85;
        masterFilter = ctx.createBiquadFilter();
        masterFilter.type = "lowpass";
        masterFilter.frequency.value = 20000;
        masterFilter.Q.value = 0.7;
        ambientBus = ctx.createGain();
        ambientBus.gain.value = 0.6;
        fxBus = ctx.createGain();
        fxBus.gain.value = 0.9;
        ambientBus.connect(masterFilter);
        fxBus.connect(masterFilter);
        masterFilter.connect(masterGain);
        masterGain.connect(ctx.destination);
    }

    function unlock() {
        if (!ctx) init();
        if (!ctx) return;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        unlocked = true;
        if (pendingStart != null) {
            const n = pendingStart;
            pendingStart = null;
            startLevel(n);
        } else if (!ambientStarted) {
            startLevel(0);
        }
    }

    function setStability(s) {
        lastStability = s;
        if (!ctx || !masterFilter) return;
        // Low stability: pull the master filter way down, so the
        // world sounds muffled / like hearing damage. The fx bus
        // stays clear so the player can still hear warnings.
        const cutoff = clamp(400 + (s / 100) * (20000 - 400), 400, 20000);
        const now = ctx.currentTime;
        masterFilter.frequency.cancelScheduledValues(now);
        masterFilter.frequency.linearRampToValueAtTime(cutoff, now + 0.6);
    }

    function heartbeat() {
        // Called on every player action. A quiet footstep sound
        // 80% of the time, and a 12% chance of a phantom footstep
        // (three soft thuds from "the next room over").
        if (!ctx || !unlocked) return;
        if (Math.random() < 0.80) playFootstep({ gain: 0.15 });
        if (Math.random() < 0.12) playPhantomFootstep();
    }

    function entityApproach() {
        if (!ctx || !unlocked) return;
        playEntityWarning();
    }
    function entityEncounter() { playEntityWarning(); }
    function entityDefeat() { playEntityDefeat(); }
    function entityHit() { playEntityHit(); }
    function bossEncounter() { playBossDrone(); }
    function bossDefeat() { playBossDefeat(); }
    function doorOpen() { playDoorCreak(); playDoorSlam(); }
    function doorIgnore() { playDoorCreak(); }
    function slowRoom() {
        // Slight bed volume dip + a single soft drip a few seconds in.
        if (!ctx || !ambientBus) return;
        const now = ctx.currentTime;
        ambientBus.gain.cancelScheduledValues(now);
        ambientBus.gain.setValueAtTime(ambientBus.gain.value, now);
        ambientBus.gain.linearRampToValueAtTime(0.35, now + 0.8);
        ambientBus.gain.linearRampToValueAtTime(0.6, now + 5.0);
        setTimeout(() => playFootstep({ gain: 0.10 }), 1800);
    }
    function transition() { playTransition(); }
    function death() { playDeath(); setTimeout(stopAll, 3500); }
    function fakeFootsteps() { playPhantomFootstep(); }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // -------- expose --------

    window.Audio = {
        init,
        unlock,
        startLevel,
        stopAll,
        heartbeat,
        entityApproach,
        entityEncounter,
        entityDefeat,
        entityHit,
        bossEncounter,
        bossDefeat,
        doorOpen,
        doorIgnore,
        slowRoom,
        transition,
        death,
        setStability,
        fakeFootsteps,
    };
})();
