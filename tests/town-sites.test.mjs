// Town sites: grow fast, feed a connected city, specialize. Pure scoring on a fake world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { scoreTownSite, townConnection } from "../mod/expansion-planner/ui/core/xpl-town-scorer.js";
import { scoreSiteRoles, rolesOf } from "../mod/expansion-planner/ui/core/xpl-site-roles.js";
import { findSites, runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";

function world() {
    const w = new FakeWorld(40, 24);
    // Our city at (8,12).
    w.patch(8, 12, { owner: 0 });
    return w;
}

function ctxOf(w, extra = {}) {
    const city = { idx: w.at(8, 12), name: "Athens", coastal: false, continent: 1 };
    return w.ctx({ centres: [{ idx: city.idx, kind: "OWN", name: "Athens" }], ownCities: [city], continentOf: () => 1, ...extra });
}

test("a food-rich site near the city is a good town; the same site far away feeds less", () => {
    const w = world();
    const ctx = ctxOf(w);
    const near = scoreTownSite(w.at(13, 12), ctx);
    const far = scoreTownSite(w.at(30, 12), ctx);
    assert.equal(near.role, "TOWN");
    assert.ok(!near.rejected && !far.rejected);
    assert.equal(near.connection.name, "Athens");
    assert.ok(near.connection.factor > far.connection.factor);
    assert.ok(near.value > far.value, `${near.value} > ${far.value}`);
    assert.ok(near.reasons.some((r) => r.key === "LOC_XPL_RT_FEEDS_ROAD"));
});

test("no feeding across continents unless...", () => {
    const w = world();
    const ctx = ctxOf(w, { continentOf: (idx) => (w.grid.x(idx) > 20 ? 2 : 1) });
    const r = scoreTownSite(w.at(30, 12), ctx);
    assert.equal(r.connection.factor, 0);
    assert.ok(r.reasons.some((x) => x.key === "LOC_XPL_RT_OTHER_CONTINENT"));
    // ...both are on the coast of the same continent: a sea connection.
    const c = townConnection(w.at(13, 12), { ...ctx, ownCities: [{ ...ctx.ownCities[0], coastal: true }] }, true);
    assert.equal(c.sea, true);
    assert.equal(c.factor, 1);
});

test("specialization: hills and forest make a Mining Town, coast a Fishing Town", () => {
    const w = world();
    w.disc(14, 6, 2, "hill");
    const ctx = ctxOf(w);
    const mining = scoreTownSite(w.at(14, 6), ctx);
    assert.equal(mining.spec.kind, "MINE");
    const w2 = world();
    w2.disc(14, 18, 2, "coast");
    w2.set(14, 18, "grass");
    for (const [x, y] of [[13, 18], [15, 18]]) w2.set(x, y, "grass");
    const fishing = scoreTownSite(w2.at(14, 18), ctxOf(w2));
    assert.equal(fishing.spec.kind, "FARM");
});

test("both roles: production land becomes a city, flat food land a town", () => {
    const w = world();
    w.disc(22, 6, 3, "hill");
    for (const [x, y] of [[21, 5], [23, 7], [20, 6], [24, 6]]) w.set(x, y, "forest");
    w.set(22, 6, "plains");
    const ctx = ctxOf(w, { siteRoles: rolesOf("BOTH") });
    const hills = scoreSiteRoles(w.at(22, 6), ctx, [], ctx.siteRoles);
    const grass = scoreSiteRoles(w.at(13, 16), ctx, [], ctx.siteRoles);
    assert.equal(hills.role, "CITY", JSON.stringify({ city: hills.cityValue, town: hills.townValue }));
    assert.equal(grass.role, "TOWN", JSON.stringify({ city: grass.cityValue, town: grass.townValue }));
    assert.ok(hills.cityScore != null && hills.townScore != null);
});

test("the search honours the role filter", () => {
    const w = world();
    const base = ctxOf(w);
    for (const [setting, allowed] of [["CITY", ["CITY"]], ["TOWN", ["TOWN"]]]) {
        const ctx = { ...base, siteRoles: rolesOf(setting) };
        const r = runToEnd(findSites({ ctx, origins: [w.at(8, 12)], radius: 10, minSpacing: 3, minPickDist: 4, topN: 5, includeHidden: false, isSettleable: () => true }));
        assert.ok(r.picks.length >= 3);
        for (const p of r.picks) assert.ok(allowed.includes(p.role), `${setting}: ${p.role}`);
    }
});
