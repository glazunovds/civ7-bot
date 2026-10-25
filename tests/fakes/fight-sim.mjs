// A fight simulator over the fake engine (the user, 23 October, after game 58: "the commander earned some XP but stayed in
// the city instead of moving more units toward the village and constantly fighting, swapping injured units; we need a fights
// simulator test so we will have an idea how to implement it better").
//
// It carries out the autopilot's orders the moment they are sent (moves, melee and ranged attacks, focused attacks, packing
// and unpacking, swaps, dispersal, a declaration of war), resolves each fight with the game's damage formula, gives our land
// commanders XP by the game's own parameters, heals units that rested, and plays the independents' turn: their village spawns
// soldiers who guard it and strike what comes near (or raid our nearest settlement). Each turn runs the autopilot's unit
// steps in the hud's order (threats, strikes and the field fight, the unit orders, the second strike).
//
// The rules (research/game58, the logs of games 57-58):
//  - damage = 30 × e^(0.04 × (attacker − defender strength)) for each side of a melee fight, the defender's side only for a
//    ranged one (CombatLog.csv, 2,243 fights: base 29.5, spread ±18%); strength −1 for every 10 damage;
//  - healing for a unit that neither moved nor fought: 20 on our settlement, 15 on our land, 10 elsewhere, 5 next to an enemy
//    village (CombatLog's heal rows: 15, 10, 20, 5 most often);
//  - XP for each fight of a soldier within a commander's radius (1): melee 2 / ranged 1, +1 when ours attacked, +2 for a kill,
//    at most 10; against independents only 1 from level 2 on (EXPERIENCE_* in UI.log's `commander parameters:` line); 25 for
//    dispersing a village; levels at 7, 15, 23, 30 at Online speed (UI.log `xp:` lines), a scene's own `levels` else (game 60,
//    Standard: 15, 30, 45: 15 × (level + 1)); the points start again at each level, what is over carried;
//  - a soldier in a focused attack gets +2 (COMBAT_FOCUSED_ATTACK_BASE_BONUS);
//  - an assembled army defends as one unit (the Civilopedia's armies page: "If an Assembled Army is attacked, it defends as a
//    single unit, leveraging the combined strength of all its components ... if an Army takes significant damage, it
//    unpacks"): its strongest packed soldier takes the fight, and hurt ARMY_UNPACK_DAMAGE or more the army unpacks around its
//    commander; a commander is caught only alone, with no soldier on its tile or in its army;
//  - a unit resting until healed (UNITOPERATION_REST_UNTIL_HEALED: "Rest until fully healed") wakes at full health.
// What it does not model: terrain, promotions' effects, fortification bonuses, walls, other players, a commander's own
// commands (Commander Attack, Overrun, Force March).

export const SIM = Object.freeze({
    BASE_DAMAGE: 30,
    K: 0.04,
    DAMAGE_PER_STRENGTH: 10,
    HEAL: { CITY: 20, OURS: 15, NEUTRAL: 10, ENEMY: 5 },
    XP: { MELEE: 2, RANGED: 1, ATTACKER: 1, KILL: 2, MAX_ONE: 10, BARB_LEVEL: 2, BARB_SOFT: 1, DISPERSE: 25 },
    LEVELS: [7, 15, 23, 30, 37, 44, 51],
    FOCUS_BONUS: 2,
    RADIUS: 1,
    ARMY_MOVES: 1, // a commander with soldiers packed moves 1 more (the Civilopedia's armies page)
    ARMY_UNPACK_DAMAGE: 50, // "significant damage": an army whose defending soldier is hurt this much unpacks (our reading)
});

const NO = -9999;

/**
 * @param world the fake world (installFakeEngine's) @param fake its return ({ sent, grid, info })
 * @param options { village: { x, y, owner, spawn: [types], every, first, max, leash, raid } (or `villages`: several, each its
 *   own owner), ours: settlement tiles that are our land, levels: the XP each level needs (default SIM.LEVELS), random: a
 *   seeded spread of ±18% (else the expected damage), seed }. A village spawns on the sim's turn `first` (default 1), then
 *   every `every`; an enemy unit with `raid` walks to our nearest settlement, others keep within `leash` of their owner's
 *   village. No enemy steps onto our settlement's centre (its district must be taken first: the simulator has no districts).
 */
export function createFightSim(world, fake, options = {}) {
    const g = globalThis;
    const grid = fake.grid;
    const dist = (a, b) => grid.distanceXY(a.x, a.y, b.x, b.y);
    let seed = options.seed ?? 1;
    const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
    const spread = () => (options.random ? 0.82 + 0.36 * rand() : 1);
    // The XP each level needs: SIM.LEVELS (Online), or the scene's game speed (Standard doubles them: game 60's 15, 30, 45, 60).
    const levels = options.levels ?? SIM.LEVELS;
    const stats = {
        turns: 0, combats: 0, inRadius: 0, kills: 0, losses: [], dispersed: null, commanderDefeats: 0,
        xp: new Map(), // commander id -> XP gained
        births: [],    // [{ turn, owner, type }]: the villages' new soldiers
        log: [],
    };
    let nextEnemyId = Math.max(5000, ...(world.enemies ?? []).map((e) => (Number(e.id) || 0) + 1));
    // The villages (game 60: raids on four settlements from far villages); each its own owner, spawn cadence and dispersal.
    const villages = (options.villages ?? (options.village ? [options.village] : [])).map((v) => ({ ...v }));
    const live = (v) => !v.dispersed;
    // Each enemy's home: its owner's village, while it stands.
    const homeOf = (e) => villages.find((v) => live(v) && v.owner === e.owner) ?? null;

    // ---- units ----
    const defOf = (type) => g.GameInfo.Units.lookup(type);
    const statOf = (type) => g.GameInfo.Unit_Stats.lookup(type) ?? {};
    const melee = (type) => Number(statOf(type).Combat) || 0;
    const rangedS = (type) => Number(statOf(type).RangedCombat) || 0;
    const rangeOf = (type) => Number(statOf(type).Range) || 0;
    const isCommander = (u) => !!u && (u.commander ?? /_COMMANDER$/.test(u.type));
    const isSoldier = (type) => defOf(type)?.CoreClass === "CORE_CLASS_MILITARY";
    const strength = (u, kind) => Math.max(1, (kind === "ranged" ? rangedS(u.type) : melee(u.type)) - Math.floor((u.damage ?? 0) / SIM.DAMAGE_PER_STRENGTH));
    const damage = (a, d) => Math.max(1, Math.round(SIM.BASE_DAMAGE * Math.exp(SIM.K * (a - d)) * spread()));
    const expected = (a, d) => Math.max(1, Math.round(SIM.BASE_DAMAGE * Math.exp(SIM.K * (a - d))));
    const ours = () => world.units ?? [];
    const ourUnit = (id) => ours().find((u) => u.id === (id?.id ?? id));
    const onMap = (u) => u.onMap !== false && u.x !== NO;
    const enemies = () => world.enemies ?? [];
    const enemyAt = (x, y) => enemies().find((e) => e.x === x && e.y === y && e.onMap !== false);
    const ourSoldierAt = (x, y, but) => ours().find((u) => u !== but && onMap(u) && u.x === x && u.y === y && isSoldier(u.type));
    const ourAnyAt = (x, y) => ours().filter((u) => onMap(u) && u.x === x && u.y === y);
    const locOf = (idx) => ({ x: grid.x(idx), y: grid.y(idx) });
    const tilesNear = (at, r) => grid.radius(grid.index(at.x, at.y), r).map((i) => locOf(typeof i === "number" ? i : i.idx));
    const ourLand = (x, y) => (options.ours ?? []).some((c) => dist(c, { x, y }) <= 2);
    const ourSettlement = (x, y) => (world.cities ?? []).some((c) => c.owner === 0 && c.x === x && c.y === y);
    const nearVillage = (x, y) => villages.some((v) => live(v) && dist(v, { x, y }) <= 1);
    const armyKey = (u) => `0:${u.army}`;
    const packedIn = (cmdr) => ours().filter((u) => u !== cmdr && u.onMap === false && u.army === cmdr.army);
    const syncArmy = (cmdr) => {
        world.armies ??= {};
        world.armies[armyKey(cmdr)] = { x: cmdr.x, y: cmdr.y, capacity: 4, unitCount: packedIn(cmdr).length };
    };
    const baseMoves = (u) => Number(defOf(u.type)?.BaseMoves) || 2;

    // Commanders: an army each, XP from 0.
    for (const u of ours()) {
        if (!isCommander(u)) continue;
        u.army ??= 100 + u.id;
        u.xp ??= { level: 0, points: 0, next: levels[0] };
        u.promotions ??= { can: false, has: [], earnable: [] };
        stats.xp.set(u.id, 0);
        syncArmy(u);
    }

    // ---- what the game answers ----
    world.combat = (id, at) => {
        const u = ourUnit(id);
        const e = enemyAt(at.x, at.y);
        if (!u || !e) return null;
        const r = rangeOf(u.type) > 0 && rangedS(u.type) > melee(u.type);
        return r ? { dealt: expected(strength(u, "ranged"), strength(e, "melee")), taken: 0 }
            : { dealt: expected(strength(u, "melee"), strength(e, "melee")), taken: expected(strength(e, "melee"), strength(u, "melee")) };
    };
    world.rangeTargets = (id) => {
        const u = ourUnit(id);
        if (!u || !onMap(u) || (u.attacks ?? 1) <= 0 || rangeOf(u.type) <= 0) return [];
        return enemies().filter((e) => e.onMap !== false && dist(u, e) <= rangeOf(u.type)).map((e) => ({ x: e.x, y: e.y }));
    };
    world.commandRadius = (id) => {
        const u = ourUnit(id);
        return u && onMap(u) ? tilesNear(u, SIM.RADIUS).map((t) => grid.index(t.x, t.y)) : [];
    };
    const radiusOf = (c) => SIM.RADIUS + ((c.promotions?.has ?? []).includes("PROMOTION_COMMENDATION_ARMY_MERIT") ? 1 : 0);
    const inRadius = (c, u) => onMap(c) && onMap(u) && dist(c, u) <= radiusOf(c);
    const freeLand = (at, r, forSoldier) => tilesNear(at, r).filter((t) => !enemyAt(t.x, t.y) && !(forSoldier && ourSoldierAt(t.x, t.y)) && !villages.some((v) => live(v) && t.x === v.x && t.y === v.y));
    const focusTargets = (cmdr, ranged) => {
        const near = ours().filter((u) => !isCommander(u) && onMap(u) && (u.attacks ?? 1) > 0 && inRadius(cmdr, u));
        return enemies().filter((e) => e.onMap !== false && near.some((u) => (ranged ? rangeOf(u.type) > 0 && rangedS(u.type) > melee(u.type) && dist(u, e) <= rangeOf(u.type)
            : !(rangedS(u.type) > melee(u.type)) && dist(u, e) === 1)));
    };
    world.unitCommandResult = (id, op, args) => {
        const u = ourUnit(id);
        if (!u) return { Success: false };
        const at = args?.X !== undefined;
        switch (op) {
            case "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED":
            case "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE": {
                const t = focusTargets(u, op.endsWith("RANGED"));
                return { Success: t.length > 0, Plots: t.map((e) => grid.index(e.x, e.y)) };
            }
            case "UNITCOMMAND_UNPACK_ARMY": {
                if (!isCommander(u) || packedIn(u).length === 0) return { Success: false };
                return { Success: true, ...(at ? {} : { Plots: freeLand(u, 1, true).map((t) => grid.index(t.x, t.y)) }) };
            }
            case "UNITCOMMAND_ADD_TO_ARMY": {
                const cmdrs = ours().filter((c) => isCommander(c) && onMap(c) && dist(c, u) <= 1 && packedIn(c).length < 4);
                return { Success: cmdrs.length > 0 && isSoldier(u.type), Plots: cmdrs.map((c) => grid.index(c.x, c.y)) };
            }
            case "UNITCOMMAND_REMOVE_FROM_ARMY": {
                const c = ours().find((x) => isCommander(x) && x.army === u.army);
                return c ? { Success: true, Plots: freeLand(c, 1, true).map((t) => grid.index(t.x, t.y)) } : { Success: false };
            }
            case "UNITCOMMAND_WAKE":
            case "UNITCOMMAND_CANCEL":
            case "UNITCOMMAND_PROMOTE":
                return { Success: true };
            default:
                return { Success: false };
        }
    };
    world.unitCanStart = (id, op, args) => {
        const u = ourUnit(id);
        if (op === "UNITOPERATION_SWAP_UNITS" && args?.X !== undefined) return { Success: !!u && !!ourSoldierAt(args.X, args.Y, u) && dist(u, { x: args.X, y: args.Y }) === 1 };
        if (op === "UNITOPERATION_SWAP_UNITS") return { Success: !!u };
        return null;
    };

    // ---- fights ----
    const note = (text) => stats.log.push(`T${g.Game.turn} ${text}`);
    const xpFor = (c, amount, independent) => {
        let a = Math.min(SIM.XP.MAX_ONE, amount);
        if (independent && c.xp.level >= SIM.XP.BARB_LEVEL) a = Math.min(a, SIM.XP.BARB_SOFT);
        c.xp.points += a;
        stats.xp.set(c.id, (stats.xp.get(c.id) ?? 0) + a);
        while (c.xp.points >= c.xp.next) {
            c.xp.points -= c.xp.next;
            c.xp.level++;
            c.xp.next = levels[Math.min(c.xp.level, levels.length - 1)];
            c.promotions.can = true;
            note(`${c.type} ${c.id} reaches level ${c.xp.level}`);
        }
    };
    // A fight of our unit `u` (a packed soldier fights where its army stands, `at`): XP to every land commander whose radius
    // holds it.
    const fought = (u, { ranged, attacker, kill, at = u }) => {
        stats.combats++;
        let counted = false;
        for (const c of ours()) {
            if (!isCommander(c) || !inRadius(c, at)) continue;
            counted = true;
            xpFor(c, (ranged ? SIM.XP.RANGED : SIM.XP.MELEE) + (attacker ? SIM.XP.ATTACKER : 0) + (kill ? SIM.XP.KILL : 0), true);
        }
        if (counted) stats.inRadius++;
    };
    const killEnemy = (e) => {
        world.enemies = enemies().filter((x) => x !== e);
        stats.kills++;
    };
    const killOurs = (u, why) => {
        if (isCommander(u)) {
            // Defeated: off the map (the game brings it back after COMMANDER_DEATH_DEFAULT_RESPAWN_TURNS 20).
            stats.commanderDefeats++;
            u.onMap = false;
            u.x = NO;
            u.y = NO;
            note(`${u.type} ${u.id} defeated (${why})`);
            return;
        }
        world.units = ours().filter((x) => x !== u);
        stats.losses.push(u.type);
        note(`${u.type} ${u.id} lost (${why})`);
    };
    const meleeFight = (u, e, bonus = 0) => {
        const dealt = damage(strength(u, "melee") + bonus, strength(e, "melee"));
        const taken = damage(strength(e, "melee"), strength(u, "melee") + bonus);
        e.damage = (e.damage ?? 0) + dealt;
        u.damage = (u.damage ?? 0) + taken;
        const kill = e.damage >= 100;
        fought(u, { ranged: false, attacker: true, kill });
        note(`${u.type} ${u.id} strikes ${e.type} ${e.id}: ${dealt} dealt, ${taken} taken${kill ? ", killed" : ""}`);
        Object.assign(u, { attacks: 0, moves: 0, moved: true, acted: true });
        if (kill) {
            const at = { x: e.x, y: e.y };
            killEnemy(e);
            if (u.damage < 100 && !enemyAt(at.x, at.y)) Object.assign(u, at);
        }
        if (u.damage >= 100) killOurs(u, `struck ${e.type}`);
    };
    const rangedFight = (u, e, bonus = 0) => {
        const dealt = damage(strength(u, "ranged") + bonus, strength(e, "melee"));
        e.damage = (e.damage ?? 0) + dealt;
        const kill = e.damage >= 100;
        fought(u, { ranged: true, attacker: true, kill });
        note(`${u.type} ${u.id} shoots ${e.type} ${e.id}: ${dealt} dealt${kill ? ", killed" : ""}`);
        Object.assign(u, { attacks: 0, moves: 0, moved: true, acted: true });
        if (kill) killEnemy(e);
    };

    // ---- moves ----
    const zoc = (t) => enemies().some((e) => e.onMap !== false && isSoldier(e.type) && dist(e, t) === 1);
    // Our units' paths count the zone of control as stepTo plays it (a step next to an enemy soldier ends that turn's
    // moves), as the game's own path does: the fake's straight walk did not, so a general sent 2 tiles past a raider's
    // neighbour "in 1 turn" stopped beside it alone and was caught (raids60: 4 of 10 seeds).
    // (One wrapper over the fake's own walk, however many simulators a process starts.)
    const straightPath = g.Units.getPathTo.straight ?? g.Units.getPathTo;
    g.Units.getPathTo = (id, l) => {
        const p = straightPath(id, l);
        if ((id?.owner ?? 0) !== 0 || !ourUnit(id) || !(p?.plots?.length > 0)) return p;
        const per = Math.max(1, Number(world.speed?.(id)) || 2);
        let turn = 1;
        let left = per;
        const turns = p.plots.map((idx) => {
            if (left <= 0) {
                turn++;
                left = per;
            }
            left--;
            if (zoc(locOf(idx))) left = 0;
            return turn;
        });
        return { plots: p.plots, turns };
    };
    g.Units.getPathTo.straight = straightPath;
    const stepTo = (u, dest) => {
        const path = g.Units.getPathTo({ owner: 0, id: u.id, type: 1 }, dest)?.plots ?? [];
        const start = { x: u.x, y: u.y };
        // One soldier a tile (a commander may share one with a soldier): it stops on the last tile it may hold.
        const mayHold = (t) => !isSoldier(u.type) || !ourSoldierAt(t.x, t.y, u);
        let held = start;
        let moves = u.moves ?? 0;
        let at = start;
        for (const idx of path) {
            if (moves <= 0) break;
            const t = locOf(idx);
            if (enemyAt(t.x, t.y)) break;
            at = t;
            moves--;
            if (mayHold(t)) held = { ...t, moves };
            if (zoc(t)) moves = 0;
        }
        void at;
        const moved = held !== start;
        if (moved) Object.assign(u, { x: held.x, y: held.y, moves: held.moves, moved: true, acted: true });
        u.dest = u.x === dest.x && u.y === dest.y ? null : { ...dest };
        if (isCommander(u)) syncArmy(u);
    };

    // ---- the orders ----
    const apply = (o) => {
        if (o.kind === "player" && o.op === g.PlayerOperationTypes?.DECLARE_WAR) {
            world.wars = [...new Set([...(world.wars ?? []), o.args.Player2])];
            return;
        }
        const u = ourUnit(o.id);
        if (!u) return;
        const a = o.args ?? {};
        if (o.kind === "unit") {
            if (o.op === g.UnitOperationTypes.MOVE_TO) {
                const e = enemyAt(a.X, a.Y);
                if (e && dist(u, e) > 1) stepTo(u, { x: a.X, y: a.Y });
                if (e && dist(u, e) === 1) {
                    if ((u.attacks ?? 1) > 0 && (u.moves ?? 1) > 0 && isSoldier(u.type)) meleeFight(u, e);
                    return;
                }
                if (!e) stepTo(u, { x: a.X, y: a.Y });
                return;
            }
            if (o.op === g.UnitOperationTypes.RANGE_ATTACK && a.X !== undefined) {
                const e = enemyAt(a.X, a.Y);
                if (e && (u.attacks ?? 1) > 0 && dist(u, e) <= rangeOf(u.type)) rangedFight(u, e);
                return;
            }
            if (o.op === "UNITOPERATION_SWAP_UNITS") {
                const other = ourSoldierAt(a.X, a.Y, u);
                if (!other || dist(u, other) !== 1) return;
                const here = { x: u.x, y: u.y };
                Object.assign(u, { x: other.x, y: other.y, moved: true, acted: true, moves: 0 });
                Object.assign(other, { ...here, moved: true, acted: true, moves: 0 });
                note(`${u.type} ${u.id} swaps with ${other.type} ${other.id}`);
                return;
            }
            if (o.op === "UNITOPERATION_DISPERSE_INDEPENDENT") {
                const village = villages.find((v) => live(v) && u.x === v.x && u.y === v.y);
                if (!village) return;
                village.dispersed = g.Game.turn;
                stats.dispersed ??= g.Game.turn;
                world.villages = (world.villages ?? []).filter((v) => !(v.x === village.x && v.y === village.y));
                // Its soldiers go with it.
                world.enemies = enemies().filter((e) => e.owner !== village.owner);
                for (const c of ours()) if (isCommander(c) && inRadius(c, u)) xpFor(c, SIM.XP.DISPERSE, false);
                note(`${u.type} ${u.id} disperses the village`);
                return;
            }
            if (["UNITOPERATION_FORTIFY", "UNITOPERATION_SLEEP", "UNITOPERATION_ALERT"].includes(o.op)) u.activity = g.UnitActivityTypes.SLEEP;
            else if (o.op === "UNITOPERATION_REST_UNTIL_HEALED" || o.op === "UNITOPERATION_HEAL") u.activity = g.UnitActivityTypes.HEAL;
            return;
        }
        if (o.kind !== "unitCommand") return;
        switch (o.op) {
            case "UNITCOMMAND_FOCUSED_ATTACK_LAND_RANGED":
            case "UNITCOMMAND_FOCUSED_ATTACK_LAND_MELEE": {
                const ranged = o.op.endsWith("RANGED");
                const near = ours().filter((x) => !isCommander(x) && onMap(x) && (x.attacks ?? 1) > 0 && inRadius(u, x));
                for (const x of near) {
                    const e = enemyAt(a.X, a.Y);
                    if (!e) break;
                    const isRanged = rangeOf(x.type) > 0 && rangedS(x.type) > melee(x.type);
                    if (ranged && isRanged && dist(x, e) <= rangeOf(x.type)) rangedFight(x, e, SIM.FOCUS_BONUS);
                    else if (!ranged && !isRanged && dist(x, e) === 1) meleeFight(x, e, SIM.FOCUS_BONUS);
                }
                return;
            }
            case "UNITCOMMAND_ADD_TO_ARMY": {
                const c = ours().find((x) => isCommander(x) && onMap(x) && x.x === a.X && x.y === a.Y);
                if (!c || dist(c, u) > 1 || packedIn(c).length >= 4) return;
                Object.assign(u, { onMap: false, x: NO, y: NO, army: c.army, acted: true, moved: true });
                syncArmy(c);
                note(`${u.type} ${u.id} packs into ${c.type} ${c.id}`);
                return;
            }
            case "UNITCOMMAND_UNPACK_ARMY": {
                const spots = freeLand(u, 1, true).sort((p, q) => dist(p, { x: a.X ?? u.x, y: a.Y ?? u.y }) - dist(q, { x: a.X ?? u.x, y: a.Y ?? u.y }));
                for (const m of packedIn(u)) {
                    const t = spots.shift();
                    if (!t) break;
                    // Unpacked soldiers stand ready but cannot move this turn (Initiative aside).
                    Object.assign(m, { onMap: true, x: t.x, y: t.y, army: undefined, moves: 0, attacks: 0, moved: true, acted: true });
                }
                syncArmy(u);
                note(`${u.type} ${u.id} unpacks`);
                return;
            }
            case "UNITCOMMAND_REMOVE_FROM_ARMY": {
                const c = ours().find((x) => isCommander(x) && x.army === u.army && x !== u);
                const t = c ? freeLand(c, 1, true)[0] : null;
                if (!t) return;
                Object.assign(u, { onMap: true, x: t.x, y: t.y, army: undefined, moves: 0, acted: true });
                syncArmy(c);
                return;
            }
            case "UNITCOMMAND_WAKE":
                u.activity = g.UnitActivityTypes.NONE;
                return;
            case "UNITCOMMAND_CANCEL":
                u.dest = null;
                return;
            case "UNITCOMMAND_PROMOTE":
                if (u.promotions) {
                    u.promotions.can = false;
                    u.promotions.has = [...(u.promotions.has ?? []), a.PromotionType ?? "PROMOTION"];
                }
                return;
            default:
        }
    };
    // Orders are carried out as they are sent; a new simulator replaces the last one's hook (never two at once).
    const push = (fake.sent.originalPush ??= fake.sent.push);
    fake.sent.push = function (...items) {
        const n = push.apply(this, items);
        for (const o of items) apply(o);
        return n;
    };

    // ---- the turn ----
    const heal = (u, amount) => {
        u.damage = Math.max(0, (u.damage ?? 0) - amount);
    };
    const healOf = (x, y) => (ourSettlement(x, y) ? SIM.HEAL.CITY : nearVillage(x, y) ? SIM.HEAL.ENEMY : ourLand(x, y) ? SIM.HEAL.OURS : SIM.HEAL.NEUTRAL);
    const startTurn = () => {
        g.Game.turn++;
        stats.turns++;
        for (const u of [...ours()]) {
            if (!u.acted && onMap(u) && (u.damage ?? 0) > 0) heal(u, healOf(u.x, u.y));
            // "Rest until fully healed": the rest ends at full health, and the unit wants orders again.
            if (u.activity === g.UnitActivityTypes.HEAL && (u.damage ?? 0) === 0) u.activity = g.UnitActivityTypes.NONE;
            const army = isCommander(u) && packedIn(u).length > 0 ? SIM.ARMY_MOVES : 0;
            Object.assign(u, { acted: false, moved: false, attacks: 1, moves: baseMoves(u) + army });
        }
        for (const e of enemies()) {
            const home = homeOf(e);
            if (!e.acted && (e.damage ?? 0) > 0) e.damage = Math.max(0, e.damage - (home && dist(home, e) <= 1 ? SIM.HEAL.OURS : SIM.HEAL.NEUTRAL));
            e.acted = false;
        }
        // Queued moves go on.
        for (const u of ours()) if (u.dest && onMap(u)) stepTo(u, u.dest);
    };
    // Each village's soldier on its turn (`first`, then every `every`: game 60, Standard speed, 8 then 7 then 6 turns), at most
    // `max` of its owner's soldiers about.
    const spawn = () => {
        for (const village of villages) {
            if (!live(village)) continue;
            const every = village.every ?? 4;
            const n = stats.turns - (village.first ?? 1);
            if (n < 0 || n % every !== 0) continue;
            const theirs = enemies().filter((e) => e.owner === village.owner);
            if (theirs.length >= (village.max ?? 4)) continue;
            const spot = [village, ...tilesNear(village, 1)].find((t) => !enemyAt(t.x, t.y) && ourAnyAt(t.x, t.y).length === 0);
            if (!spot) continue;
            const kinds = village.spawn ?? ["UNIT_WARRIOR"];
            const type = kinds[((n / every) | 0) % kinds.length];
            world.enemies = [...enemies(), { id: nextEnemyId++, owner: village.owner, type, x: spot.x, y: spot.y, damage: 0 }];
            stats.births.push({ turn: stats.turns, owner: village.owner, type });
        }
    };
    // The independents' turn: each soldier shoots or strikes the best target near it when the trade pays, else steps toward
    // ours near its village (guards stay within `leash` of it; raiders walk to our nearest settlement).
    const enemyTurn = () => {
        spawn();
        for (const e of [...enemies()]) {
            if (!enemies().includes(e)) continue;
            const isRanged = rangeOf(e.type) > 0 && rangedS(e.type) > melee(e.type);
            // Our units on a tile; a commander alone on our settlement's centre is not caught (the district fights).
            const targets = ours().filter((u) => onMap(u) && (isSoldier(u.type) || (ourSoldierAt(u.x, u.y, u) === undefined && !ourSettlement(u.x, u.y))));
            const reach = (u) => (isRanged ? dist(e, u) <= rangeOf(e.type) : dist(e, u) === 1);
            const value = (u) => {
                const def = defenderOf(u);
                if (isRanged) return expected(strength(e, "ranged"), strength(def, "melee"));
                if (isCommander(def)) return 1000;
                return expected(strength(e, "melee"), strength(def, "melee")) - 0.8 * expected(strength(def, "melee"), strength(e, "melee")) + (def.damage ?? 0) / 2;
            };
            let best = targets.filter(reach).sort((p, q) => value(q) - value(p))[0];
            if (!best) {
                const home = homeOf(e);
                const leash = home?.leash ?? 3;
                const raid = e.raid ?? home?.raid ?? false;
                const goal = raid ? (world.cities ?? []).filter((c) => c.owner === 0).sort((p, q) => dist(p, e) - dist(q, e))[0]
                    : targets.filter((u) => !home || dist(home, u) <= leash + 1).sort((p, q) => dist(p, e) - dist(q, e))[0];
                if (goal) {
                    let moves = baseMoves(e);
                    while (moves-- > 0) {
                        // Not onto our settlement's centre: its district must be taken first (the simulator has no districts).
                        const step = tilesNear(e, 1).filter((t) => dist(t, e) === 1 && !enemyAt(t.x, t.y) && ourAnyAt(t.x, t.y).length === 0 && !ourSettlement(t.x, t.y)
                            && (!home || raid || dist(home, t) <= leash)).sort((p, q) => dist(p, goal) - dist(q, goal))[0];
                        if (!step || dist(step, goal) >= dist(e, goal)) break;
                        Object.assign(e, step);
                        e.acted = true;
                        if (zocOurs(step)) break;
                    }
                }
                best = targets.filter(reach).sort((p, q) => value(q) - value(p))[0];
                if (!best) continue;
            }
            const def = defenderOf(best);
            // A packed soldier fights where its army stands.
            const at = onMap(def) ? def : best;
            const army = !onMap(def) && isCommander(best) ? best : null;
            if (!isRanged && value(best) <= 0 && !isCommander(def)) continue;
            e.acted = true;
            if (isCommander(def)) {
                killOurs(def, `caught alone by ${e.type}`);
                continue;
            }
            if (isRanged) {
                const dealt = damage(strength(e, "ranged"), strength(def, "melee"));
                def.damage = (def.damage ?? 0) + dealt;
                fought(def, { ranged: true, attacker: false, kill: false, at });
                note(`${e.type} ${e.id} shoots ${def.type} ${def.id}${army ? " (packed)" : ""}: ${dealt}`);
                if (def.damage >= 100) killOurs(def, `shot by ${e.type}`);
                unpackHurt(def, army);
            } else {
                const dealt = damage(strength(e, "melee"), strength(def, "melee"));
                const taken = damage(strength(def, "melee"), strength(e, "melee"));
                def.damage = (def.damage ?? 0) + dealt;
                e.damage = (e.damage ?? 0) + taken;
                const kill = e.damage >= 100;
                fought(def, { ranged: false, attacker: false, kill, at });
                note(`${e.type} ${e.id} strikes ${def.type} ${def.id}${army ? " (packed)" : ""}: ${dealt} dealt, ${taken} taken${kill ? ", killed" : ""}`);
                if (kill) killEnemy(e);
                if (def.damage >= 100) killOurs(def, `struck by ${e.type}`);
                unpackHurt(def, army);
            }
        }
    };
    // The soldier who defends a tile of ours: one standing there, else the strongest packed in a commander's army there.
    const armyDefender = (c) => packedIn(c).filter((x) => isSoldier(x.type)).sort((p, q) => strength(q, "melee") - strength(p, "melee"))[0];
    const defenderOf = (u) => ourSoldierAt(u.x, u.y) ?? (isCommander(u) ? armyDefender(u) : undefined) ?? u;
    // Hurt enough, an army unpacks: its soldiers stand on the free tiles around its commander (no moves this turn).
    const unpackHurt = (def, cmdr) => {
        if (!cmdr || onMap(def) || (def.damage ?? 0) < SIM.ARMY_UNPACK_DAMAGE || !ours().includes(def)) return;
        const spots = freeLand(cmdr, 1, true).filter((t) => !(t.x === cmdr.x && t.y === cmdr.y));
        for (const m of packedIn(cmdr)) {
            const t = spots.shift();
            if (!t) break;
            Object.assign(m, { onMap: true, x: t.x, y: t.y, army: undefined, moves: 0, attacks: 0, moved: true, acted: true });
        }
        syncArmy(cmdr);
        note(`${cmdr.type} ${cmdr.id}'s army unpacks, hurt`);
    };
    const zocOurs = (t) => ours().some((u) => onMap(u) && isSoldier(u.type) && dist(u, t) === 1);

    /** Runs one turn: our pass (the hud's unit steps, in its order), then the independents'. */
    const turn = async (pass) => {
        startTurn();
        await pass();
        enemyTurn();
        const cmdrs = ours().filter(isCommander).map((c) => `${c.type} ${c.id} at ${onMap(c) ? `${c.x},${c.y}` : "-"} L${c.xp.level} ${c.xp.points}/${c.xp.next}`);
        const soldiers = ours().filter((u) => !isCommander(u)).map((u) => `${u.type.replace("UNIT_", "")} ${onMap(u) ? `${u.x},${u.y}` : "packed"} ${u.damage ?? 0}`);
        stats.log.push(`T${g.Game.turn} end: ${cmdrs.join("; ")} | ours [${soldiers.join(", ")}] | theirs [${enemies().map((e) => `${e.type.replace("UNIT_", "")} ${e.x},${e.y} ${e.damage ?? 0}`).join(", ")}]`);
    };
    return { stats, turn, apply, enemyTurn, startTurn, summary: () => summary(stats) };
}

function summary(s) {
    return {
        turns: s.turns, combats: s.combats, inRadius: s.inRadius, kills: s.kills, losses: s.losses.length,
        commanderDefeats: s.commanderDefeats, dispersed: s.dispersed, xp: Object.fromEntries(s.xp),
    };
}

/**
 * The autopilot's unit steps of one pass, in the hud's order (hud/xpl-autopilot.js): threats and the war's state, the strike
 * step (raiders, then a field operation's fight), the unit orders, the second strike when a general was placed or an army
 * unpacked, and the field fight again. @returns the pass's entries
 */
export async function autopilotPass({ units, steps, settings, options = {} }) {
    // The hud's own list of entries after which the strike step runs again (imported once the fake engine is installed).
    const { STRIKE_AGAIN } = await import("../../mod/expansion-planner/ui/hud/xpl-autopilot.js");
    const entries = [];
    const threats = units.threatenedSettlements();
    entries.push(...(steps.assessWar(threats).entries ?? []));
    entries.push(...((await units.strikeRaiders()).entries ?? []));
    if (units.fieldOpState()) entries.push(...(await units.fieldAssault()));
    const r = units.commandUnits(settings, {
        defend: true, hunt: true, huntRaiders: true, threats, riskOwners: steps.warState().risk,
        fronts: steps.warFronts(), exposed: steps.exposedSettlements(threats), ...options,
    });
    entries.push(...r.entries);
    if (r.entries.some((e) => e.key === "DISPERSE_MOVE")) entries.push(...units.disperseArrivals());
    if (r.entries.some((e) => STRIKE_AGAIN.has(e.key))) entries.push(...((await units.strikeRaiders()).entries ?? []));
    if (units.fieldOpState()?.stage === "FIGHT") entries.push(...(await units.fieldAssault()));
    return entries;
}
