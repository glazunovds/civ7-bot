import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeWorld } from "./fakes/fake-world.mjs";
import { scoreSite, availability, REJECT } from "../mod/expansion-planner/ui/core/xpl-site-scorer.js";
import { findSites, runToEnd } from "../mod/expansion-planner/ui/core/xpl-site-pipeline.js";
import { getProfile } from "../mod/expansion-planner/ui/core/xpl-profiles.js";
import { normaliseRule } from "../mod/expansion-planner/ui/core/xpl-adjacency-rules.js";
import { scoreSiteRoles } from "../mod/expansion-planner/ui/core/xpl-site-roles.js";
import { TUNING, siteTuning } from "../mod/expansion-planner/ui/core/xpl-tuning.js";

test("open grassland site scores and is not rejected", () => {
    const w = new FakeWorld(30, 20);
    const r = scoreSite(w.at(15, 10), w.ctx());
    assert.equal(r.rejected, undefined);
    assert.ok(r.value > 0, "positive site value");
    assert.ok(r.score >= 0 && r.score <= 100, "display score clamped to 0..100");
    assert.equal(r.roomTiles, 36);
    assert.equal(r.overlapTiles, 0);
});

test("availability: tiles next to an existing own centre are taken, further ones shared", () => {
    const w = new FakeWorld(30, 20);
    const ctx = w.ctx({ centres: [{ idx: w.at(10, 10), kind: "OWN" }] });
    const nearby = [{ idx: w.at(10, 10), kind: "OWN" }];
    assert.equal(availability(ctx.facts(w.at(11, 10)), nearby, ctx), 0);
    assert.equal(availability(ctx.facts(w.at(12, 10)), nearby, ctx), 0.4);
    assert.equal(availability(ctx.facts(w.at(13, 10)), nearby, ctx), 0.6);
    assert.equal(availability(ctx.facts(w.at(14, 10)), nearby, ctx), 1);
    w.patch(14, 10, { owner: 3 });
    assert.equal(availability(ctx.facts(w.at(14, 10)), nearby, ctx), 0);
});

test("a site squeezed between two settlements is rejected for lack of room", () => {
    const w = new FakeWorld(30, 20);
    const ctx = w.ctx({
        centres: [{ idx: w.at(11, 10), kind: "OWN" }, { idx: w.at(19, 10), kind: "FOREIGN" }, { idx: w.at(15, 6), kind: "FOREIGN" }, { idx: w.at(15, 14), kind: "FOREIGN" }],
        overlapTol: "LOW",
    });
    const r = scoreSite(w.at(15, 10), ctx);
    assert.equal(r.rejected?.code, REJECT.ROOM);
});

// Game 63: one settlement from our military countdown for Modern's last 12 turns; the relaxed search's 3 candidates, squeezed
// between settlements, were all rejected for ROOM while two bought settlers stood idle.
test("a squeezed site the military countdown needs: the relaxed search with anyRoom keeps it (no ROOM or RING1 rejection)", () => {
    const w = new FakeWorld(30, 20);
    const centres = [{ idx: w.at(11, 10), kind: "OWN" }, { idx: w.at(19, 10), kind: "FOREIGN" }, { idx: w.at(15, 6), kind: "FOREIGN" }, { idx: w.at(15, 14), kind: "FOREIGN" }];
    const relaxed = scoreSite(w.at(15, 10), w.ctx({ centres, overlapTol: "HIGH", tuning: siteTuning(true) }));
    assert.ok([REJECT.ROOM, REJECT.RING1].includes(relaxed.rejected?.code), `relaxed alone: ${JSON.stringify(relaxed.rejected)}`);
    const any = scoreSite(w.at(15, 10), w.ctx({ centres, overlapTol: "HIGH", tuning: siteTuning(true, { anyRoom: true }) }));
    assert.equal(any.rejected, undefined, JSON.stringify(any.rejected));
    assert.equal(siteTuning(false, { anyRoom: true }), TUNING, "the normal search keeps its rules");
});

test("water-locked centre fails room gate; fresh water and coast add bonuses", () => {
    const w = new FakeWorld(30, 20);
    w.disc(15, 10, 3, "ocean");
    w.set(15, 10, "grass");
    assert.equal(scoreSite(w.at(15, 10), w.ctx()).rejected?.code, REJECT.ROOM);

    const w2 = new FakeWorld(30, 20);
    const plain = scoreSite(w2.at(15, 10), w2.ctx()).value;
    w2.patch(15, 10, { freshWater: true });
    const fresh = scoreSite(w2.at(15, 10), w2.ctx()).value;
    assert.ok(fresh > plain, `fresh ${fresh} > plain ${plain}`);
});

test("Production profile prefers a hill/forest site; Food profile prefers grassland", () => {
    const w = new FakeWorld(40, 20);
    w.disc(10, 10, 3, "hill");
    for (const [x, y] of [[9, 9], [11, 11], [8, 10], [12, 10]]) w.set(x, y, "forest");
    w.set(10, 10, "plains");
    // Site B at (30,10) stays grassland.
    const prodCtx = w.ctx({ profile: getProfile("PRODUCTION") });
    const foodCtx = w.ctx({ profile: getProfile("FOOD") });
    const hillsP = scoreSite(w.at(10, 10), prodCtx);
    const grassP = scoreSite(w.at(30, 10), prodCtx);
    const hillsF = scoreSite(w.at(10, 10), foodCtx);
    const grassF = scoreSite(w.at(30, 10), foodCtx);
    assert.ok(hillsP.prodPot > grassP.prodPot);
    assert.ok(hillsP.value > grassP.value, `prod: hills ${hillsP.value} > grass ${grassP.value}`);
    assert.ok(grassF.value > hillsF.value, `food: grass ${grassF.value} > hills ${hillsF.value}`);
});

test("hidden ring tiles are counted as unknown, never with their real yields", () => {
    const w = new FakeWorld(30, 20);
    w.disc(15, 10, 3, "hill");
    for (const { idx, ring } of w.grid.radius(w.at(15, 10), 3)) if (ring === 3) w.table[idx].known = false;
    const r = scoreSite(w.at(15, 10), w.ctx({ avgKnownTileValue: 0 }));
    assert.equal(r.unknownTiles, 18);
});

test("adjacency potential: culture family rewards mountains next to urban tiles", () => {
    const w = new FakeWorld(30, 20);
    const mountain = normaliseRule({ ID: "MountainCulture", YieldType: "YIELD_CULTURE", YieldChange: 1, TilesRequired: 1, AdjacentTerrain: "TERRAIN_MOUNTAIN" }).rule;
    const families = [{ key: "CULTURE", yieldIndex: 4, buildings: [{ type: "BUILDING_MONUMENT", rules: [mountain] }] }];
    const flat = scoreSite(w.at(15, 10), w.ctx({ adjFamilies: families, profile: getProfile("CULTURE") }));
    for (const [x, y] of [[16, 8], [14, 8], [17, 10], [13, 10]]) w.set(x, y, "mountain");
    const hilly = scoreSite(w.at(15, 10), w.ctx({ adjFamilies: families, profile: getProfile("CULTURE") }));
    assert.equal(flat.adjacency.CULTURE.sum, 0);
    assert.ok(hilly.adjacency.CULTURE.sum >= 4);
    assert.ok(hilly.reasons.some((r) => r.key === "LOC_XPL_R_ADJ_FAMILY"));
});

test("pipeline: filters, spacing between picks, deterministic ranking", () => {
    const w = new FakeWorld(40, 24);
    const own = w.at(20, 12);
    for (const { idx } of w.grid.radius(own, 1)) w.table[idx].owner = 0;
    w.disc(30, 12, 2, "ocean");
    const ctx = w.ctx({ centres: [{ idx: own, kind: "OWN", name: "Rome" }] });
    const input = {
        ctx,
        origins: [own],
        radius: 9,
        minSpacing: 3,
        minPickDist: 4,
        topN: 5,
        includeHidden: false,
        isSettleable: () => true,
    };
    const res = runToEnd(findSites(input));
    assert.equal(res.picks.length, 5);
    for (let i = 0; i < res.picks.length; i++) {
        assert.equal(res.picks[i].rank, i + 1);
        assert.ok(w.grid.distance(res.picks[i].idx, own) >= 4, "respects spacing to own centre");
        assert.ok(!w.table[res.picks[i].idx].isWater);
        for (let j = 0; j < i; j++) assert.ok(w.grid.distance(res.picks[i].idx, res.picks[j].idx) >= 4, "picks are spread");
    }
    assert.ok(res.stats.rejected.SPACING > 0);
    assert.ok(res.stats.rejected.TERRAIN > 0);
    const again = runToEnd(findSites({ ...input, ctx: w.ctx({ centres: [{ idx: own, kind: "OWN", name: "Rome" }] }) }));
    assert.deepEqual(again.picks.map((p) => p.idx), res.picks.map((p) => p.idx));
});

test("pipeline: claim check is the last filter and hidden plots are skipped", () => {
    const w = new FakeWorld(30, 20);
    const own = w.at(15, 10);
    for (const { idx, ring } of w.grid.radius(own, 8)) if (ring >= 6) w.table[idx].known = false;
    let claimCalls = 0;
    const res = runToEnd(findSites({
        ctx: w.ctx({ centres: [{ idx: own, kind: "OWN" }] }),
        origins: [own], radius: 8, minSpacing: 3, minPickDist: 4, topN: 3, includeHidden: false,
        isSettleable: () => { claimCalls++; return false; },
    }));
    assert.equal(res.picks.length, 0);
    assert.equal(res.stats.rejected.CLAIM, claimCalls);
    assert.ok(res.stats.rejected.HIDDEN > 0);
});

test("tiles another civilization owns are lost, free tiles on their border count half", () => {
    const w = new FakeWorld(30, 20);
    const free = scoreSite(w.at(15, 10), w.ctx());
    const ring3 = w.grid.radius(w.at(15, 10), 3).filter((p) => p.ring === 3).map((p) => p.idx).slice(0, 3); // three ring-3 tiles
    for (const idx of ring3) w.patch(w.grid.x(idx), w.grid.y(idx), { owner: 3 });
    const ctx = w.ctx();
    const squeezed = scoreSite(w.at(15, 10), ctx);
    assert.equal(squeezed.foreignOwned.length, 3);
    assert.ok(squeezed.foreignBorderTiles >= 2, `border tiles ${squeezed.foreignBorderTiles}`);
    assert.ok(squeezed.value < free.value - 0.03, `${squeezed.value} vs ${free.value}`);
    assert.ok(squeezed.reasons.some((r) => r.key === "LOC_XPL_R_FOREIGN_OWNED" && r.args[0] === 3));
    // Our own territory is not a "foreign border".
    const w2 = new FakeWorld(30, 20);
    for (const idx of ring3) w2.patch(w2.grid.x(idx), w2.grid.y(idx), { owner: 0 });
    assert.equal(scoreSite(w2.at(15, 10), w2.ctx()).foreignBorderTiles, 0);
});

test("pipeline: no site closer than 5 tiles to another player's settlement centre", () => {
    const w = new FakeWorld(40, 24);
    const own = w.at(14, 12);
    const foreign = w.at(24, 12);
    for (const { idx } of w.grid.radius(own, 1)) w.table[idx].owner = 0;
    const centres = [{ idx: own, kind: "OWN", name: "Rome" }, { idx: foreign, kind: "FOREIGN", name: "Carthage" }];
    const input = { origins: [own], radius: 9, minSpacing: 3, minPickDist: 4, topN: 8, includeHidden: false, isSettleable: () => true };
    const res = runToEnd(findSites({ ...input, ctx: w.ctx({ centres }), minForeignDistance: 5 }));
    assert.ok(res.picks.length > 0);
    for (const p of res.picks) assert.ok(w.grid.distance(p.idx, foreign) >= 5, `pick ${p.idx} is ${w.grid.distance(p.idx, foreign)} from Carthage`);
    assert.ok(res.scored.every((s) => w.grid.distance(s.idx, foreign) >= 5), "not even scored");
    assert.ok(res.stats.rejected.FOREIGN > 0);
    // Without the rule, sites 4 tiles from Carthage would be candidates.
    const loose = runToEnd(findSites({ ...input, ctx: w.ctx({ centres }) }));
    assert.ok(loose.scored.some((s) => w.grid.distance(s.idx, foreign) < 5), "the rule is what keeps them away");
});

test("pipeline: no site within 6 tiles of an independent's village, friendly or not (founding there makes it hostile; probe P2)", () => {
    const w = new FakeWorld(40, 24);
    const own = w.at(14, 12);
    const village = w.at(22, 12);
    for (const { idx } of w.grid.radius(own, 1)) w.table[idx].owner = 0;
    const centres = [{ idx: own, kind: "OWN", name: "Rome" }];
    const input = { origins: [own], radius: 10, minSpacing: 3, minPickDist: 4, topN: 12, includeHidden: false, isSettleable: () => true };
    const near = (res) => res.scored.map((s) => w.grid.distance(s.idx, village));
    // A neutral (or hostile) village: nothing scored within 6.
    const neutral = runToEnd(findSites({ ...input, ctx: w.ctx({ centres, villages: [{ idx: village, friendly: false }] }) }));
    assert.ok(neutral.picks.length > 0);
    assert.ok(near(neutral).every((d) => d > 6), `closest scored site ${Math.min(...near(neutral))}`);
    assert.ok(neutral.stats.rejected.INDEPENDENT > 0);
    // A friendly one too (seen in game 6: two camps at peace, our own city-states of the previous age,
    // declared a surprise war when we founded 4 and 5 tiles away, and took the town).
    const friendly = runToEnd(findSites({ ...input, ctx: w.ctx({ centres, villages: [{ idx: village, friendly: true }] }) }));
    assert.ok(near(friendly).every((d) => d > 6), `closest scored site ${Math.min(...near(friendly))}`);
    // Without villages, sites that close would be scored: the rule is what keeps them away.
    const loose = runToEnd(findSites({ ...input, ctx: w.ctx({ centres }) }));
    assert.ok(near(loose).some((d) => d <= 3));
});

test("natural wonders the site would own add culture victory points (research/26 §4.5): ring 1 in full, farther ones less, once per wonder, none owned already", () => {
    const w = new FakeWorld(30, 20);
    w.patch(16, 10, { isNaturalWonder: true, feature: "FEATURE_GRAND_MESA" });
    w.patch(17, 10, { isNaturalWonder: true, feature: "FEATURE_GRAND_MESA" }); // the same wonder, two tiles
    const site = w.at(15, 10);
    const off = scoreSiteRoles(site, w.ctx());
    const on = scoreSiteRoles(site, w.ctx({ naturalWonders: true }));
    assert.ok(Math.abs(on.value - off.value - TUNING.NATURAL_WONDER) < 0.002, `${on.value} - ${off.value}`);
    assert.equal(on.naturalWonders, 1, "one wonder of two tiles");
    assert.ok(on.reasons.some((r) => r.key === "LOC_XPL_R_NATURAL_WONDER"));
    assert.equal(off.naturalWonders, undefined, "the culture victory off: not counted");
    // Three tiles away: a quarter (growth may never reach it).
    const far = new FakeWorld(30, 20);
    far.patch(18, 10, { isNaturalWonder: true, feature: "FEATURE_X" });
    const d = scoreSiteRoles(far.at(15, 10), far.ctx({ naturalWonders: true })).value - scoreSiteRoles(far.at(15, 10), far.ctx()).value;
    assert.ok(Math.abs(d - TUNING.NATURAL_WONDER * 0.25) < 0.002, String(d));
    // Owned already (here by us, another settlement's): nothing more to gain.
    w.patch(16, 10, { owner: 0 });
    w.patch(17, 10, { owner: 0 });
    assert.equal(scoreSiteRoles(site, w.ctx({ naturalWonders: true })).naturalWonders, undefined);
});
