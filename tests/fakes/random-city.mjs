// A seeded random city for building-plan tests and tools/bench-optimality.mjs: one centre with a
// Palace at (10,8), resources, mountains, hills, sometimes coast on one side, a river row, a wonder
// tile or a natural wonder within 4 tiles.
import { FakeWorld } from "./fake-world.mjs";
import { PlanState } from "../../mod/expansion-planner/ui/core/xpl-placement-model.js";
import { getProfile } from "../../mod/expansion-planner/ui/core/xpl-profiles.js";

const RESOURCES = ["RESOURCE_IRON", "RESOURCE_COTTON", "RESOURCE_SILVER", "RESOURCE_MARBLE", "RESOURCE_WINE"];

export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** @returns { w: FakeWorld, centre } */
export function makeRandomCity(seed) {
    const r = seededRandom(seed);
    const w = new FakeWorld(24, 18);
    const C = { x: 10, y: 8 };
    const centre = w.at(C.x, C.y);
    const near = w.grid.radius(centre, 4).map((p) => p.idx).filter((i) => i !== centre);
    const ring1 = new Set(w.grid.radius(centre, 1).map((p) => p.idx));
    if (r() < 0.7) {
        const west = r() < 0.5;
        for (const i of near) {
            const x = w.grid.x(i);
            if (west ? x <= 7 : x >= 13) w.set(x, w.grid.y(i), "coast");
        }
    }
    for (const i of near) {
        if (ring1.has(i) || w.table[i].isWater) continue;
        const roll = r();
        if (roll < 0.08) w.set(w.grid.x(i), w.grid.y(i), "mountain");
        else if (roll < 0.2) w.patch(w.grid.x(i), w.grid.y(i), { resource: RESOURCES[Math.floor(r() * RESOURCES.length)], urbanizable: false });
        else if (roll < 0.26) w.set(w.grid.x(i), w.grid.y(i), "hill");
    }
    if (r() < 0.6) {
        const y = C.y + (r() < 0.5 ? 2 : -2);
        for (const i of near) if (w.grid.y(i) === y && !w.table[i].isWater) w.patch(w.grid.x(i), y, { isRiver: true, freshWater: true });
    }
    const land = near.filter((i) => !ring1.has(i) && !w.table[i].isWater && w.table[i].urbanizable && !w.table[i].isMountain && w.grid.distance(i, centre) <= 2);
    if (r() < 0.35 && land.length) {
        const i = land[Math.floor(r() * land.length)];
        w.patch(w.grid.x(i), w.grid.y(i), { district: "DISTRICT_WONDER", constructibles: [{ type: "WONDER_PYRAMIDS" }], urbanizable: false });
    }
    if (r() < 0.2) {
        const far = near.filter((i) => w.grid.distance(i, centre) === 3 && !w.table[i].isWater);
        const i = far[Math.floor(r() * far.length)];
        if (i !== undefined) w.patch(w.grid.x(i), w.grid.y(i), { isNaturalWonder: true, urbanizable: false, feature: "FEATURE_NATURAL_WONDER" });
    }
    w.patch(C.x, C.y, { district: "DISTRICT_CITY_CENTER", constructibles: [{ type: "BUILDING_PALACE" }], owner: 0 });
    return { w, centre };
}

/** A one-settlement plan ("s0") on a random city: owns ring 1, may plan up to ring 3. */
export function randomCityState({ w, centre }, book, { profile = "BALANCE", horizon, settlement = {} } = {}) {
    const owned = new Set(w.grid.radius(centre, 1).map((p) => p.idx));
    for (const i of owned) w.table[i].owner = 0;
    return new PlanState({
        map: { neighbours: (i) => w.grid.neighbours(i), distance: (a, b) => w.grid.distance(a, b) },
        facts: (i) => w.table[i],
        area: w.grid.radius(centre, 3).map((p) => p.idx),
        settlements: [{ id: "s0", centre, owned, adjMult: 1.5, production: 8, startTurn: 0, ...settlement }],
        book,
        weights: getProfile(profile).y,
        adjOpts: { playerId: 0, charming: 3, breathtaking: 5 },
        horizon,
    });
}

/** Places a layout ([{ type, idx, t }]) on an empty plan in a valid order; returns the plan value (the exact deltas telescope). */
export function placeAll(state, items) {
    let total = 0;
    let left = items.slice();
    while (left.length) {
        const next = [];
        for (const it of left) {
            const check = state.canPlace(it.type, it.idx);
            if (!check.ok) {
                next.push(it);
                continue;
            }
            total += state.delta(it.type, it.idx, check, it.t);
            state.place(it.type, it.idx, check, it.t);
        }
        if (next.length === left.length) throw new Error(`cannot place ${next.map((x) => x.type).join(",")}`);
        left = next;
    }
    return total;
}

export const layoutOf = (state) => state.plannedItems().map(({ type, idx, sid, item }) => ({ type, idx, sid, t: item.t ?? 0 }));

/** The plan value of the current layout (every planned building re-placed from an empty plan). */
export function planValue(state) {
    const items = layoutOf(state);
    for (const it of items) state.lift(it.type, it.sid);
    return placeAll(state, items);
}
