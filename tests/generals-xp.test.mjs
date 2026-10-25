// The generals' experience (game 60, Catherine, Standard speed: one general all Antiquity, level 3 with 11/60 XP, no
// commendation; research/game60's war review). Pure rules: the game speed, the first level's time, a fight's XP share, the
// promotion order's first commendation, a post's far threats and its fights lately.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    BASTION_ORDER, GENERAL, VANGUARD_ORDER, XP_DEFAULTS, belowIndependentCap, commanderTrainTurns, fightXpShare, promotionOrder,
    roleFromPromotions, speedFactor, threatPost, timeForFirstLevel,
} from "../mod/expansion-planner/ui/core/xpl-generals.js";

test("W1: the turn limits were tuned at Online; Standard doubles the time a commander takes to train (game 60: 300 production)", () => {
    assert.equal(speedFactor(50), 1, "Online");
    assert.equal(speedFactor(100), 2, "Standard");
    assert.equal(speedFactor(null), 1, "unknown: as tuned");
    assert.equal(commanderTrainTurns(speedFactor(100)), 2 * GENERAL.TRAIN_TURNS);
    // Game 60's capital at T70: 21.5 production, 14 turns for 300; 70 turns left in the age.
    assert.ok(14 <= commanderTrainTurns(2) && timeForFirstLevel(14, 70, 2));
    // 30 turns left: 14 + 20 to reach the first level does not fit (XP short of it is lost at the age change).
    assert.equal(timeForFirstLevel(14, 30, 2), false);
    assert.equal(timeForFirstLevel(14, 30, 1), true, "at Online 14 + 10");
    assert.equal(timeForFirstLevel(14, Infinity, 2), true, "no end on the clock");
});

test("W6: from EXPERIENCE_MAX_BARB_LEVEL 2 a fight against independents gives the soft cap's 1 of a melee attack's 3", () => {
    assert.equal(belowIndependentCap(1), true);
    assert.equal(belowIndependentCap(2), false);
    assert.equal(fightXpShare({ level: 0, independent: true }), 1);
    assert.equal(fightXpShare({ level: 3, independent: false }), 1, "a major's soldiers: full XP at any level");
    assert.equal(fightXpShare({ level: 2, independent: true }), XP_DEFAULTS.EXPERIENCE_BARB_SOFT_CAP / 3);
    assert.equal(fightXpShare({ level: 2, independent: true }, { EXPERIENCE_MAX_BARB_LEVEL: 3 }), 1, "the game's own parameters first");
    // A capped general's worth of an independent fight: 3 raiders count as 1.
    const t = (key, count, o = {}) => ({ key, count, damaged: false, reach: true, taken: false, turns: 0, ...o });
    assert.equal(threatPost([t("raided", 3, { xp: 1 / 3 }), t("war", 2)]), "war");
    assert.equal(threatPost([t("raided", 3), t("war", 2)]), "raided", "below the cap the raiders count whole");
});

// Game 60 A88-A98: the general stood at Тула, where our Slinger kept shooting Вьядхапура's commander; Самара, 6 turns away,
// was threatened by one raider and walled at 171/200. It walked off and its XP stood at 28/45 for 11 turns.
test("W4: a damaged centre more than 3 turns away takes a general off its fight only below 0.75 of its health", () => {
    const t = (key, count, o = {}) => ({ key, count, damaged: false, reach: true, taken: false, turns: 0, ...o });
    const tula = t("tula", 1, { fought: true });
    assert.equal(threatPost([tula, t("samara", 2, { damaged: true, health: 0.855, turns: 6 })], "tula"), "tula");
    assert.equal(threatPost([tula, t("samara", 2, { damaged: true, health: 0.5, turns: 6 })], "tula"), "samara", "below 0.75");
    assert.equal(threatPost([tula, t("samara", 1, { damaged: true, health: 0.855, turns: 2 })], "tula"), "samara", "near: any damage");
    assert.equal(threatPost([tula, t("samara", 5, { turns: 6 })], "tula"), "tula", "5 - 3 is not 3 more than 1");
    assert.equal(threatPost([tula, t("samara", 8, { turns: 6 })], "tula"), "samara", "8 - 3: 3 more");
    assert.equal(threatPost([tula]), "tula", "its fight lately, no threat: it stays");
    assert.equal(GENERAL.FAR_TURNS, 3);
    assert.equal(GENERAL.FAR_DAMAGED_SHARE, 0.75);
});

// unit-promotions.xml (base-standard data, 1.5): the five army trees. A row per parent; GrantsCommendation on each tree's end;
// GrantCommendationWithAnyPrereq only on Leadership's two ends.
const TREE = [
    ["PROMOTION_ARMY_STEADFAST", null], ["PROMOTION_ARMY_BULWARK", "PROMOTION_ARMY_STEADFAST"], ["PROMOTION_ARMY_HOLD_THE_LINE", "PROMOTION_ARMY_STEADFAST"],
    ["PROMOTION_ARMY_DEFILADE", "PROMOTION_ARMY_BULWARK"], ["PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_HOLD_THE_LINE"],
    ["PROMOTION_ARMY_RESOLUTE", "PROMOTION_ARMY_GARRISON", "end"], ["PROMOTION_ARMY_RESOLUTE", "PROMOTION_ARMY_DEFILADE", "end"],
    ["PROMOTION_ARMY_INITIATIVE", null], ["PROMOTION_ARMY_ROUT", "PROMOTION_ARMY_INITIATIVE"], ["PROMOTION_ARMY_STORM", "PROMOTION_ARMY_INITIATIVE"],
    ["PROMOTION_ARMY_SHOCK_TACTICS", "PROMOTION_ARMY_ROUT"], ["PROMOTION_ARMY_ENFILADE", "PROMOTION_ARMY_STORM"],
    ["PROMOTION_ARMY_ADVANCEMENT", "PROMOTION_ARMY_SHOCK_TACTICS", "end"], ["PROMOTION_ARMY_ADVANCEMENT", "PROMOTION_ARMY_ENFILADE", "end"],
    ["PROMOTION_ARMY_QUARTERMASTER", null], ["PROMOTION_ARMY_RECRUITMENT", null], ["PROMOTION_ARMY_REGIMENTS", "PROMOTION_ARMY_QUARTERMASTER"],
    ["PROMOTION_ARMY_REGIMENTS", "PROMOTION_ARMY_RECRUITMENT"], ["PROMOTION_ARMY_FIELD_MEDIC", "PROMOTION_ARMY_REGIMENTS"], ["PROMOTION_ARMY_LOOTING", "PROMOTION_ARMY_REGIMENTS"],
    ["PROMOTION_ARMY_SURVIVAL_TRAINING", "PROMOTION_ARMY_FIELD_MEDIC", "end"], ["PROMOTION_ARMY_SURVIVAL_TRAINING", "PROMOTION_ARMY_LOOTING", "end"],
    ["PROMOTION_ARMY_MOBILITY", null], ["PROMOTION_ARMY_HARASSMENT", "PROMOTION_ARMY_MOBILITY"], ["PROMOTION_ARMY_REDEPLOY", "PROMOTION_ARMY_MOBILITY"],
    ["PROMOTION_ARMY_AMPHIBIOUS", "PROMOTION_ARMY_HARASSMENT"], ["PROMOTION_ARMY_AMPHIBIOUS", "PROMOTION_ARMY_REDEPLOY"],
    ["PROMOTION_ARMY_PATHFINDER", "PROMOTION_ARMY_HARASSMENT"], ["PROMOTION_ARMY_PATHFINDER", "PROMOTION_ARMY_REDEPLOY"],
    ["PROMOTION_ARMY_AREA_DENIAL", "PROMOTION_ARMY_AMPHIBIOUS", "end"], ["PROMOTION_ARMY_AREA_DENIAL", "PROMOTION_ARMY_PATHFINDER", "end"],
    ["PROMOTION_ARMY_ZEAL", null], ["PROMOTION_ARMY_FIELD_COMMISSION", "PROMOTION_ARMY_ZEAL"], ["PROMOTION_ARMY_OLD_GUARD", "PROMOTION_ARMY_FIELD_COMMISSION"],
    ["PROMOTION_ARMY_RESILIENCE", "PROMOTION_ARMY_FIELD_COMMISSION"],
    ["PROMOTION_ARMY_BARRAGE", "PROMOTION_ARMY_RESILIENCE", "any"], ["PROMOTION_ARMY_BARRAGE", "PROMOTION_ARMY_OLD_GUARD", "any"],
    ["PROMOTION_ARMY_ONSLAUGHT", "PROMOTION_ARMY_OLD_GUARD", "any"], ["PROMOTION_ARMY_ONSLAUGHT", "PROMOTION_ARMY_RESILIENCE", "any"],
];
// units.js PROMOTION_PREFERENCE, the base order behind each role's own.
const BASE = [
    "PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_HOLD_THE_LINE", "PROMOTION_ARMY_GARRISON", "PROMOTION_ARMY_RESOLUTE",
    "PROMOTION_ARMY_ZEAL", "PROMOTION_ARMY_FIELD_COMMISSION", "PROMOTION_ARMY_OLD_GUARD", "PROMOTION_ARMY_BARRAGE",
    "PROMOTION_ARMY_BULWARK", "PROMOTION_ARMY_DEFILADE", "PROMOTION_ARMY_RESILIENCE", "PROMOTION_ARMY_ONSLAUGHT",
    "PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_STORM", "PROMOTION_ARMY_ROUT", "PROMOTION_ARMY_SHOCK_TACTICS",
    "PROMOTION_ARMY_ENFILADE", "PROMOTION_ARMY_ADVANCEMENT", "PROMOTION_ARMY_RECRUITMENT", "PROMOTION_ARMY_QUARTERMASTER",
    "PROMOTION_ARMY_REGIMENTS", "PROMOTION_ARMY_FIELD_MEDIC", "PROMOTION_ARMY_LOOTING", "PROMOTION_ARMY_SURVIVAL_TRAINING",
    "PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_REDEPLOY", "PROMOTION_ARMY_HARASSMENT", "PROMOTION_ARMY_PATHFINDER",
    "PROMOTION_ARMY_AMPHIBIOUS", "PROMOTION_ARMY_AREA_DENIAL",
];

/**
 * promoteUnits' picks: the first promotion in the role's order a parent of which is held (or with none). @returns the number
 * of the pick that brings the first commendation: a Leadership end by any parent, another tree's end with every parent held
 * (the stricter reading of the rows; game 60: no commendation came after three promotions in three trees).
 */
function firstCommendation(role, held = []) {
    const has = new Set(held);
    const order = promotionOrder(role, BASE);
    for (let n = held.length + 1; n <= 30; n++) {
        const pick = order.find((p) => !has.has(p) && TREE.filter((r) => r[0] === p).some((r) => r[1] === null || has.has(r[1])));
        if (!pick) return null;
        has.add(pick);
        const rows = TREE.filter((r) => r[0] === pick && r[2]);
        if (rows.length > 0 && (rows[0][2] === "any" || rows.every((r) => has.has(r[1])))) return n;
    }
    return null;
}

test("W2: the vanguard and the bastion reach a commendation by their 5th promotion: their key, then Leadership to Barrage", () => {
    assert.ok(firstCommendation("VANGUARD") <= 5, `vanguard: ${firstCommendation("VANGUARD")}`);
    assert.ok(firstCommendation("BASTION") <= 5, `bastion: ${firstCommendation("BASTION")}`);
    // Game 60's general holds Mobility, Initiative and Quartermaster: its next four are Zeal, Field Commission, Old Guard, Barrage.
    assert.ok(firstCommendation("VANGUARD", ["PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_INITIATIVE", "PROMOTION_ARMY_QUARTERMASTER"]) <= 7);
    // Each role's first pick decides it; Leadership decides none.
    assert.equal(roleFromPromotions((p) => p === VANGUARD_ORDER[0]), "VANGUARD");
    assert.equal(roleFromPromotions((p) => p === BASTION_ORDER[0]), "BASTION");
    assert.equal(roleFromPromotions((p) => ["PROMOTION_ARMY_MOBILITY", "PROMOTION_ARMY_ZEAL", "PROMOTION_ARMY_FIELD_COMMISSION", "PROMOTION_ARMY_OLD_GUARD"].includes(p)), "VANGUARD");
    assert.equal(roleFromPromotions((p) => ["PROMOTION_ARMY_STEADFAST", "PROMOTION_ARMY_ZEAL", "PROMOTION_ARMY_FIELD_COMMISSION"].includes(p)), "BASTION");
    // The vanguard's own way after Leadership.
    const v = promotionOrder("VANGUARD", BASE);
    assert.ok(v.indexOf("PROMOTION_ARMY_BARRAGE") < v.indexOf("PROMOTION_ARMY_INITIATIVE"));
    assert.ok(v.indexOf("PROMOTION_ARMY_INITIATIVE") < v.indexOf("PROMOTION_ARMY_REGIMENTS"));
});
