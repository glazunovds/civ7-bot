// How close the building solver gets to the best layout of its own value model. Random maps
// (resources, mountains, coast, a river, sometimes a wonder or a natural wonder), one city with
// every building of the age: the solver without and with its annealing step, against a
// reference = the best of two long annealing chains (moves and swaps judged by the exact change
// in plan value). Prints the gap per map and on average.
//   node tools/bench-optimality.mjs [maps=10] [reference steps=40000] [antiquity|exploration|modern] [timed] [show=N]
//   ANNEAL_VARIANTS=40,80,200 adds the solver with those annealing steps per building.
import { loadGameInfo } from "../tests/fakes/fake-engine.mjs";
import { layoutOf as layoutWithSid, makeRandomCity, placeAll, planValue, randomCityState, seededRandom as rng } from "../tests/fakes/random-city.mjs";
import { buildRuleBook } from "../mod/expansion-planner/ui/core/xpl-rule-book.js";
import { solveLayout } from "../mod/expansion-planner/ui/core/xpl-placement-solver.js";
import { runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";

const args = process.argv.slice(2);
const numbers = args.filter((a) => /^\d+$/.test(a)).map(Number);
const MAPS = numbers[0] || 10;
const REF_STEPS = numbers[1] || 40000;
const AGE = args.find((a) => ["antiquity", "exploration", "modern"].includes(a)) ?? "antiquity";
const TIMED = args.includes("timed");
const SHOW = Number(args.find((a) => a.startsWith("show="))?.slice(5)) || 0; // print the layouts of this map
const { info } = loadGameInfo(AGE);
const book = buildRuleBook(info, `AGE_${AGE.toUpperCase()}`);

const makeMap = makeRandomCity;
const newState = (map, profile) => randomCityState(map, book, { profile, horizon: TIMED ? 80 : undefined });
const layoutOf = (state) => layoutWithSid(state).map(({ type, idx, t }) => ({ type, idx, t }));

function tryMove(state, type, to, accept) {
    const lifted = state.lift(type, "s0");
    if (!lifted || lifted.idx === to) {
        if (lifted) state.restore(lifted);
        return null;
    }
    const t = lifted.item.t;
    const ca = state.canPlace(type, lifted.idx);
    const cb = state.canPlace(type, to);
    if (ca.ok && cb.ok) {
        const d = state.delta(type, to, cb, t) - state.delta(type, lifted.idx, ca, t);
        if (accept(d)) {
            state.place(type, to, cb, t);
            if (state.isConnected("s0")) return d;
            state.lift(type, "s0");
        }
    }
    state.restore(lifted);
    return null;
}

function trySwap(state, a, b, accept) {
    const la = state.lift(a, "s0");
    const lb = state.lift(b, "s0");
    const back = () => {
        if (lb) state.restore(lb);
        if (la) state.restore(la);
    };
    if (!la || !lb || la.idx === lb.idx) {
        back();
        return null;
    }
    const tokens = [];
    const value = (pa, pb) => {
        const c1 = state.canPlace(a, pa);
        if (!c1.ok) return null;
        const g1 = state.delta(a, pa, c1, la.item.t);
        tokens.push(state.place(a, pa, c1, la.item.t));
        const c2 = state.canPlace(b, pb);
        if (!c2.ok) return null;
        const g2 = state.delta(b, pb, c2, lb.item.t);
        tokens.push(state.place(b, pb, c2, lb.item.t));
        return g1 + g2;
    };
    const unwind = () => {
        for (const tk of tokens.splice(0).reverse()) state.undo(tk);
    };
    const before = value(la.idx, lb.idx);
    unwind();
    if (before !== null) {
        const after = value(lb.idx, la.idx);
        if (after !== null && state.isConnected("s0") && accept(after - before)) return after - before;
        unwind();
    }
    back();
    return null;
}

/** Long annealing chain for the reference: returns the best plan value seen. */
function anneal(state, seed, steps) {
    const r = rng(seed);
    let current = planValue(state);
    let best = current;
    let bestLayout = layoutOf(state);
    for (let k = 0; k < steps; k++) {
        const T = 2 * Math.pow(0.005, k / steps);
        const accept = (d) => d > 1e-9 || r() < Math.exp(d / T);
        const items = state.plannedItems();
        const it = items[Math.floor(r() * items.length)];
        const tiles = state.tilesOf("s0");
        const d = r() < 0.6
            ? tryMove(state, it.type, tiles[Math.floor(r() * tiles.length)].idx, accept)
            : trySwap(state, it.type, items[Math.floor(r() * items.length)].type, accept);
        if (d !== null) {
            current += d;
            if (current > best + 1e-6) {
                best = current;
                bestLayout = layoutOf(state);
            }
        }
    }
    return { best, bestLayout };
}

function describe(state, w, centre) {
    const short = (t) => t.replace(/^(BUILDING|WONDER)_/, "").slice(0, 10);
    const rows = [];
    for (const t of state.tilesOf("s0")) {
        const planned = t.items.filter((i) => i.planned);
        if (!planned.length) continue;
        const around = w.grid.neighbours(t.idx).map((n) => w.table[n]);
        const count = (f) => around.filter(f).length;
        const env = [
            count((f) => f.resource) && `res${count((f) => f.resource)}`,
            count((f) => f.isMountain) && `mtn${count((f) => f.isMountain)}`,
            count((f) => f.terrain === "TERRAIN_COAST") && `coast${count((f) => f.terrain === "TERRAIN_COAST")}`,
            count((f) => f.district === "DISTRICT_WONDER") && "wonder",
            count((f) => f.isNaturalWonder) && "natwonder",
            w.grid.neighbours(t.idx).includes(centre) && "palace",
        ].filter(Boolean).join(",");
        const items = planned.map((i) => `${short(i.type)}+${state.adjacencyOf(i.type, t.idx).total}`).join(" ");
        rows.push(`  (${w.grid.x(t.idx)},${w.grid.y(t.idx)}) ring ${w.grid.distance(t.idx, centre)} [${env}] ${items}`);
    }
    return rows.sort().join("\n");
}

const selection = book.buildings.map((b) => b.type);
const warehouses = book.warehouses.map((b) => b.type);
const sums = new Map();
let n = 0;
console.log(`${AGE}${TIMED ? " (time-aware)" : ""}: ${selection.length} buildings + ${warehouses.length} warehouses, ${MAPS} maps; reference = best of 2 annealing chains of ${REF_STEPS} steps`);
for (let m = SHOW || 1; m <= (SHOW || MAPS); m++) {
    for (const profile of ["BALANCE", "SCIENCE"]) {
        const map = makeMap(m * 7919);
        const results = {};
        const layouts = {};
        const variants = process.env.ANNEAL_VARIANTS ? process.env.ANNEAL_VARIANTS.split(",").map((v) => [`anneal ${v}`, Number(v)]) : [];
        for (const [name, annealSteps] of [["no anneal", 0], ["ours", undefined], ...variants]) {
            const state = newState(makeMap(m * 7919), profile);
            const t0 = Date.now();
            runToEnd(solveLayout(state, selection, warehouses, { annealSteps }));
            results[name] = { v: planValue(state), ms: Date.now() - t0 };
            layouts[name] = layoutOf(state);
        }
        let ref = Math.max(...Object.values(results).map((r) => r.v));
        let refLayout = layouts.ours;
        for (const [seed, from] of [[1, layouts["no anneal"]], [2, layouts.ours]]) {
            const state = newState(makeMap(m * 7919), profile);
            placeAll(state, from);
            const a = anneal(state, m * 104729 + seed, REF_STEPS);
            if (a.best > ref) {
                ref = a.best;
                refLayout = a.bestLayout;
            }
        }
        n++;
        const parts = [];
        for (const [k, r] of Object.entries(results)) {
            const gap = ref > 0 ? Math.max(0, (ref - r.v) / ref) : 0;
            const acc = sums.get(k) ?? { gap: 0, worst: 0, ms: 0 };
            acc.gap += gap;
            acc.worst = Math.max(acc.worst, gap);
            acc.ms += r.ms;
            sums.set(k, acc);
            parts.push(`${k} ${(gap * 100).toFixed(1)}% (${r.ms} ms)`);
        }
        console.log(`map ${m} ${profile.padEnd(7)} reference ${ref.toFixed(2)}: ${parts.join(", ")}`);
        if (SHOW === m && profile === "BALANCE") {
            for (const [name, layout] of [["no anneal", layouts["no anneal"]], ["ours", layouts.ours], ["reference", refLayout]]) {
                const state = newState(makeMap(m * 7919), profile);
                const v = placeAll(state, layout);
                console.log(`${name} (${v.toFixed(2)}):\n${describe(state, map.w, map.centre)}`);
            }
        }
    }
}
for (const [k, acc] of sums) console.log(`${k.padEnd(9)}: average gap ${((acc.gap / n) * 100).toFixed(2)}%, worst ${(acc.worst * 100).toFixed(1)}%, average ${Math.round(acc.ms / n)} ms`);
