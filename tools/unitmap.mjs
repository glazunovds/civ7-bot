// Unit positions turn by turn from a game's Logs folder, the independents' unit births, and a fight-simulator scene for a
// window of turns (game 60's review: the game's own AI logs place every unit by id each turn; our UI.log adds what they lack).
//
// Usage: node tools/unitmap.mjs <Logs folder> [from=60] [to=75] [radius=6] [reach=12] [player=0] [scene=<out.json>]
//                               [settlements=x,y;x,y] [unseen=35,36] [map=WxH] [age=antiquity] [session=N] [ships] [civilians] [quiet]
//   Prints, for each turn of [from, to], our units and the hostile units within `radius` of our settlements (by id, tile and
//   damage), the fights of ours (CombatLog.csv, with AI_Tactical.csv's attack tiles), and each independent's unit births over
//   the whole game (its spawn cadence). With scene=, writes the window as a scene for tools/fight-sim.mjs scene=<file>
//   (tests/fakes/fight-scenes.mjs replayScene), with the game's own numbers for those turns to compare: their soldiers within
//   `reach` of our settlements (those away from their village walk to our nearest settlement in the simulator: raiders). Our
//   `places:` lines say which villages we had seen; for older logs `unseen=` names the owners whose village we had not (the
//   autopilot hunts or skirmishes only with a village it sees).
//
// It needs the game's AI logging on (AppOptions.txt, as game 60 had it): AI_MovementPlanning.csv (every unit's tile each turn:
// its turn-1 entry with the most moves left), UnitOperations.log (types), CombatLog.csv (fights and heals, the defender's tile),
// AI_Tactical.csv (the AI's attacks with their move and target tiles), Independents.csv (villages, births, raids),
// DiplomacySummary.csv (wars). From UI.log: our `units:`, `places:`, `fight:` lines (packed armies, activity, what we saw, the
// generals' radius), and in older logs `autopilot: SETTLE_FOUND`, `xp:` and `army:` lines. Offline analysis only: the AI logs
// show units we never saw (PLAN.md §14 governs the mod's decisions, not review tools).
//
// A folder from one launch holds several sessions: the game appends each age (its turns start again at 1, and unit ids are
// given out again) and each earlier save loaded to the same files (game 60's whole folder: AI_MovementPlanning 140 -> 1
// twice). Each log is cut where its turn drops, and one session is read: session=N (1 the first), the last by default.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HexGrid } from "../mod/expansion-planner/ui/core/xpl-hex.js";
import { joinParts, parseFight, parsePlaces, parseUnitsLine, readLine, unitToken, typeName } from "../mod/expansion-planner/ui/core/xpl-unit-lines.js";

const here = dirname(fileURLToPath(import.meta.url));
// The base game's map grids (base-standard/data/maps.xml), for GameCoreAppConfig.log's SizeTypeName.
const MAP_SIZES = { MAPSIZE_TINY: [60, 38], MAPSIZE_SMALL: [74, 46], MAPSIZE_STANDARD: [84, 54], MAPSIZE_LARGE: [96, 60], MAPSIZE_HUGE: [106, 66] };
const AGE_FILES = { A: "antiquity", E: "exploration", M: "modern" };

const read = (dir, name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : null);
const lines = (text) => (text ?? "").split(/\r?\n/);
const key = (owner, id) => `${owner}:${id}`;
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

// ---- sessions -------------------------------------------------------------------------------------------------------

/** A CSV row's (or UnitOperations.log line's) turn: its first field ("64,…", "001, Adding, …"), null for a header. */
export const csvTurn = (line) => {
    const m = /^\s*(\d+)\s*,/.exec(line);
    return m ? Number(m[1]) : null;
};

/**
 * A log's lines cut into sessions where the turn drops (a new age starts at turn 1; an earlier save loaded goes back): [[line]]
 * in order. Lines with no turn (a header) stay with the session they follow. A missing log: [].
 */
export function sessionsOf(text, turnOf = csvTurn) {
    if (text === null || text === undefined) return [];
    const out = [[]];
    let prev = null;
    for (const line of lines(text)) {
        const t = turnOf(line);
        if (t !== null && prev !== null && t < prev) out.push([]);
        if (t !== null) prev = t;
        out.at(-1).push(line);
    }
    return out;
}

// ---- the game's logs ------------------------------------------------------------------------------------------------

/**
 * AI_MovementPlanning.csv: `Game Turn, Player, Unit ID, MOVES, , x:y(turns/moves left), …` for every unit each turn. A unit's
 * tile is its turn-1 entry with the most moves left (its moves then). @returns { at: Map(turn -> Map(key -> { owner, id, x, y,
 * moves })) for turns within [from, to], first: Map(key -> first turn seen), last: Map(key -> last turn seen), maxX, maxY }
 */
export function parseMovement(text, { from = -Infinity, to = Infinity } = {}) {
    const at = new Map();
    const first = new Map();
    const last = new Map();
    let maxX = 0;
    let maxY = 0;
    for (const line of lines(text)) {
        const p = line.split(", ");
        if (p.length < 5 || p[3] !== "MOVES") continue;
        const turn = Number(p[0]);
        if (!Number.isFinite(turn)) continue;
        const k = key(Number(p[1]), Number(p[2]));
        if (!first.has(k)) first.set(k, turn);
        last.set(k, turn);
        if (turn < from || turn > to) continue;
        let best = null;
        for (const m of p.slice(4).join(", ").matchAll(/(\d+):(\d+)\((\d+)\/(\d+)\)/g)) {
            const [x, y, turns, moves] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (turns === 1 && (!best || moves > best.moves)) best = { x, y, moves };
        }
        if (!best) continue;
        if (!at.has(turn)) at.set(turn, new Map());
        at.get(turn).set(k, { owner: Number(p[1]), id: Number(p[2]), ...best });
    }
    return { at, first, last, maxX, maxY };
}

/** UnitOperations.log: `turn, Adding, player, UNIT_TYPE (id), UNITOPERATION_…` → Map(key -> type). */
export function parseUnitTypes(text, types = new Map()) {
    for (const line of lines(text)) {
        const m = /^\s*\d+, [^,]+, (\d+), (UNIT_[A-Z0-9_]+) \((\d+)\)/.exec(line);
        if (m) types.set(key(Number(m[1]), Number(m[3])), m[2]);
    }
    return types;
}

/**
 * CombatLog.csv: `Turn, SourceType, Location (the defender's tile), AttPlayer, DefPlayer, CombatType, Attacker, Defender, …,
 * AttDmg, DefDmg, Destroyed, HealAmount, attHealth, defHealth`; health "(h)max" after the fight (a heal: the unit is the
 * attacker). The header is only in the first session's text. @returns [{ turn, source, x, y, att, def, kind, attType, defType,
 * attDmg, defDmg, destroyed, heal, attHealth, attMax, defHealth, defMax }]
 */
export function parseCombat(text) {
    const out = [];
    for (const line of lines(text)) {
        const p = line.split(",");
        if (p.length < 18 || !/^\d+$/.test(p[0])) continue;
        const loc = /\((-?\d+)\)\((-?\d+)\)/.exec(p[2]);
        const type = (s) => /\(-?\d+\)(.*)$/.exec(s)?.[1] ?? s;
        const hp = (s) => /\((-?\d+)\)(\d+)/.exec(s);
        const ah = hp(p[16]);
        const dh = hp(p[17]);
        out.push({
            turn: Number(p[0]), source: p[1], x: loc ? Number(loc[1]) : null, y: loc ? Number(loc[2]) : null, att: Number(p[3]), def: Number(p[4]),
            kind: p[5], attType: type(p[6]), defType: type(p[7]), attDmg: Number(p[12]), defDmg: Number(p[13]), destroyed: p[14], heal: Number(p[15]),
            attHealth: ah ? Number(ah[1]) : null, attMax: ah ? Number(ah[2]) : null, defHealth: dh ? Number(dh[1]) : null, defMax: dh ? Number(dh[2]) : null,
        });
    }
    return out;
}

/** AI_Tactical.csv's attacks: `turn, player, Attack Units, …, TARGET (id:owner), UNIT (id), …, Move x y Attack x y` → [{ turn, owner, id, type, target: { owner, id, type }, from, to }]. */
export function parseTactical(text) {
    const out = [];
    for (const line of lines(text)) {
        if (!line.includes(", Attack Units, ")) continue;
        const p = line.split(", ");
        const t = /^(UNIT_[A-Z0-9_]+) \((\d+):(\d+)\)$/.exec(p[4] ?? "");
        const u = /^(UNIT_[A-Z0-9_]+) \((\d+)\)$/.exec(p[5] ?? "");
        const mv = /Move (-?\d+) (-?\d+) Attack (-?\d+) (-?\d+)/.exec(line);
        if (!u || !mv) continue;
        out.push({
            turn: Number(p[0]), owner: Number(p[1]), id: Number(u[2]), type: u[1],
            target: t ? { type: t[1], id: Number(t[2]), owner: Number(t[3]) } : null,
            from: { x: Number(mv[1]), y: Number(mv[2]) }, to: { x: Number(mv[3]), y: Number(mv[4]) },
        });
    }
    return out;
}

/** Independents.csv: villages (CREATE TRIBE n, x y; the tribe is the independent's player id), births (CREATE UNIT), raids. */
export function parseIndependents(text) {
    const tribes = new Map();
    const created = [];
    const raids = [];
    for (const line of lines(text)) {
        const p = line.split(", ");
        if (p.length < 4 || !/^\d+$/.test(p[0])) continue;
        const turn = Number(p[0]);
        const tribe = /^CREATE TRIBE (\d+)$/.exec(p[2]);
        const at = /^(-?\d+) (-?\d+)$/.exec(p[3]);
        const unit = /^(UNIT_[A-Z0-9_]+):(\d+)$/.exec(p[3]);
        const owner = Number(/tribe (\d+)/.exec(p[4] ?? "")?.[1]);
        if (tribe && at) tribes.set(Number(tribe[1]), { owner: Number(tribe[1]), x: Number(at[1]), y: Number(at[2]), name: p[1], turn });
        else if (p[2] === "CREATE UNIT" && unit) created.push({ turn, owner, type: unit[1], id: Number(unit[2]) });
        else if (/^LAUNCH (RAID|ASSAULT)$/.test(p[2])) raids.push({ turn, owner, kind: p[2].slice(7), target: p[3] });
    }
    return { tribes, created, raids };
}

/** DiplomacySummary.csv: the players at war with `player`, turn by turn: [{ turn, other, war: true|false }] in order. */
export function parseWars(text, player = 0) {
    const out = [];
    for (const line of lines(text)) {
        const p = line.split(", ");
        if (p.length < 4 || !/^\d+$/.test(p[0])) continue;
        const [a, b] = [Number(p[1]), Number(p[2])];
        if (a !== player && b !== player) continue;
        if (p[3] === "At War" || p[3] === "Peace") out.push({ turn: Number(p[0]), other: a === player ? b : a, war: p[3] === "At War" });
    }
    return out;
}

/** Who is at war with us at a turn's start (wars declared before it, not ended by a peace before it). */
export function warsAt(wars, turn) {
    const on = new Set();
    for (const w of wars) {
        if (w.turn >= turn) break;
        if (w.war) on.add(w.other);
        else on.delete(w.other);
    }
    return on;
}

// ---- our UI.log ---------------------------------------------------------------------------------------------------------

/**
 * Our lines: `units:`, `places:`, `fight:` (and old logs' `xp: combat T<n>`), commanders' `xp:` lines, `army:` lines (packed
 * types) and `autopilot: SETTLE_FOUND [name, x, y]`. A line without the turn stamp (logs before game 61) takes the turn of the
 * last `gold: T<n>` line, the next after `TURN_ENDED`. Sessions (one is read: `session`, 1 the first, the last by default): a
 * stamped line's age letter changes or its turn drops (A60 and E60 are other turns), an unstamped `gold:` line's turn drops.
 * @returns { units: Map(turn -> parsed), places: [{ turn, … }], fights: [{ turn, … }], xp: [{ turn, id, level, xp, next }],
 * armies: Map(turn -> [{ cmdr: "x,y", types }]), founded: [{ turn, x, y, name }], count (sessions), session, age (its letter,
 * null unstamped), first, last (its turns) }
 */
export function parseOurLog(text, { session = null } = {}) {
    const read = [];
    for (const raw of lines(text)) {
        if (!raw.includes("[XPL]") && !/^[AEMT]\d+ \d\d:\d\d:\d\d /.test(raw)) continue;
        const l = readLine(raw);
        if (l) read.push(l);
    }
    const cut = [[]];
    let prev = null;
    for (const m of joinParts(read)) {
        const gold = m.turn === null ? /^gold: T(\d+)/.exec(m.text) : null;
        const now = m.turn !== null ? { age: m.age, turn: m.turn } : gold ? { age: null, turn: Number(gold[1]) } : null;
        if (now && prev && ((now.age && prev.age && now.age !== prev.age) || now.turn < prev.turn) && cut.at(-1).length > 0) cut.push([]);
        if (now) prev = now;
        cut.at(-1).push(m);
    }
    const n = session ?? cut.length;
    return { ...parseSession(cut[n - 1] ?? []), count: cut.length, session: n };
}

/** One session's lines of ours (parseOurLog). */
function parseSession(messages) {
    const out = { units: new Map(), places: [], fights: [], oldFights: [], xp: [], armies: new Map(), founded: [], age: null, first: null, last: null };
    let turn = 0;
    for (const m of messages) {
        const t = m.text;
        let k;
        if ((k = /^gold: T(\d+)/.exec(t))) turn = Number(k[1]);
        const at = m.turn ?? turn;
        out.age ??= m.age ?? null;
        if (at > 0) {
            out.first ??= at;
            out.last = at;
        }
        if (!m.turn && /^autopilot: TURN_ENDED/.test(t)) turn++;
        if (t.startsWith("units: ")) out.units.set(at, parseUnitsLine(t));
        else if (t.startsWith("places: ")) out.places.push({ turn: at, ...parsePlaces(t) });
        else if (t.startsWith("fight: ")) {
            const f = parseFight(t);
            if (f) out.fights.push({ turn: at, ...f });
        } else if ((k = /^xp: combat T(\d+): ours (\S+) at (-?\d+),(-?\d+) \((attacker|defender)[^)]*\) vs p(\d+) \S+ (\S+); commanders (.*)$/.exec(t))) {
            const near = [...k[8].matchAll(/(\d+) tile\(s\) away/g)].map((x) => Number(x[1]));
            out.oldFights.push({ turn: Number(k[1]), ours: k[2], x: Number(k[3]), y: Number(k[4]), side: k[5], other: Number(k[6]), near });
        } else if ((k = /^xp: (UNIT_\S+) (\d+):(\d+) at .* level (\d+), XP (\d+)\/(\d+)/.exec(t))) {
            out.xp.push({ turn: at, type: k[1], id: Number(k[3]), level: Number(k[4]), xp: Number(k[5]), next: Number(k[6]) });
        } else if ((k = /^army: (UNIT_\S+) at (-?\d+),(-?\d+) onMap=true; .* ids \d+: \[(.*)\]$/.exec(t))) {
            const types = [...k[4].matchAll(/(UNIT_[A-Z0-9_]+) onMap=false/g)].map((x) => x[1]);
            if (!out.armies.has(at)) out.armies.set(at, []);
            out.armies.get(at).push({ cmdr: `${k[2]},${k[3]}`, types });
        } else if ((k = /^autopilot: SETTLE_FOUND \["[^"]*",(-?\d+),(-?\d+)\]/.exec(t))) {
            out.founded.push({ turn: at, x: Number(k[1]), y: Number(k[2]) });
        }
    }
    return out;
}

// ---- all of it ----------------------------------------------------------------------------------------------------------

/**
 * The map's grid: the game's configuration of the game it started or loaded (`"SizeTypeName":{…"value":"MAPSIZE_LARGE"}`),
 * else the setup screen's last change, never one the session's units do not fit (game 60's whole folder: the setup screen
 * changed to SMALL after the game), else the smallest the units fit. @returns { size: name | null, grid: [width, height] }
 */
export function mapGrid(cfg, maxX, maxY) {
    const fits = (n) => !!MAP_SIZES[n] && MAP_SIZES[n][0] > maxX && MAP_SIZES[n][1] > maxY;
    const games = [...(cfg ?? "").matchAll(/"SizeTypeName":\{[^}]*"value":"(MAPSIZE_[A-Z]+)"/g)].map((m) => m[1]);
    const changes = [...(cfg ?? "").matchAll(/Key SizeTypeName[^\n]*?(MAPSIZE_[A-Z]+)/g)].map((m) => m[1]);
    const size = games.reverse().find(fits) ?? changes.reverse().find(fits) ?? Object.keys(MAP_SIZES).find(fits) ?? null;
    return { size, grid: MAP_SIZES[size] ?? [maxX + 1, maxY + 1] };
}

/**
 * Reads one session of a Logs folder (sessionsOf; UI.log's own cut in parseOurLog), the same one of each log: `session`, 1 the
 * first, by default AI_MovementPlanning's last. A log with another number of sessions is named in `sessions.warnings` (game
 * 60's Antiquity copy: DiplomacySummary already held Exploration's first turn). @param opts { from, to, player, session }
 */
export function readLogs(dir, { from = 1, to = Infinity, player = 0, session = null } = {}) {
    const files = {};
    const cut = (name) => {
        const s = sessionsOf(read(dir, name));
        files[name] = s.length;
        return s;
    };
    const moves = cut("AI_MovementPlanning.csv");
    const count = Math.max(1, moves.length);
    const n = session ?? count;
    if (!(Number.isInteger(n) && n >= 1 && n <= count)) throw new Error(`session ${session}: the folder has ${count} (AI_MovementPlanning.csv)`);
    const pick = (s) => (s[n - 1] ? s[n - 1].join("\n") : null);
    const movement = parseMovement(pick(moves), { from: from - 1, to: to + 1 });
    const types = parseUnitTypes(pick(cut("UnitOperations.log")));
    const indep = parseIndependents(pick(cut("Independents.csv")));
    for (const c of indep.created) if (!types.has(key(c.owner, c.id))) types.set(key(c.owner, c.id), c.type);
    const tactical = parseTactical(pick(cut("AI_Tactical.csv")));
    for (const a of tactical) {
        if (!types.has(key(a.owner, a.id))) types.set(key(a.owner, a.id), a.type);
        if (a.target && !types.has(key(a.target.owner, a.target.id))) types.set(key(a.target.owner, a.target.id), a.target.type);
    }
    const combat = parseCombat(pick(cut("CombatLog.csv")));
    const wars = parseWars(pick(cut("DiplomacySummary.csv")), player);
    const ui = read(dir, "UI.log");
    const ours = parseOurLog(ui, { session: n });
    if (ui !== null) files["UI.log"] = ours.count;
    const warnings = Object.entries(files).filter(([, k]) => k > 0 && k !== moves.length)
        .map(([name, k]) => `${name} has ${k} session(s), AI_MovementPlanning.csv ${moves.length}: ${k >= n ? `its session ${n} is read; check it is the same` : `nothing read from it`}`);
    const { size, grid } = mapGrid(read(dir, "GameCoreAppConfig.log"), movement.maxX, movement.maxY);
    const sessions = { used: n, count, files, warnings, age: ours.age, first: ours.first, last: ours.last };
    return { dir, from, to, player, sessions, movement, types, indep, tactical, combat, wars, ours, map: { width: grid[0], height: grid[1], wrapX: true, size } };
}

/** What main prints about the sessions: which one, of how many, its UI.log turns, and the logs that disagree. */
export function sessionNote(logs) {
    const s = logs.sessions;
    if (!s || (s.count <= 1 && s.warnings.length === 0)) return [];
    const turns = s.first !== null ? ` (UI.log ${s.age ?? "T"}${s.first}-${s.age ?? "T"}${s.last})` : "";
    return [`session ${s.used} of ${s.count}${turns}; session=N reads another`, ...s.warnings.map((w) => `  warning: ${w}`)];
}

/** Our settlements at a turn's start: the last `places:` line, else our foundings (SETTLE_FOUND) and `settlements=`. */
export function settlementsAt(logs, turn, extra = []) {
    const places = logs.ours.places.filter((p) => p.turn <= turn).at(-1);
    if (places) return places.settlements;
    const seen = new Map();
    for (const f of logs.ours.founded) if (f.turn < turn) seen.set(`${f.x},${f.y}`, { x: f.x, y: f.y, town: seen.size > 0, name: "" });
    for (const s of extra) seen.set(`${s.x},${s.y}`, s);
    return [...seen.values()];
}

/** Damage of every unit at a turn's start, carried forward from CombatLog's fights and heals (each matched to a unit by its owner, type and tile). */
export function damageAt(logs, turn) {
    const dmg = new Map();
    const at = logs.movement.at;
    const typeOf = (k) => logs.types.get(k);
    const unitAt = (t, owner, type, x, y) => {
        for (const tt of [t + 1, t]) {
            for (const [k, u] of at.get(tt) ?? []) if (u.owner === owner && u.x === x && u.y === y && (!type || typeOf(k) === type)) return k;
        }
        return null;
    };
    const nearest = (t, owner, type, x, y) => {
        let best = null;
        for (const [k, u] of at.get(t) ?? []) {
            if (u.owner !== owner || (type && typeOf(k) !== type)) continue;
            const d = Math.abs(u.x - x) + Math.abs(u.y - y);
            if (d <= 4 && (!best || d < best.d)) best = { k, d };
        }
        return best?.k ?? null;
    };
    for (const r of logs.combat) {
        if (r.turn >= turn || r.x === null) continue;
        if (r.source === "Unit Heal") {
            const k = unitAt(r.turn, r.att, r.attType, r.x, r.y);
            if (k && r.attHealth !== null) dmg.set(k, Math.max(0, r.attMax - r.attHealth));
            continue;
        }
        if (r.source !== "Unit vs Unit") continue;
        const d = unitAt(r.turn, r.def, r.defType, r.x, r.y);
        if (d && r.defHealth !== null) dmg.set(d, r.destroyed === "Defender" ? 100 : Math.max(0, r.defMax - r.defHealth));
        const tac = logs.tactical.find((a) => a.turn === r.turn && a.owner === r.att && a.to.x === r.x && a.to.y === r.y && a.type === r.attType);
        const a = tac ? key(tac.owner, tac.id) : nearest(r.turn, r.att, r.attType, r.x, r.y);
        if (a && r.attHealth !== null) dmg.set(a, r.destroyed === "Attacker" ? 100 : Math.max(0, r.attMax - r.attHealth));
    }
    return dmg;
}

/** The fights of ours in a turn: CombatLog's rows (not heals), with kills and losses, and how many a general's radius held. */
export function fightsIn(logs, turn) {
    const me = logs.player;
    const rows = logs.combat.filter((r) => r.turn === turn && r.source !== "Unit Heal" && (r.att === me || r.def === me));
    const kills = rows.filter((r) => (r.att === me && r.destroyed === "Defender" && r.source === "Unit vs Unit") || (r.def === me && r.destroyed === "Attacker")).length;
    const losses = rows.filter((r) => (r.def === me && r.destroyed === "Defender" && r.source === "Unit vs Unit") || (r.att === me && r.destroyed === "Attacker")).length;
    const naval = rows.filter((r) => isShip(r.att === me ? r.defType : r.attType)).length;
    // A general's radius: our `fight:` lines (the game's radius), else the old probe's commanders within 1 tile.
    const ours = logs.ours.fights.filter((f) => f.turn === turn);
    const inRadius = ours.length > 0 ? ours.filter((f) => f.gens.length > 0).length
        : logs.ours.oldFights.filter((f) => f.turn === turn && f.near.some((d) => d <= 1)).length;
    return { fights: rows.length, naval, kills, losses, inRadius, logged: ours.length || logs.ours.oldFights.filter((f) => f.turn === turn).length, rows };
}

/** Each independent's births: the turns its new units are first seen (AI_MovementPlanning), the plain gaps, bursts (2+ in a turn). */
export function births(logs) {
    const tribes = logs.indep.tribes;
    const by = new Map();
    for (const [k, t] of logs.movement.first) {
        const owner = Number(k.split(":")[0]);
        if (tribes.size > 0 ? !tribes.has(owner) : owner < 10) continue;
        if (!by.has(owner)) by.set(owner, new Map());
        const m = by.get(owner);
        m.set(t, [...(m.get(t) ?? []), logs.types.get(k) ?? "?"]);
    }
    const out = [];
    for (const [owner, m] of by) {
        // The village's starting units (seen the turn after it was made) are no births.
        const start = tribes.get(owner)?.turn ?? Math.min(...m.keys()) - 1;
        const turns = [...m.keys()].filter((t) => t > start + 1).sort((a, b) => a - b);
        const plain = turns.filter((t) => m.get(t).length === 1);
        const bursts = turns.filter((t) => m.get(t).length > 1).map((t) => ({ turn: t, types: m.get(t) }));
        // The gap from each birth (plain or a burst) to the next plain one: a burst restarts the clock (p28: 57 then 65).
        const gaps = [];
        for (let i = 1; i < turns.length; i++) if (m.get(turns[i]).length === 1) gaps.push({ turn: turns[i], gap: turns[i] - turns[i - 1] });
        out.push({ owner, village: tribes.get(owner) ?? null, turns, plain, bursts, gaps, types: m });
    }
    return out.sort((a, b) => a.owner - b.owner);
}

/** The most units of an owner alive at once (first to last seen) over turns [a, b]: a village's cap in the simulator. */
export function mostAlive(logs, owner, a, b) {
    let most = 0;
    for (let t = a; t <= b; t++) {
        let n = 0;
        for (const [k, first] of logs.movement.first) if (first <= t && (logs.movement.last.get(k) ?? -1) >= t && k.startsWith(`${owner}:`)) n++;
        most = Math.max(most, n);
    }
    return most;
}

/** A village's cadence at a turn: the median of the last 3 gaps before it, and its next birth (from the last one). */
export function cadenceAt(b, turn) {
    const before = b.gaps.filter((g) => g.turn < turn).slice(-3).map((g) => g.gap);
    const every = median(before) ?? 8;
    const last = b.turns.filter((t) => t < turn).at(-1);
    return { every, next: last === undefined ? turn : Math.max(turn, last + every) };
}

// ---- the table and the scene --------------------------------------------------------------------------------------------

const hexOf = (logs) => new HexGrid(logs.map.width, logs.map.height, logs.map.wrapX);
// Ships by name, for a type no age's data names.
const SHIP_NAMES = /GALLEY|QUADRIREME|BIREME|COG|CARRACK|FRIGATE|IRONCLAD|DESTROYER|CRUISER|BATTLESHIP|SUBMARINE|PRIVATEER|DREADNOUGHT|_SHIP\b/;
let seaTypes = null;

/**
 * A ship (or a Fleet Commander, a carrier): DOMAIN_SEA in the game's data of any age (tests/fixtures/gameinfo-<age>.json; a
 * type keeps its domain), else by its name. The name list alone missed the Dhow and the Tankwa, the Galleon, the pirates'
 * Corsairs, the Cetbang, the Kalam, the Ottru and the Mikasa: their fights counted as land fights and the scene put them on
 * land as raiders.
 */
export function isShip(type) {
    if (!type) return false;
    if (!seaTypes) {
        seaTypes = new Map();
        for (const age of Object.values(AGE_FILES)) {
            const file = join(here, "..", "tests", "fixtures", `gameinfo-${age}.json`);
            if (!existsSync(file)) continue;
            for (const u of JSON.parse(readFileSync(file, "utf8")).tables?.Units ?? []) seaTypes.set(u.UnitType, u.Domain === "DOMAIN_SEA");
        }
    }
    return seaTypes.has(type) ? seaTypes.get(type) : SHIP_NAMES.test(type);
}

/**
 * Units seen before a turn and after it but not at it: packed in an army (AI_MovementPlanning lists no packed unit: game 60's
 * Spearman 1835030 after its ADD_TO_ARMY at T133, p28's raid party of T57 until it unpacked by our land at T64-T66). Each goes
 * with its owner's nearest commander of its own domain then (a ship with a Fleet Commander; its last tile before the turn,
 * else the first commander). @returns [{ key, owner, id, cmdr: the commander's movement entry or null }]
 */
export function packedAt(logs, turn) {
    const now = logs.movement.at.get(turn) ?? new Map();
    const before = logs.movement.at.get(turn - 1) ?? new Map();
    const grid = hexOf(logs);
    const out = [];
    for (const [k, first] of logs.movement.first) {
        if (first >= turn || (logs.movement.last.get(k) ?? -1) <= turn || now.has(k)) continue;
        const [owner, id] = k.split(":").map(Number);
        const was = before.get(k);
        const sea = isShip(logs.types.get(k));
        const cmdrs = [...now.entries()].filter(([ck, c]) => c.owner === owner && /_COMMANDER$/.test(logs.types.get(ck) ?? "") && isShip(logs.types.get(ck)) === sea);
        cmdrs.sort(([, a], [, b]) => (was ? grid.distanceXY(a.x, a.y, was.x, was.y) - grid.distanceXY(b.x, b.y, was.x, was.y) : 0));
        out.push({ key: k, owner, id, cmdr: cmdrs[0]?.[1] ?? null });
    }
    return out;
}

/** The units of a turn's start: ours and the hostile ones within `radius` of our settlements (types, damage, owners). */
export function unitsAt(logs, turn, { radius = 6, settlements = [], ships = false, civilians = false, isCivilian = civilians ? () => false : civilianTest() } = {}) {
    const grid = hexOf(logs);
    const towns = settlementsAt(logs, turn, settlements);
    const dmg = damageAt(logs, turn);
    const wars = warsAt(logs.wars, turn);
    const tribes = logs.indep.tribes;
    const ours = [];
    const theirs = [];
    const near = (x, y) => towns.some((t) => grid.distanceXY(t.x, t.y, x, y) <= radius);
    const independent = (o) => (tribes.size > 0 ? tribes.has(o) : o >= 10);
    for (const [k, u] of logs.movement.at.get(turn) ?? []) {
        const type = logs.types.get(k) ?? null;
        if (!type) continue;
        if (!ships && isShip(type)) continue;
        const entry = { id: u.id, owner: u.owner, type, x: u.x, y: u.y, d: dmg.get(k) ?? 0, moves: u.moves };
        if (u.owner === logs.player) {
            if (!civilians && isCivilian(type)) continue;
            ours.push(entry);
        } else if (wars.has(u.owner) && near(u.x, u.y)) {
            theirs.push({ ...entry, independent: independent(u.owner) });
        }
    }
    // Packed soldiers: ours from our `units:` line (ids), else the units the movement log lost for a turn (packedAt), else the
    // old `army:` line's types; theirs from the movement log, with their commander (`packed`, its id).
    const line = logs.ours.units.get(turn);
    const packed = [];
    const hidden = packedAt(logs, turn).filter((h) => h.cmdr && (ships || !isShip(logs.types.get(h.key))));
    if (line) {
        for (const c of line.cmdrs) for (const m of c.packed ?? []) packed.push({ ...m, cmdr: c.id });
    } else if (hidden.some((h) => h.owner === logs.player)) {
        for (const h of hidden.filter((x) => x.owner === logs.player)) packed.push({ id: h.id, type: logs.types.get(h.key) ?? "?", cmdr: h.cmdr.id, d: dmg.get(h.key) ?? 0 });
    } else {
        const armies = [...logs.ours.armies.entries()].filter(([t]) => t < turn).at(-1)?.[1] ?? [];
        let n = 0;
        for (const a of armies) {
            const [x, y] = a.cmdr.split(",").map(Number);
            const c = ours.find((u) => /_COMMANDER$/.test(u.type) && u.x === x && u.y === y);
            for (const type of a.types) packed.push({ id: 900000 + n++, type, cmdr: c?.id ?? null, synthetic: true });
        }
    }
    for (const h of hidden) {
        const type = logs.types.get(h.key);
        if (h.owner === logs.player || !type || !wars.has(h.owner) || !near(h.cmdr.x, h.cmdr.y)) continue;
        theirs.push({ id: h.id, owner: h.owner, type, x: h.cmdr.x, y: h.cmdr.y, d: dmg.get(h.key) ?? 0, packed: h.cmdr.id, independent: independent(h.owner) });
    }
    return { towns, ours, theirs, packed, line: line ?? null };
}

/** A commander's experience at a turn's start: the last `units:` or `xp:` line before it. */
export function experienceAt(logs, id, turn) {
    for (let t = turn; t >= turn - 1; t--) {
        const c = logs.ours.units.get(t)?.cmdrs.find((x) => x.id === id);
        if (c && Number.isFinite(c.level)) return { level: c.level, points: c.xp, next: c.next };
    }
    const x = logs.ours.xp.filter((r) => r.id === id && r.turn < turn).at(-1);
    return x ? { level: x.level, points: x.xp, next: x.next } : null;
}

/** The XP points a commander holds in all (its levels' thresholds plus its points). */
export const totalXp = (xp, levels) => (xp ? levels.slice(0, xp.level).reduce((a, b) => a + b, 0) + xp.points : null);

/** Level thresholds from a commander's next-level need (Standard: 15 × (level + 1): game 60's 15, 30, 45). */
export function levelsFrom(xp) {
    const k = xp && xp.next > 0 ? xp.next / (xp.level + 1) : 15;
    return Array.from({ length: 8 }, (_, i) => Math.round(k * (i + 1)));
}

/**
 * The scene for tools/fight-sim.mjs: the units at `from`'s start, the villages of the hostile owners (their cadence), the level
 * thresholds, and the game's own record of the `turns` turns (fights, kills, losses, in a general's radius, XP gained).
 */
export function buildScene(logs, { from, turns = 15, radius = 6, reach = 12, settlements = [], unseen = [], ships = false, civilians = false, age = null, isCivilian = civilianTest(age ?? undefined) } = {}) {
    const start = unitsAt(logs, from, { radius: Math.max(radius, reach), settlements, ships, civilians, isCivilian });
    const cmdrs = start.ours.filter((u) => /_COMMANDER$/.test(u.type));
    const xp0 = cmdrs.map((c) => experienceAt(logs, c.id, from)).find(Boolean) ?? null;
    const levels = levelsFrom(xp0);
    const owners = [...new Set(start.theirs.filter((u) => !isCivilian(u.type) && !/_COMMANDER$/.test(u.type)).map((u) => u.owner))];
    const born = births(logs);
    const villages = owners.map((o) => {
        const v = logs.indep.tribes.get(o);
        const b = born.find((x) => x.owner === o);
        if (!v || !b) return null;
        const c = cadenceAt(b, from);
        const kinds = [...new Set(b.plain.filter((t) => t < from).slice(-4).map((t) => b.types.get(t)[0]).filter((t) => t && !isShip(t)))];
        // Seen by us: listed in our last `places:` line, else unless named unseen.
        const places = logs.ours.places.filter((p) => p.turn <= from).at(-1);
        const seen = places ? places.villages.some((x) => x.owner === o) : !unseen.includes(o);
        // Its cap: the most of its units alive at once in the window (the game's own is not logged; 4 at the least).
        const max = Math.max(4, mostAlive(logs, o, from, from + turns - 1));
        return { owner: o, x: v.x, y: v.y, every: c.every, first: c.next - from + 1, spawn: kinds.length ? kinds : ["UNIT_WARRIOR"], max, leash: 2, seen };
    }).filter(Boolean);
    const grid = hexOf(logs);
    // A packed soldier of theirs stands on its commander's tile or the nearest free one (the simulator has no enemy armies).
    const taken = new Set([...start.theirs, ...start.ours].filter((u) => !u.packed).map((u) => `${u.x},${u.y}`));
    const spot = (u) => {
        const tiles = grid.radius(grid.index(u.x, u.y), 2).sort((a, b) => a.ring - b.ring).map((p) => ({ x: grid.x(p.idx), y: grid.y(p.idx) }));
        const t = tiles.find((x) => !taken.has(`${x.x},${x.y}`)) ?? { x: u.x, y: u.y };
        taken.add(`${t.x},${t.y}`);
        return t;
    };
    // Their soldiers only: the simulator lets every enemy unit strike (a scout, a commander would).
    const theirs = start.theirs.filter((u) => !isCivilian(u.type) && !/_COMMANDER$/.test(u.type)).map((u) => {
        const v = villages.find((x) => x.owner === u.owner);
        const at = u.packed ? spot(u) : u;
        // Away from its village: a raider (it walks to our nearest settlement), else a guard.
        return { ...u, x: at.x, y: at.y, raid: !v || grid.distanceXY(v.x, v.y, at.x, at.y) > v.leash + 1 };
    });
    const game = [];
    for (let t = from; t < from + turns; t++) {
        const f = fightsIn(logs, t);
        game.push({ turn: t, fights: f.fights, naval: f.naval, kills: f.kills, losses: f.losses, inRadius: f.inRadius, logged: f.logged });
    }
    const xp = {};
    for (const c of cmdrs) {
        const a = totalXp(experienceAt(logs, c.id, from), levels);
        const b = totalXp(experienceAt(logs, c.id, from + turns), levels);
        if (a !== null && b !== null) xp[c.id] = b - a;
    }
    return {
        source: logs.dir, ...(logs.sessions ? { session: logs.sessions.used } : {}), ...(age ? { age } : {}), from, turns, reach: Math.max(radius, reach), map: { width: logs.map.width, height: logs.map.height, wrapX: logs.map.wrapX },
        levels, settlements: start.towns, villages,
        owners: owners.map((o) => ({ id: o, independent: start.theirs.find((u) => u.owner === o)?.independent ?? true })),
        ours: start.ours.map((u) => ({ id: u.id, type: u.type, x: u.x, y: u.y, damage: u.d, ...(/_COMMANDER$/.test(u.type) ? { xp: experienceAt(logs, u.id, from) ?? undefined } : {}) })),
        packed: start.packed.map((m) => ({ id: m.id, type: m.type, cmdr: m.cmdr, damage: m.d ?? 0 })),
        theirs: theirs.map((u) => ({ id: u.id, owner: u.owner, type: u.type, x: u.x, y: u.y, damage: u.d, raid: u.raid })),
        game, gameXp: xp,
    };
}

/** One turn's lines for the table. */
export function turnLines(logs, turn, opts) {
    const u = unitsAt(logs, turn, opts);
    const f = fightsIn(logs, turn);
    const tok = (e) => `${typeName(e.type)} ${unitToken(e)}`;
    const out = [`T${turn}: ours ${u.ours.length} [${u.ours.map(tok).join(", ")}]${u.packed.length ? ` packed [${u.packed.map((m) => `${typeName(m.type)} ${m.synthetic ? "?" : m.id}>${m.cmdr ?? "?"}`).join(", ")}]` : ""}`];
    out.push(`    near ${u.theirs.length} [${u.theirs.map((e) => `p${e.owner} ${e.packed ? `${typeName(e.type)} ${e.id}>${e.packed}` : tok(e)}`).join(", ")}]`);
    const att = (r) => logs.tactical.find((a) => a.turn === r.turn && a.owner === r.att && a.to.x === r.x && a.to.y === r.y && a.type === r.attType);
    for (const r of f.rows) {
        const a = att(r);
        out.push(`    fight: p${r.att} ${typeName(r.attType)}${a ? ` ${a.id}@${a.from.x},${a.from.y}` : ""} > p${r.def} ${typeName(r.defType)}@${r.x},${r.y} ${r.kind || r.source} dealt ${r.defDmg} took ${r.attDmg}${r.destroyed !== "N/A" ? ` (${r.destroyed.toLowerCase()} destroyed)` : ""}`);
    }
    out.push(`    fights ${f.fights} (naval ${f.naval}), kills ${f.kills}, lost ${f.losses}, in a general's radius ${f.inRadius} of ${f.logged} logged`);
    return out;
}

/** Our civilians (no CORE_CLASS_MILITARY, no commander) by the game data of the age (tests/fixtures/gameinfo-<age>.json). */
const civilianTests = new Map();
export function civilianTest(age = "antiquity") {
    if (!civilianTests.has(age)) civilianTests.set(age, makeCivilianTest(age));
    return civilianTests.get(age);
}

function makeCivilianTest(age) {
    const file = join(here, "..", "tests", "fixtures", `gameinfo-${age}.json`);
    if (!existsSync(file)) return (t) => /SCOUT|SETTLER|FOUNDER|MIGRANT|MERCHANT|MISSIONARY|EXPLORER|ARCHAEOLOGIST|GREAT_PERSON/.test(t);
    const units = JSON.parse(readFileSync(file, "utf8")).tables?.Units ?? [];
    const cls = new Map(units.map((u) => [u.UnitType, u.CoreClass]));
    return (t) => (cls.has(t) ? cls.get(t) !== "CORE_CLASS_MILITARY" && !/_COMMANDER$/.test(t) : /SCOUT|SETTLER|FOUNDER|MIGRANT|MERCHANT|MISSIONARY|EXPLORER/.test(t));
}

function main(argv) {
    const dir = argv.find((a) => !a.includes("=") && !["ships", "civilians", "quiet"].includes(a));
    if (!dir) {
        console.log("usage: node tools/unitmap.mjs <Logs folder> [from=60] [to=75] [radius=6] [player=0] [scene=<out.json>] [settlements=x,y;x,y] [map=WxH] [age=antiquity] [session=N] [ships] [civilians] [quiet]");
        process.exit(1);
    }
    const arg = (k, d) => argv.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? d;
    const from = Number(arg("from", 60));
    const to = Number(arg("to", from + 15));
    const radius = Number(arg("radius", 6));
    const reach = Number(arg("reach", 12));
    const player = Number(arg("player", 0));
    const settlements = (arg("settlements", "") || "").split(";").filter(Boolean).map((s, i) => {
        const [x, y] = s.split(",").map(Number);
        return { x, y, town: i > 0, name: "" };
    });
    const session = arg("session", null);
    const logs = readLogs(dir, { from, to: to + 1, player, session: session === null ? null : Number(session) });
    const map = arg("map", null);
    if (map) {
        const [w, h] = map.split("x").map(Number);
        logs.map = { ...logs.map, width: w, height: h };
    }
    const unseen = (arg("unseen", "") || "").split(",").filter(Boolean).map(Number);
    // The age: age=, else the session's own letter in UI.log (stamped lines), else Antiquity.
    const age = arg("age", AGE_FILES[logs.sessions.age] ?? "antiquity");
    const opts = { radius, reach, settlements, unseen, ships: argv.includes("ships"), civilians: argv.includes("civilians"), age, isCivilian: civilianTest(age) };
    for (const l of sessionNote(logs)) console.log(l);
    console.log(`map ${logs.map.width}x${logs.map.height}${logs.map.size ? ` (${logs.map.size})` : ""}; turns ${from}-${to}; hostile units within ${radius} of our settlements`);
    if (!argv.includes("quiet")) for (let t = from; t <= to; t++) console.log(turnLines(logs, t, opts).join("\n"));
    console.log("births (first seen in AI_MovementPlanning; a burst: several in one turn):");
    for (const b of births(logs)) {
        if (b.turns.length === 0) continue;
        console.log(`  p${b.owner}${b.village ? ` (village ${b.village.x},${b.village.y})` : ""}: ${b.turns.map((t) => (b.types.get(t).length > 1 ? `${t}x${b.types.get(t).length}` : t)).join(" ")}; gaps ${b.gaps.map((g) => g.gap).join(" ")}`);
    }
    const out = arg("scene", null);
    if (out) {
        const scene = buildScene(logs, { from, turns: to - from + 1, ...opts });
        writeFileSync(out, JSON.stringify(scene, null, 1));
        console.log(`scene: ${out}: ${scene.ours.length} of ours, ${scene.packed.length} packed, ${scene.theirs.length} of theirs, villages ${scene.villages.map((v) => `p${v.owner} every ${v.every} first ${v.first}${v.seen ? "" : " unseen"}`).join(", ") || "none"}, levels ${scene.levels.slice(0, 4).join("/")}`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
