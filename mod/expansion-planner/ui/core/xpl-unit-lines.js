/**
 * Our units, the hostile units near us and every fight of ours in UI.log, for later war work and the fight simulator's
 * replays (the user, after game 60: "log our and close enemy units position for later war improvements"). Pure: the lines'
 * format and parser, shared by the engine adapter (data/xpl-unit-log.js) and tools/unitmap.mjs, so the two never drift.
 *
 * Game 60's review: no log rebuilt a fight turn by turn. Our lines named units by type only (`formation:`, `defence:`), the
 * `xp: combat` probe skipped every fight with no commander within 2 tiles (40 of 110 fights logged in T50-T100), and the
 * game's own AI logs have positions by id but not packed armies, plague damage, activity, what we saw, nor which general's
 * radius held a fight.
 *
 * The lines (the turn is in every line's prefix, "[XPL] A67 …": services/xpl-log.js):
 *   units: ours 14 [WARRIOR 851977@65,9 F|786440@66,10 d35 H; SLINGER 1179654@65,12 d38 O>65,11]; cmdrs [ARMY_COMMANDER
 *     262146@69,7 L2 11/45 V {WARRIOR 1310735|1376272 d10}]; theirs 6 [p28 WARRIOR 327680@64,12|720904@64,13 d20]; unseen 2;
 *     centres [65,9 190/200 W]
 *   places: settlements [65,9 C Санкт-Петербург|65,15 T Тула]; villages [p28 53,10 H|p36 72,11 N]
 *   fight: p28 ARCHER 393216@64,11 > ours SLINGER 1179654@65,11 d38 ranged; gen none
 *   fight: ours WARRIOR 851977@65,9 > p36 WARRIOR 196609@66,10 d20 melee; gen 262146 r1 L2 6/45 V was L2 4
 * Unit flags: dN damage, F asleep or fortified, H healing, O on its way (>x,y its destination when the game names one), R on its
 * way to an army as a reinforcement (>x,y its commander's tile), P on a hazardous tile (the plague), ~ afloat; `@-` off the map.
 * A general's `was L<level> <xp>`: its XP when last read (its last fight line, the `xp:` probe), so a fight line shows what the
 * fights since gave it (game 60's W6: the independents' soft cap per fight kind).
 */

export const UNITS_LINE = Object.freeze({
    RADIUS: 6,          // hostile units listed this close to one of our settlements...
    NEAR_OURS: 3,       // ...or to one of our units
    QUIET_TURNS: 10,    // in peace the line is written this often (and when our army changes)
    PARTS_MAX: 4,       // UI.log parts at most (950 bytes each; this line is ASCII): beyond them our units farthest from theirs are counted only
    FIGHTS_MAX: 40,     // fight lines a turn at most (the rest are counted on the next turn's first line)
    LINE_MAX: 950,      // services/xpl-log.js LINE_MAX
});

const ACT = { SLEEP: "F", HEAL: "H", OPERATION: "O" };

/** "UNIT_WARRIOR" -> "WARRIOR". */
export const typeName = (t) => String(t ?? "?").replace(/^UNIT_/, "");
/** A name safe inside a line: none of the separators. */
export const cleanName = (n) => String(n ?? "?").replace(/[;|[\]{}@]/g, " ").trim();

/** One unit: `id@x,y` and its flags. @param u { id, x, y (null: off the map), d, act: "F"|"H"|"O"|"R", to: {x, y}, hazard, afloat } */
export function unitToken(u) {
    const at = Number.isFinite(u.x) && Number.isFinite(u.y) ? `${u.x},${u.y}` : "-";
    const flags = [];
    if (u.d > 0) flags.push(`d${Math.round(u.d)}`);
    if (u.act) flags.push(u.to ? `${u.act}>${u.to.x},${u.to.y}` : u.act);
    if (u.hazard) flags.push("P");
    if (u.afloat) flags.push("~");
    return `${u.id}@${at}${flags.map((f) => ` ${f}`).join("")}`;
}

/** The game's activity as our letter (UnitActivityTypes: SLEEP, HEAL, OPERATION; others none). */
export function activityLetter(activity, types) {
    if (!types || activity === undefined || activity === null) return null;
    for (const [name, letter] of Object.entries(ACT)) if (types[name] !== undefined && activity === types[name]) return letter;
    return null;
}

/** Units grouped by a key ("WARRIOR", "p28 WARRIOR"), each group "KEY tok|tok". */
function grouped(list, key) {
    const by = new Map();
    for (const u of list) {
        const k = key(u);
        if (!by.has(k)) by.set(k, []);
        by.get(k).push(u);
    }
    return [...by.entries()].map(([k, us]) => `${k} ${us.map(unitToken).join("|")}`).join("; ");
}

/**
 * The `units:` line. @param s { ours: [unit + type], cmdrs: [unit + type, level, xp, next, role, packed: [unit + type]],
 *   theirs: [unit + type, owner], unseen, centres: [{ x, y, health, max, walled }], far }
 */
export function formatUnitsLine(s) {
    const cmdr = (c) => {
        const xp = Number.isFinite(c.level) ? ` L${c.level} ${c.xp ?? "?"}/${c.next ?? "?"}` : "";
        const role = c.role ? ` ${String(c.role).charAt(0)}` : "";
        const packed = c.packed?.length ? ` {${grouped(c.packed, (m) => typeName(m.type))}}` : "";
        return `${typeName(c.type)} ${unitToken(c)}${xp}${role}${packed}`;
    };
    const fields = [
        `ours ${s.ours.length} [${grouped(s.ours, (u) => typeName(u.type))}]`,
        `cmdrs [${(s.cmdrs ?? []).map(cmdr).join("; ")}]`,
        `theirs ${s.theirs.length} [${grouped(s.theirs, (u) => `p${u.owner} ${typeName(u.type)}`)}]`,
    ];
    if (s.unseen > 0) fields.push(`unseen ${s.unseen}`);
    if (s.centres?.length) fields.push(`centres [${s.centres.map((c) => `${c.x},${c.y} ${c.health}/${c.max}${c.walled ? " W" : ""}`).join("; ")}]`);
    if (s.far > 0) fields.push(`far ${s.far}`);
    return `units: ${fields.join("; ")}`;
}

/**
 * The line within UNITS_LINE.PARTS_MAX parts: our units farthest from any listed unit of theirs (`near`, their distance;
 * none listed: all alike) are left out and counted (`far`), commanders never. @returns the line
 */
export function fitUnitsLine(s, maxChars = UNITS_LINE.PARTS_MAX * UNITS_LINE.LINE_MAX) {
    let line = formatUnitsLine(s);
    if (line.length <= maxChars) return line;
    const ours = [...s.ours].sort((a, b) => (a.near ?? Infinity) - (b.near ?? Infinity));
    let far = s.far ?? 0;
    while (line.length > maxChars && ours.length > 0) {
        ours.pop();
        far++;
        line = formatUnitsLine({ ...s, ours, far });
    }
    return line;
}

/**
 * Is the `units:` line due this turn? Every turn while a unit of theirs (or one we cannot see) is near or we fought last turn;
 * else when our army changed, every QUIET_TURNS, on the first check after a load, and when the turn went back (a new age, an
 * earlier save). @param f { turn, last: { turn, army } | null, army (our military ids), hostiles, unseen, foughtLastTurn }
 * @returns null or why ("FIRST" | "HOSTILES" | "FOUGHT" | "ARMY" | "QUIET" | "BACK")
 */
export function unitsLineDue(f) {
    if (!f.last) return "FIRST";
    if (f.hostiles > 0 || f.unseen > 0) return "HOSTILES";
    if (f.foughtLastTurn) return "FOUGHT";
    if (f.turn < f.last.turn) return "BACK";
    if (f.army !== f.last.army) return "ARMY";
    if (f.turn - f.last.turn >= UNITS_LINE.QUIET_TURNS) return "QUIET";
    return null;
}

/** The `places:` line. @param p { settlements: [{ x, y, town, name }], villages: [{ owner, x, y, rel: "H"|"N"|"F"|"?" }] } */
export function formatPlaces(p) {
    const s = (p.settlements ?? []).map((c) => `${c.x},${c.y} ${c.town ? "T" : "C"} ${cleanName(c.name)}`).join("|");
    const v = (p.villages ?? []).map((c) => `p${c.owner} ${c.x},${c.y} ${c.rel ?? "?"}`).join("|");
    return `places: settlements [${s}]; villages [${v}]`;
}

/**
 * The `fight:` line. @param f { att, def: { ours, owner, type ("DISTRICT" for one), id, x, y, d }, kind: "melee" | "ranged" |
 *   "air" | "naval" | "district", gens: [{ id, r, level, xp, next, role, was: { level, xp } (optional) }] }
 */
export function formatFight(f) {
    const side = (s) => `${s.ours ? "ours" : `p${s.owner}`} ${typeName(s.type)} ${unitToken(s)}`;
    const was = (w) => (w && Number.isFinite(w.level) && Number.isFinite(w.xp) ? ` was L${w.level} ${w.xp}` : "");
    const gen = (g) => `${g.id} r${g.r}${Number.isFinite(g.level) ? ` L${g.level} ${g.xp ?? "?"}/${g.next ?? "?"}` : ""}${g.role ? ` ${String(g.role).charAt(0)}` : ""}${was(g.was)}`;
    return `fight: ${side(f.att)} > ${side(f.def)} ${f.kind}; gen ${f.gens?.length ? f.gens.map(gen).join("|") : "none"}`;
}

// ---- reading ---------------------------------------------------------------------------------------------------------

/** Splits on `sep` outside brackets. */
export function splitTop(text, sep) {
    const out = [];
    let depth = 0;
    let cur = "";
    for (const ch of text) {
        if ("[{(".includes(ch)) depth++;
        if ("]})".includes(ch)) depth--;
        if (ch === sep && depth === 0) {
            out.push(cur);
            cur = "";
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim());
}

// A unit's flags (unitToken): dN, F | H | O | R with its destination, P, ~.
const FLAGS = String.raw`(?: (?:d\d+|[FHOR](?:>-?\d+,-?\d+)?|P|~))*`;
const UNIT_RE = new RegExp(String.raw`^(\d+)@(?:(-?\d+),(-?\d+)|-)(${FLAGS})$`);
// A commander: its unit, `L<level> <xp>/<next>`, its role and its packed soldiers.
const CMDR_RE = new RegExp(String.raw`^(\S+) (\d+@(?:-?\d+,-?\d+|-)${FLAGS})(?: L(\d+) (\d+|\?)\/(\d+|\?))?(?: ([VB]))?(?: \{(.*)\})?$`);

/** One unit token back: { id, x, y (null off the map), d, act, to, hazard, afloat } or null. */
export function parseUnitToken(text) {
    const m = UNIT_RE.exec(String(text).trim());
    if (!m) return null;
    const u = { id: Number(m[1]), x: m[2] === undefined ? null : Number(m[2]), y: m[3] === undefined ? null : Number(m[3]), d: 0, act: null, to: null, hazard: false, afloat: false };
    for (const f of m[4].trim().split(" ").filter(Boolean)) {
        let k;
        if ((k = /^d(\d+)$/.exec(f))) u.d = Number(k[1]);
        else if ((k = /^([FHOR])(?:>(-?\d+),(-?\d+))?$/.exec(f))) {
            u.act = k[1];
            if (k[2] !== undefined) u.to = { x: Number(k[2]), y: Number(k[3]) };
        } else if (f === "P") u.hazard = true;
        else if (f === "~") u.afloat = true;
    }
    return u;
}

/** "TYPE tok|tok; TYPE tok" (an optional owner first: "p28 TYPE tok") back into units. */
function parseGroups(inner, withOwner) {
    const out = [];
    for (const g of splitTop(inner, ";")) {
        const m = withOwner ? /^p(\d+) (\S+) (.*)$/.exec(g) : /^(\S+) (.*)$/.exec(g);
        if (!m) continue;
        const [owner, type, rest] = withOwner ? [Number(m[1]), m[2], m[3]] : [null, m[1], m[2]];
        for (const t of rest.split("|")) {
            const u = parseUnitToken(t);
            if (u) out.push({ ...u, type: `UNIT_${type}`, ...(withOwner ? { owner } : {}) });
        }
    }
    return out;
}

const inner = (field) => (/\[(.*)\]$/.exec(field) ?? [])[1] ?? "";

/** A `units:` line's text (the message, its parts joined) back into { ours, cmdrs, theirs, unseen, centres, far }. */
export function parseUnitsLine(text) {
    const body = String(text).replace(/^.*?units: /, "");
    const s = { ours: [], cmdrs: [], theirs: [], unseen: 0, centres: [], far: 0 };
    for (const f of splitTop(body, ";")) {
        if (f.startsWith("ours ")) s.ours = parseGroups(inner(f), false);
        else if (f.startsWith("theirs ")) s.theirs = parseGroups(inner(f), true);
        else if (f.startsWith("cmdrs ")) {
            for (const g of splitTop(inner(f), ";")) {
                const m = CMDR_RE.exec(g);
                if (!m) continue;
                const c = { ...parseUnitToken(m[2]), type: `UNIT_${m[1]}` };
                if (m[3] !== undefined) Object.assign(c, { level: Number(m[3]), xp: Number(m[4]), next: Number(m[5]) });
                c.role = m[6] === "V" ? "VANGUARD" : m[6] === "B" ? "BASTION" : null;
                c.packed = m[7] ? parseGroups(m[7], false) : [];
                s.cmdrs.push(c);
            }
        } else if (f.startsWith("unseen ")) s.unseen = Number(f.slice(7)) || 0;
        else if (f.startsWith("far ")) s.far = Number(f.slice(4)) || 0;
        else if (f.startsWith("centres ")) {
            for (const g of splitTop(inner(f), ";")) {
                const m = /^(-?\d+),(-?\d+) (\d+)\/(\d+)( W)?$/.exec(g);
                if (m) s.centres.push({ x: Number(m[1]), y: Number(m[2]), health: Number(m[3]), max: Number(m[4]), walled: !!m[5] });
            }
        }
    }
    return s;
}

/** A `places:` line back into { settlements: [{ x, y, town, name }], villages: [{ owner, x, y, rel }] }. */
export function parsePlaces(text) {
    const body = String(text).replace(/^.*?places: /, "");
    const out = { settlements: [], villages: [] };
    for (const f of splitTop(body, ";")) {
        if (f.startsWith("settlements ")) {
            for (const t of inner(f).split("|").filter(Boolean)) {
                const m = /^(-?\d+),(-?\d+) ([CT])(?: (.*))?$/.exec(t.trim());
                if (m) out.settlements.push({ x: Number(m[1]), y: Number(m[2]), town: m[3] === "T", name: m[4] ?? "" });
            }
        } else if (f.startsWith("villages ")) {
            for (const t of inner(f).split("|").filter(Boolean)) {
                const m = /^p(\d+) (-?\d+),(-?\d+)(?: (\S+))?$/.exec(t.trim());
                if (m) out.villages.push({ owner: Number(m[1]), x: Number(m[2]), y: Number(m[3]), rel: m[4] ?? "?" });
            }
        }
    }
    return out;
}

const SIDE_RE = new RegExp(String.raw`^(ours|p(\d+)) (\S+) (\d+@(?:-?\d+,-?\d+|-)${FLAGS})$`);

/** A `fight:` line back into { att, def, kind, gens } or null. */
export function parseFight(text) {
    const m = /fight: (.*) > (.*) (melee|ranged|air|naval|district); gen (.*)$/.exec(String(text));
    if (!m) return null;
    const side = (t) => {
        const s = SIDE_RE.exec(t.trim());
        if (!s) return null;
        return { ...parseUnitToken(s[4]), ours: s[1] === "ours", owner: s[2] === undefined ? null : Number(s[2]), type: s[3] === "DISTRICT" ? "DISTRICT" : `UNIT_${s[3]}` };
    };
    const att = side(m[1]);
    const def = side(m[2]);
    if (!att || !def) return null;
    const gens = m[4] === "none" ? [] : m[4].split("|").map((g) => {
        const k = /^(\d+) r(\d+)(?: L(\d+) (\d+|\?)\/(\d+|\?))?(?: ([VB]))?(?: was L(\d+) (\d+))?$/.exec(g.trim());
        if (!k) return null;
        const gen = { id: Number(k[1]), r: Number(k[2]), level: k[3] === undefined ? null : Number(k[3]), xp: Number(k[4]), next: Number(k[5]), role: k[6] === "V" ? "VANGUARD" : k[6] === "B" ? "BASTION" : null };
        return k[7] === undefined ? gen : { ...gen, was: { level: Number(k[7]), xp: Number(k[8]) } };
    }).filter(Boolean);
    return { att, def, kind: m[3], gens };
}

/**
 * One UI.log line (`[date]\t[XPL] A67 WARN text`) or a review's x.txt line (`A66 16:51:18 text`, its turn the review's own)
 * read: { stamp: "A67" | null, age, turn, level, text, part: [i, n] | null }; null when it is not ours.
 */
export function readLine(raw) {
    let s = String(raw).replace(/\s+$/, "");
    let stamp = null;
    let time = null;
    const ui = /^\[[^\]]*?(\d\d:\d\d:\d\d)?\]\s+\[XPL\]\s?(.*)$/.exec(s) ?? /^()\[XPL\]\s?(.*)$/.exec(s);
    if (ui) {
        time = ui[1] || null;
        s = ui[2];
    }
    else {
        const x = /^([AEMT]\d+) (\d\d:\d\d:\d\d) (.*)$/.exec(s);
        if (!x) return null;
        stamp = x[1];
        time = x[2];
        s = x[3];
    }
    // The line's own stamp wins over a review's.
    const own = /^([AEMT])(\d+) (.*)$/.exec(s);
    if (own) {
        stamp = `${own[1]}${own[2]}`;
        s = own[3];
    }
    const lv = /^(WARN|ERROR|DEBUG) (.*)$/.exec(s);
    const level = lv ? lv[1] : "INFO";
    if (lv) s = lv[2];
    let part = null;
    const p = / \[(\d+)\/(\d+)\]$/.exec(s);
    if (p) {
        part = [Number(p[1]), Number(p[2])];
        s = s.slice(0, p.index);
        if (part[0] > 1) s = s.replace(/^… /, "");
    }
    const sm = stamp ? /^([AEMT])(\d+)$/.exec(stamp) : null;
    return { stamp, age: sm ? sm[1] : null, turn: sm ? Number(sm[2]) : null, level, time, text: s, part };
}

/**
 * Lines read (readLine) with their numbered parts put together: [{ stamp, age, turn, level, time, text }]. A part whose
 * siblings are missing (a cut log) is kept as it is.
 */
export function joinParts(lines) {
    const out = [];
    let open = null;
    for (const l of lines) {
        if (!l) continue;
        if (!l.part) {
            if (open) out.push(open);
            open = null;
            out.push({ ...l });
            continue;
        }
        const [i, n] = l.part;
        if (i === 1 || !open || open.part[1] !== n || open.part[0] !== i - 1) {
            if (open) out.push(open);
            open = { ...l, part: [i, n] };
        } else {
            open.text += l.text;
            open.part = [i, n];
        }
        if (i === n) {
            out.push(open);
            open = null;
        }
    }
    if (open) out.push(open);
    return out.map(({ part: _p, ...rest }) => rest);
}
