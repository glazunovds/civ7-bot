// Research/42 D3: which blast a nuclear strike takes (core/xpl-nuclear.js): an enemy army only, never ours, a third party's
// or a settlement, the most enemy units first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NUKE, bestBlast, bestCityBlast, blastVerdict, cityBlastVerdict } from "../mod/expansion-planner/ui/core/xpl-nuclear.js";

const army = (n) => Array.from({ length: n }, () => ({ enemies: 1 }));

test("a blast is fired only on enough enemy land units, never touching ours, a third party or a settlement", () => {
    assert.deepEqual(blastVerdict(army(3)), { ok: true, enemies: 3, why: null });
    assert.equal(blastVerdict(army(2)).why, "too few");
    assert.equal(blastVerdict([...army(4), { ours: true }]).why, "ours");
    assert.equal(blastVerdict([...army(4), { third: true }]).why, "a third party");
    assert.equal(blastVerdict([...army(4), { centre: true }]).why, "a settlement");
    assert.equal(blastVerdict(army(1), 1).ok, true, "the minimum is a parameter");
    assert.equal(NUKE.MIN_UNITS, 3);
});

test("the best blast: the most enemy units, then the nearest to our settlements", () => {
    const a = { id: "a", near: 5, verdict: { ok: true, enemies: 3 } };
    const b = { id: "b", near: 2, verdict: { ok: true, enemies: 3 } };
    const c = { id: "c", near: 7, verdict: { ok: true, enemies: 5 } };
    const d = { id: "d", near: 1, verdict: { ok: false, enemies: 9 } };
    assert.equal(bestBlast([a, b, c, d]).id, "c");
    assert.equal(bestBlast([a, b, d]).id, "b");
    assert.equal(bestBlast([d]), null);
});

// «Ядерные удары по городам» (after game 54, the user: "implement what was not built"): an enemy city may be the target,
// never ours, a third party's, a settlement not at war, or one that was ours.
test("a city blast: an enemy centre in it, nothing of ours, a third party's, another settlement or one that was ours", () => {
    const city = { enemyCentre: true, centre: true, enemies: 1 };
    assert.deepEqual(cityBlastVerdict([city, { enemies: 2 }, {}]), { ok: true, cities: 1, enemies: 3, why: null });
    assert.equal(cityBlastVerdict([city, { ours: true }]).why, "ours");
    assert.equal(cityBlastVerdict([city, { third: true }]).why, "a third party");
    assert.equal(cityBlastVerdict([city, { centre: true }]).why, "a settlement not at war");
    assert.equal(cityBlastVerdict([{ ...city, wasOurs: true }]).why, "a settlement that was ours");
    assert.equal(cityBlastVerdict([{ enemies: 5 }]).why, "no enemy city");
    const pick = bestCityBlast([{ near: 6, verdict: { ok: true, enemies: 0 } }, { near: 4, verdict: { ok: true, enemies: 0 } }, { near: 2, verdict: { ok: false } }]);
    assert.equal(pick.near, 4, "the nearest of those judged ok");
});
