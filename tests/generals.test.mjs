// Two generals (research/41 Phase 2; game 48): a vanguard and a bastion by what they took, posts at the worst fight, the
// commander's tile over the soldiers about to fight, and what the generals' effects are worth.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GENERAL, assignRoles, keyPromotionsLeft, promotionOrder, roleFromPromotions, threatPost } from "../mod/expansion-planner/ui/core/xpl-generals.js";
import { FORM, commanderTile } from "../mod/expansion-planner/ui/core/xpl-formation.js";
import { LUMP_TURNS, effectYields } from "../mod/expansion-planner/ui/core/xpl-effect-value.js";

const has = (...list) => (p) => list.includes(p);

test("roles come from what a commander took; of the undecided the one with the most XP is the vanguard when none is", () => {
    assert.equal(roleFromPromotions(has()), null);
    assert.equal(roleFromPromotions(has("PROMOTION_ARMY_INITIATIVE")), "VANGUARD", "a Hazarapatis starts with Initiative");
    assert.equal(roleFromPromotions(has("PROMOTION_ARMY_STEADFAST")), "BASTION");
    const two = assignRoles([{ key: "a", has: has(), xp: 3 }, { key: "b", has: has(), xp: 9 }]);
    assert.deepEqual([two.get("a"), two.get("b")], ["BASTION", "VANGUARD"], "the most XP is the vanguard");
    const decided = assignRoles([{ key: "a", has: has(), xp: 9 }, { key: "b", has: has("PROMOTION_ARMY_MOBILITY"), xp: 0 }]);
    assert.deepEqual([decided.get("a"), decided.get("b")], ["BASTION", "VANGUARD"], "a vanguard by its promotions: the other is the bastion");
    assert.equal(assignRoles([{ key: "a", has: has(), xp: 0 }]).get("a"), "VANGUARD", "alone: the vanguard");
});

test("the vanguard's four key promotions (Quartermaster or Recruitment opens Regiments); its order before the base", () => {
    assert.equal(keyPromotionsLeft("VANGUARD", has()), 4);
    assert.equal(keyPromotionsLeft("VANGUARD", has("PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_RECRUITMENT")), 2);
    assert.equal(keyPromotionsLeft("BASTION", has("PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_BULWARK", "PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_RESOLUTE")), 0);
    const base = ["PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_MOBILITY"];
    const b = promotionOrder("BASTION", base);
    assert.equal(b[0], "PROMOTION_ARMY_STEADFAST", "the bastion's key first");
    assert.ok(b.indexOf("PROMOTION_ARMY_STEADFAST") < b.indexOf("PROMOTION_ARMY_MOBILITY"), "then the base's order");
    assert.equal(b.filter((p) => p === "PROMOTION_ARMY_STEADFAST").length, 1);
    const v = promotionOrder("VANGUARD", base);
    assert.ok(v.indexOf("PROMOTION_ARMY_MOBILITY") < v.indexOf("PROMOTION_ARMY_STEADFAST"));
    assert.equal(v.filter((p) => p === "PROMOTION_ARMY_MOBILITY").length, 1);
});

// Game 48: both commanders kept their posts at settlements with one raider while Киото, 7 raiders, fell at A59.
test("a commander leaves its post for a much worse fight or a damaged centre; a free post first, else the fight is shared", () => {
    const t = (key, count, o = {}) => ({ key, count, damaged: false, reach: true, taken: false, ...o });
    assert.equal(threatPost([t("kyoto", 7), t("own", 1)], "own"), "kyoto", `${GENERAL.SWITCH_RAIDERS} more raiders`);
    assert.equal(threatPost([t("other", 3), t("own", 1)], "own"), "own", "two more is not worth the walk");
    assert.equal(threatPost([t("hit", 1, { damaged: true }), t("own", 2)], "own"), "hit", "a damaged centre");
    assert.equal(threatPost([t("hit", 1, { damaged: true }), t("own", 2, { damaged: true })], "own"), "own");
    assert.equal(threatPost([t("kyoto", 7, { taken: true }), t("b", 2)]), "b", "one no other commander holds");
    assert.equal(threatPost([t("kyoto", 7, { taken: true })]), "kyoto", "else shared: every general near the fight");
    assert.equal(threatPost([t("far", 9, { reach: false })]), null, "not reached in time");
    assert.equal(threatPost([t("own", 1, { taken: true }), t("b", 2)], "own"), "own", "its own post, shared or not");
});

test("the commander's tile covers the soldiers about to fight before the others (research/41 §4D: its XP)", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const at = (x, y) => ({ x, y });
    const f = { centre: at(0, 0), land: [at(5, 0)], targets: [at(5, 0)], sectors: [[at(5, 0)]], members: [], dist: line };
    // Two soldiers west (idle), two east next to the raider (fighting); the commander at 0,0 covers none (radius 1).
    const soldiers = [at(-2, 0), at(-2, 1), at(4, 1), at(4, -1)];
    const fighters = [at(4, 1), at(4, -1)];
    const tiles = [at(-2, -1), at(3, 0)];
    const pick = commanderTile(f, { at: at(0, 3), radius: 2 }, soldiers, tiles, () => true, FORM.COMMANDER_GAIN, fighters);
    assert.deepEqual(pick?.to, at(3, 0), JSON.stringify(pick));
    const plain = commanderTile(f, { at: at(0, 3), radius: 2 }, soldiers, tiles, () => true, FORM.COMMANDER_GAIN);
    assert.deepEqual(plain?.to, at(-2, -1), "without the fighters the first of two equal tiles");
});

test("a tile whose radius reaches one soldier about to fight beats one covering three idle ones (FORM.FOCUS: a focused attack, after game 54)", () => {
    const line = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const at = (x, y) => ({ x, y });
    const f = { centre: at(0, 0), land: [at(5, 0)], targets: [at(5, 0)], sectors: [[at(5, 0)]], members: [], dist: line };
    // Three idle soldiers west, one east next to the raider; radius 1.
    const soldiers = [at(-3, 0), at(-2, 1), at(-2, -1), at(4, 0)];
    const fighters = [at(4, 0)];
    const tiles = [at(-2, 0), at(3, 0)];
    const pick = commanderTile(f, { at: at(0, 4), radius: 1 }, soldiers, tiles, () => true, FORM.COMMANDER_GAIN, fighters);
    assert.deepEqual(pick?.to, at(3, 0), JSON.stringify(pick));
    assert.ok(FORM.COVER + FORM.FIGHT_COVER + FORM.FOCUS > 3 * FORM.COVER, "one fight over three idle soldiers");
});

test("the generals' effects are worth something only while a commander wants promotions or fights (research/41 §4E)", () => {
    const promo = [{ effect: "EFFECT_GRANT_UNIT_PROMOTION", args: { Amount: 1 } }];
    const xp = [{ effect: "EFFECT_ARMY_ADJUST_EXPERIENCE_RATE", args: { Percent: 30 } }];
    const move = [{ effect: "EFFECT_ARMY_ADJUST_MOVEMENT_RATE", args: { Amount: 1 } }];
    const p = (effects, generals) => effectYields(effects, { generals }).YIELD_PRODUCTION ?? 0;
    assert.equal(p(promo, null), 0, "no commander");
    assert.equal(p(promo, { commanders: 2, wanting: false, fighting: true }), 0, "every key promotion taken");
    assert.equal(p(promo, { commanders: 2, wanting: true, fighting: false }), (GENERAL.PROMOTION_VALUE * 2) / LUMP_TURNS);
    assert.equal(p(xp, { commanders: 1, wanting: true, fighting: false }), 0, "XP only while one fights");
    assert.equal(p(xp, { commanders: 1, wanting: true, fighting: true }), GENERAL.XP_RATE_VALUE * 3);
    assert.equal(p(move, { commanders: 1, wanting: false, fighting: false }), 0);
    assert.equal(p(move, { commanders: 1, wanting: false, fighting: true }), GENERAL.MOVEMENT_VALUE);
});

// Game 54: the generals walked 4-6 turns behind the raids; a fight's worth falls with the walk there.
test("a fight's worth is its raiders less half a raider a turn of the walk; a damaged centre adds 3", () => {
    const t = (key, count, o = {}) => ({ key, count, damaged: false, reach: true, taken: false, turns: 0, ...o });
    assert.equal(threatPost([t("far", 6, { turns: 6 }), t("near", 4)]), "near", "6 - 3 against 4");
    assert.equal(threatPost([t("far", 8, { turns: 6 }), t("near", 4)]), "far", "8 - 3 against 4");
    assert.equal(threatPost([t("here", 2), t("post", 4, { turns: 3 })], "here"), "here", "the fight it stands at: 2 against 4 - 1.5, not 3 more");
    assert.equal(threatPost([t("here", 1), t("post", 7, { turns: 2 })], "here"), "post", "7 - 1 against 1: worth the walk");
    assert.equal(GENERAL.TURN_COST * 2, 1);
});
