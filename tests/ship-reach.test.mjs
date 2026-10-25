// Ships' reach (research/41 §3): ships killed 29 of the 56 land units we lost in games 30-47, each standing within a ship's
// reach; a land unit stays out of it unless it out-guns the ship.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAVAL, fightsShips, inShipReach, outGuns, outRanges, shipAttack } from "../mod/expansion-planner/ui/core/xpl-naval.js";

// Unit_Stats rows as the game's data has them (age-*/data/units.xml).
const FRIGATE = { Combat: 45, RangedCombat: 50, Bombard: 45, Range: 2 };
const COG = { Combat: 30, RangedCombat: 35, Bombard: 30, Range: 2 };
const PRIVATEER = { Combat: 35, RangedCombat: 10, Bombard: 10, Range: 1 };
const GALLEY = { Combat: 25, RangedCombat: 20, Bombard: 15, Range: 1 };
const FIELD_CANNON = { Combat: 35, RangedCombat: 45, Bombard: 35, Range: 2 };
const FIELD_GUN = { Combat: 40, RangedCombat: 50, Bombard: 40, Range: 2 };
const MORTAR = { Combat: 40, RangedCombat: 35, Bombard: 55, Range: 2 };
const HEAVY_ARTILLERY = { Combat: 45, RangedCombat: 40, Bombard: 60, Range: 3 };
const CATAPULT = { Combat: 25, RangedCombat: 20, Bombard: 40, Range: 2 };
const BALLISTA = { Combat: 15, RangedCombat: 10, Bombard: 30, Range: 2 };
const SLINGER = { Combat: 10, RangedCombat: 15, Range: 2 };

test("a ship's attack on land: its ranged strength with range 2+, else its stronger of melee and ranged", () => {
    assert.equal(shipAttack(FRIGATE), 50);
    assert.equal(shipAttack(PRIVATEER), 35, "a Range-1 ship fights in close combat");
});

test("out-gunning: game 38's Field Cannons and a Field Gun do not out-gun Frigates; Mortars and Heavy Artillery do", () => {
    assert.equal(outGuns(FIELD_CANNON, [FRIGATE]), false);
    assert.equal(outGuns(FIELD_GUN, [FRIGATE]), false);
    assert.equal(outGuns(MORTAR, [FRIGATE]), true);
    assert.equal(outGuns(HEAVY_ARTILLERY, [FRIGATE]), true);
    assert.equal(outGuns(CATAPULT, [COG]), true, "only just: Combat 25 is the Cog's 35 less 10");
    assert.equal(outGuns(BALLISTA, [GALLEY]), false, "a Galley closes in: Combat 15 against its 25");
    assert.equal(outGuns(CATAPULT, [GALLEY]), true);
    assert.equal(outGuns(SLINGER, [GALLEY]), false, "no Bombard");
    assert.equal(outGuns(CATAPULT, [PRIVATEER]), false, "a Privateer's close combat (35) killed a Catapult in game 42");
    // Two Frigates: their hits add up (game 38 M22: 37 + 38 + 36 on a Field Cannon in one turn).
    assert.equal(outGuns(MORTAR, [FRIGATE, FRIGATE]), true, `55 >= 45 x ${NAVAL.SEVERAL_SHIPS}`);
    assert.equal(outGuns(CATAPULT, [COG, COG]), true);
    assert.equal(outGuns({ Combat: 40, Bombard: 50 }, [FRIGATE, FRIGATE]), false, "50 < 54");
    assert.equal(outGuns(SLINGER, []), true, "no ship: nothing to out-gun");
});

test("out-ranging: a Range-2 land unit may shoot a Range-1 ship from out of its reach; not a Range-2 ship", () => {
    assert.equal(outRanges(BALLISTA, [GALLEY]), true);
    assert.equal(fightsShips(BALLISTA, [GALLEY]), true, "it does not out-gun the Galley but out-ranges it");
    assert.equal(outRanges(FIELD_CANNON, [FRIGATE]), false);
    assert.equal(fightsShips(FIELD_CANNON, [FRIGATE]), false, "game 38's losses");
    assert.equal(outRanges(HEAVY_ARTILLERY, [FRIGATE]), true, "Range 3 against 2");
    assert.equal(fightsShips(SLINGER, [GALLEY, COG]), false, "a Cog's range 2 is as long as the Slinger's");
});

test("a ship's reach: its moves plus its range, and within its range of its own water", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    // Water at x = 0 (the ship's sea); a lake at x = 20 (another body).
    const sea = (t, r) => t.x <= r;
    const frigate = { at: { x: 0, y: 0 }, moves: 3, range: 2 };
    assert.equal(inShipReach({ x: 2, y: 3 }, frigate, line, sea), true, "5 away, 2 from the sea");
    assert.equal(inShipReach({ x: 3, y: 0 }, frigate, line, sea), false, "3 from water: out of reach however near the ship");
    assert.equal(inShipReach({ x: 1, y: 6 }, frigate, line, sea), false, "7 away: beyond its moves plus range");
    const privateer = { at: { x: 0, y: 0 }, moves: 4, range: 1 };
    assert.equal(inShipReach({ x: 1, y: 2 }, privateer, line, sea), true, "next to its water");
    assert.equal(inShipReach({ x: 2, y: 0 }, privateer, line, sea), false, "a Range-1 ship threatens only tiles next to its water");
    // A lake ship: only its lake's shore counts.
    const lake = (t, r) => Math.abs(t.x - 20) <= r && t.y === 0;
    assert.equal(inShipReach({ x: 1, y: 0 }, { at: { x: 0, y: 0 }, moves: 3, range: 2 }, line, lake), false, "the sea coast is not its water");
});

const { FORM, commanderTile, formationValue, planFormation } = await import("../mod/expansion-planner/ui/core/xpl-formation.js");
const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
// A ship at 5,0 whose reach covers the tiles with x >= 3; the centre at 0,0.
const shipF = (extra = {}) => ({
    centre: { x: 0, y: 0 }, land: [], sectors: [], dist: line, defence: () => 0,
    targets: [{ x: 5, y: 0, ship: true }],
    members: [{ key: "fc", role: "ranged", range: 2, at: { x: 0, y: 2 } }, { key: "inf", role: "melee", at: { x: 0, y: 0 } }],
    outGuns: () => false, shipThreat: (_k, loc) => (loc.x >= 3 ? 1 : 0), ...extra,
});
const moveOpts = { tiles: [{ x: 3, y: 0 }, { x: 1, y: 2 }], movable: new Set(["fc", "inf"]), reach: () => true };

test("formations: a ranged unit that does not out-gun the ships is not moved into their reach, nor counts them as targets; one that does is", () => {
    assert.deepEqual(planFormation(shipF(), moveOpts).moves, [], "game 38's Field Cannon stepped within the Frigates' range for +60");
    const before = planFormation(shipF({ outGuns: undefined, shipThreat: undefined }), moveOpts).moves;
    assert.deepEqual(before.map((m) => [m.key, m.to.x]), [["fc", 3]], "without the ships' rule it moved");
    // In range of the ship but out of its reach: a ship it cannot fight is no target (a Slinger against a Galley).
    assert.deepEqual(planFormation(shipF({ shipThreat: () => 0 }), moveOpts).moves, [], "no +60 for a ship it does not fight");
    const mortar = planFormation(shipF({ outGuns: () => true, shipThreat: () => 0 }), moveOpts).moves;
    assert.deepEqual(mortar.map((m) => [m.key, m.to.x]), [["fc", 3]], "a Mortar takes the shot");
    // The melee holder on the centre is not charged for the ships' reach.
    const holder = shipF({ members: [{ key: "inf", role: "melee", at: { x: 0, y: 0 } }], shipThreat: () => 1 });
    assert.equal(formationValue(holder, new Map([["inf", { x: 0, y: 0 }]])), FORM.HOLD);
    assert.equal(formationValue(holder, new Map([["inf", { x: 1, y: 0 }]])), -FORM.SHIP_REACH, "off the centre it is");
});

test("formations: a hurt member marked onlyCentre moves only onto the centre", () => {
    const f = { centre: { x: 0, y: 0 }, land: [{ x: 3, y: 0 }], sectors: [[{ x: 3, y: 0 }]], dist: line, defence: () => 0, targets: [{ x: 3, y: 0 }],
        members: [{ key: "hurt", role: "melee", at: { x: 0, y: 1 }, onlyCentre: true }] };
    const opts = { tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }], movable: new Set(["hurt"]), reach: () => true };
    assert.deepEqual(planFormation(f, opts).moves.map((m) => [m.to.x, m.to.y]), [[0, 0]]);
    assert.deepEqual(planFormation(f, { ...opts, tiles: [{ x: 1, y: 0 }] }).moves, [], "a screen tile is not for it");
    // Screening two approaches next to an empty centre is worth as much as holding it; a damaged centre is held first.
    const two = { centre: { x: 0, y: 0 }, land: [{ x: -2, y: 2 }, { x: 2, y: 2 }], sectors: [[{ x: -2, y: 2 }], [{ x: 2, y: 2 }]], dist: line, defence: () => 0,
        targets: [], members: [{ key: "m", role: "melee", at: { x: 0, y: 1 } }] };
    const hold = { tiles: [{ x: 0, y: 0 }], movable: new Set(["m"]), reach: () => true };
    assert.deepEqual(planFormation(two, hold).moves, [], "an undamaged centre: it keeps screening");
    assert.deepEqual(planFormation({ ...two, damaged: true }, hold).moves.map((m) => [m.to.x, m.to.y]), [[0, 0]], "a damaged one: held");
});

test("formations: the commander does not step into a ship's reach to cover soldiers", () => {
    const f = shipF();
    const soldiers = [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 3, y: 2 }];
    const c = { at: { x: 0, y: 3 }, radius: 1, key: "cmdr" };
    assert.equal(commanderTile(f, c, soldiers, [{ x: 3, y: 2 }], () => true), null, "covering three in the ship's reach is not worth it");
    assert.ok(commanderTile({ ...f, shipThreat: undefined }, c, soldiers, [{ x: 3, y: 2 }], () => true), "without the rule it went");
});
