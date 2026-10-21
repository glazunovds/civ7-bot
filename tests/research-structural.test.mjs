// Research/40 A1: research the game's advisor cannot see ("structural": settlement caps, tradition slots, specialist caps,
// syncretic choices). Game 41: Rome Reborn (+1 tradition slot, +1 settlement cap) waited from E1 to about E60.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { pickStructural, structureKinds, structureValue } from "../mod/expansion-planner/ui/core/xpl-research-value.js";
import { wantedResearch } from "../mod/expansion-planner/ui/core/xpl-victory-levers.js";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 3, y: 5, name: "Roma" }, { owner: 0, x: 9, y: 5, name: "Ostia", isTown: true }],
};
const fake = installFakeEngine(world, "exploration");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");

const N = (t) => GameInfo.ProgressionTreeNodes.lookup(t).$hash;
const CIVIC = () => PlayerOperationTypes.SET_CULTURE_TREE_NODE;
const chosen = () => fake.sent.filter((s) => s.op === CIVIC()).map((s) => GameInfo.ProgressionTreeNodes.lookup(s.args.ProgressionTreeNodeType)?.ProgressionTreeNodeType);

test("core: structural gains by the modifier's effect, else its name; a settlement cap counts only near the cap", () => {
    assert.deepEqual(structureKinds(["MOD_TOT_TRADITION_SLOT", "MOD_EX_SETTLEMENT_CAP_INCREASE", "WONDER_PETRA", "MOD_SYNCRETISM"]), ["SLOT", "CAP", "SYNCRETIC"]);
    assert.deepEqual(structureKinds(["MOD_WHATEVER"], (t) => (t === "MOD_WHATEVER" ? "EFFECT_ADJUST_CITY_LIMIT" : null)), ["CITY_LIMIT"]);
    assert.equal(structureValue(["CAP"], { capRoom: 5 }), 0, "far below the cap");
    assert.equal(structureValue(["CAP"], { capRoom: 2 }), 1);
    assert.equal(structureValue(["SPECIALIST"]), 0.5);
    assert.equal(structureValue(["SPECIALIST"], { science: true }), 1);
    const c = (nodeType, turns, targets, repeat = false) => ({ node: nodeType, nodeType, turns, targets, repeat });
    const list = [c("A", 4, ["MOD_TOT_TRADITION_SLOT"]), c("B", 6, ["MOD_TOT_TRADITION_SLOT", "MOD_EX_SETTLEMENT_CAP_INCREASE"]), c("F", 1, ["MOD_TOT_TRADITION_SLOT"], true), c("P", 3, ["WONDER_PETRA"])];
    assert.equal(pickStructural(list, { capRoom: 1 }).nodeType, "B", "two gains in 6 turns beat one in 4; a repeatable node never");
    assert.equal(pickStructural(list, { capRoom: 9 }).nodeType, "A", "the cap does not count: the quicker slot");
    assert.equal(pickStructural([c("A", 40, ["MOD_TOT_TRADITION_SLOT"]), c("P", 5, []), c("Q", 5, [])]), null, "far slower than the other nodes (8 turns or twice the median)");
});

test("core: every age's specialist cap is the science path's research (research/40 A1, not only Exploration's)", () => {
    for (const t of ["MOD_AQ_SPECIALIST_CAP_INCREASE", "MOD_EX_SPECIALIST_CAP_INCREASE", "MOD_MO_SPECIALIST_CAP_INCREASE"]) assert.ok(wantedResearch("SCIENCE", { targets: [t] }), t);
    assert.ok(!wantedResearch("CULTURE", { targets: ["MOD_AQ_SPECIALIST_CAP_INCREASE"] }));
});

test("a tradition slot's civic goes before the advisor's quicker pick, and before the path's research when no slower", () => {
    world.research = {
        tech: { available: [] },
        culture: { available: [N("NODE_CIVIC_EX_MAIN_AUTHORITY"), N("NODE_CIVIC_EX_MAIN_MERCANTILISM")] },
        turns: { NODE_CIVIC_EX_MAIN_AUTHORITY: 6, NODE_CIVIC_EX_MAIN_MERCANTILISM: 2 },
    };
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_EX_MAIN_MERCANTILISM"), whichAdvisors: [] }];
    try {
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_AUTHORITY"], JSON.stringify(r));
        assert.equal(r.key, "STRUCTURAL_CIVIC");
        assert.match(r.args[1], /LOC_XPL_AP_STRUCT_SLOT/);
        // The science path's way (Diplomatic Service toward Social Class, 2 turns) is quicker: it goes first.
        world.research.culture.available = [N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE"), N("NODE_CIVIC_EX_MAIN_AUTHORITY")];
        world.research.turns.NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE = 2;
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE"]);
        world.research.turns.NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE = 5;
        world.research.turns.NODE_CIVIC_EX_MAIN_AUTHORITY = 5;
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, "SCIENCE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_AUTHORITY"], "as quick: the slot first");
    } finally {
        delete world.research;
        delete world.treeRecs;
    }
});

test("Hierarchy's unlocks that need our attribute trait count (a militaristic Test of Time civilization: +1 settlement cap)", () => {
    const traits = GameInfo.CivilizationTraits;
    const me = Players.get(0);
    const civType = me.civilizationType;
    const civ = GameInfo.Civilizations.find(() => true);
    world.research = {
        tech: { available: [] },
        culture: { available: [N("NODE_CIVIC_EX_HIERARCHY"), N("NODE_CIVIC_EX_MAIN_MERCANTILISM")] },
        turns: { NODE_CIVIC_EX_HIERARCHY: 5, NODE_CIVIC_EX_MAIN_MERCANTILISM: 2 },
    };
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_EX_MAIN_MERCANTILISM"), whichAdvisors: [] }];
    try {
        me.civilizationType = civ.$hash;
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_MERCANTILISM"], "not our trait: Hierarchy gives us nothing structural");
        GameInfo.CivilizationTraits = [{ CivilizationType: civ.CivilizationType, TraitType: "TRAIT_ATTRIBUTE_MILITARISTIC_TOT_EX" }];
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_HIERARCHY"], JSON.stringify(r));
        assert.match(r.args[1], /LOC_XPL_AP_STRUCT_CAP/);
    } finally {
        GameInfo.CivilizationTraits = traits;
        me.civilizationType = civType;
        delete world.research;
        delete world.treeRecs;
    }
});

test("a modifier's effect type comes from the game's tables (Modifiers → DynamicModifiers)", () => {
    const tables = { Modifiers: GameInfo.Modifiers, DynamicModifiers: GameInfo.DynamicModifiers };
    try {
        GameInfo.Modifiers = [{ ModifierId: "MOD_NO_HINT", ModifierType: "MODTYPE_X" }];
        GameInfo.DynamicModifiers = [{ ModifierType: "MODTYPE_X", EffectType: "EFFECT_PLAYER_GRANT_TRADITION_SLOTS" }];
        assert.equal(choices.modifierEffect("MOD_NO_HINT"), "EFFECT_PLAYER_GRANT_TRADITION_SLOTS");
        assert.equal(choices.modifierEffect("MOD_UNKNOWN"), null);
    } finally {
        GameInfo.Modifiers = tables.Modifiers;
        GameInfo.DynamicModifiers = tables.DynamicModifiers;
    }
});

test("probe P-RES-1: research with no advice lists the available nodes with their advisory classes", () => {
    world.research = { tech: { available: [] }, culture: { available: [N("NODE_CIVIC_EX_MAIN_MERCANTILISM")] } };
    world.treeRecs = () => [];
    const warn = console.warn;
    const lines = [];
    console.warn = (...a) => lines.push(a.join(" "));
    try {
        GameInfo.ProgressionTree_Advisories = [{ ProgressionTreeNodeType: "NODE_CIVIC_EX_MAIN_MERCANTILISM", AdvisoryClassType: "ADVISORY_CLASS_TRADE" }];
        steps.chooseResearch("culture", DEFAULT_SETTINGS, null);
        assert.ok(lines.some((l) => l.includes("probe P-RES-1") && l.includes("NODE_CIVIC_EX_MAIN_MERCANTILISM [TRADE]")), lines.join("\n"));
    } finally {
        console.warn = warn;
        delete GameInfo.ProgressionTree_Advisories;
        delete world.research;
        delete world.treeRecs;
    }
});

// Research/40 B9: the culture focus had no research of its own (every civic of game 41 came from the advisor).
test("culture focus: its path's research (relics: Theology) before the advisor's; Future Civic's culture points once nothing else is left", async () => {
    const { pickBonusResearch } = await import("../mod/expansion-planner/ui/core/xpl-victory-levers.js");
    assert.ok(wantedResearch("CULTURE", { targets: ["MOD_EX_RELIC"] }));
    assert.ok(wantedResearch("CULTURE", { targets: ["WONDER_PYRAMIDS"] }));
    assert.ok(wantedResearch("CULTURE", { targets: ["BUILDING_MUSEUM"] }));
    assert.equal(pickBonusResearch("CULTURE", [{ nodeType: "F", targets: ["MOD_MO_FUTURE_CIVIC_CULTURE_VP", "MOD_MO_ARTIFACT"], turns: 4 }])?.nodeType, "F");
    world.research = {
        tech: { available: [] },
        culture: { available: [N("NODE_CIVIC_EX_BRANCH_THEOLOGY"), N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE")] },
        turns: { NODE_CIVIC_EX_BRANCH_THEOLOGY: 6, NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE: 6 },
    };
    world.treeRecs = () => [{ recommendedType: N("NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE"), whichAdvisors: [] }];
    world.settlementCap = 20;
    try {
        fake.sent.length = 0;
        steps.chooseResearch("culture", DEFAULT_SETTINGS, null);
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_MAIN_DIPLOMATIC_SERVICE"], "no focus: the advisor's");
        fake.sent.length = 0;
        const r = steps.chooseResearch("culture", DEFAULT_SETTINGS, "CULTURE");
        assert.deepEqual(chosen(), ["NODE_CIVIC_EX_BRANCH_THEOLOGY"], JSON.stringify(r));
    } finally {
        delete world.research;
        delete world.treeRecs;
        delete world.settlementCap;
    }
});
