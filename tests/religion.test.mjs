// Religion (research/40 A3, B1): pantheons and beliefs by what they give our empire, not table order (game 41: Earth Goddess,
// then Icons, Interfaith Dialogue, Conversion, Stewardship).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFakeEngine } from "./fakes/fake-engine.mjs";
import { beliefValue, pantheonValue, rankByValue } from "../mod/expansion-planner/ui/core/xpl-religion.js";

const world = {
    width: 20, height: 12, wrapX: false,
    tiles: () => ({ terrain: "TERRAIN_FLAT" }),
    players: [{ id: 0 }],
    cities: [{ owner: 0, x: 4, y: 5, name: "Roma" }, { owner: 0, x: 12, y: 5, name: "Ostia" }],
};
const fake = installFakeEngine(world);
const choices = await import("../mod/expansion-planner/ui/data/xpl-autopilot-choices.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const { getProfile } = await import("../mod/expansion-planner/ui/core/xpl-profiles.js");

const sentOf = (op) => fake.sent.filter((s) => s.op === op).map((s) => s.args.BeliefType);
const hashOf = (t) => Database.makeHash(t);

test("core: a pantheon's worth follows the empire (farms for the Harvest, quarters for Wisdom); a belief pays for our followers", () => {
    const w = getProfile("SCIENCE").y;
    const facts = { settlements: 4, production: 40, food: 30, farms: 12, quarters: 2, mines: 0, camps: 0, fishing: 0, resources: 2 };
    assert.ok(pantheonValue("PANTHEON_BONUS_6", facts, w) > pantheonValue("PANTHEON_BONUS_12", facts, w), "12 farms beat 2 quarters");
    assert.ok(pantheonValue("PANTHEON_BONUS_12", { ...facts, quarters: 16 }, w) > pantheonValue("PANTHEON_BONUS_6", facts, w));
    assert.ok(pantheonValue("PANTHEON_BONUS_2", facts, w) < pantheonValue("PANTHEON_BONUS_6", facts, w), "Earth Goddess is small");
    assert.equal(pantheonValue("PANTHEON_OF_A_MOD", facts, w), null);
    const bf = { settlements: 5, cities: 3, followers: 5, foreign: 0, specialists: 1 };
    assert.ok(beliefValue("FOUNDER_BELIEF_BONUS_16", bf, w) > beliefValue("BELIEF_BONUS_17", bf, w), "Chesed for our 5 followers beats Interfaith Dialogue's 1 each");
    assert.ok(beliefValue("BELIEF_BONUS_18", bf, w) === 0, "Stewardship: no foreign follower");
    assert.ok(beliefValue("BELIEF_BONUS_33", bf, w) > beliefValue("BELIEF_BONUS_9", bf, w), "Akhlaq (our cities) over Icons (city-states we never convert)");
    assert.deepEqual(rankByValue(["X", "A", "B"], (t) => ({ A: 1, B: 3 })[t] ?? null), ["B", "A", "X"]);
});

test("the pantheon worth most is founded, not the first the game allows; one taken already: the next", () => {
    const beliefs = GameInfo.Beliefs;
    const canStart = Game.PlayerOperations.canStart;
    const structures = world.structures;
    GameInfo.Beliefs = ["PANTHEON_BONUS_2", "PANTHEON_BONUS_12", "PANTHEON_BONUS_6"].map((t) => ({ BeliefType: t, Name: `LOC_${t}_NAME`, BeliefClassType: "BELIEF_CLASS_PANTHEON" }));
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_PANTHEON", player: 0 }];
    Players.get(0).Religion.getNumPantheonsUnlocked = () => 1;
    // Roma's ring: six farms.
    world.structures = (x, y) => (GameplayMap.getPlotDistance(x, y, 4, 5) === 1 ? { district: null, constructibles: ["IMPROVEMENT_FARM"] } : { district: null, constructibles: [] });
    try {
        fake.sent.length = 0;
        choices.choosePantheon({ ...DEFAULT_SETTINGS, profile: "FOOD" });
        assert.deepEqual(sentOf(PlayerOperationTypes.FOUND_PANTHEON), [hashOf("PANTHEON_BONUS_6")], "food first: the Harvest on six farms");
        fake.sent.length = 0;
        choices.choosePantheon({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(sentOf(PlayerOperationTypes.FOUND_PANTHEON), [hashOf("PANTHEON_BONUS_12")], "science: Wisdom on the quarters our cities will build");
        Game.PlayerOperations.canStart = (p, op, args, q) => (op === PlayerOperationTypes.FOUND_PANTHEON && args.BeliefType === hashOf("PANTHEON_BONUS_12") ? { Success: false } : canStart(p, op, args, q));
        fake.sent.length = 0;
        choices.choosePantheon({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(sentOf(PlayerOperationTypes.FOUND_PANTHEON), [hashOf("PANTHEON_BONUS_6")], "Wisdom taken by another civilization");
    } finally {
        GameInfo.Beliefs = beliefs;
        Game.PlayerOperations.canStart = canStart;
        world.structures = structures;
        delete world.notifications;
        delete Players.get(0).Religion.getNumPantheonsUnlocked;
    }
});

test("beliefs: the founder belief that pays for our own followers, and the relic belief for our own cities, not table order", async () => {
    const beliefs = GameInfo.Beliefs;
    const send = Game.PlayerOperations.sendRequest;
    const religion = Game.Religion;
    GameInfo.Beliefs = [
        { BeliefType: "BELIEF_BONUS_17", Name: "Interfaith Dialogue", BeliefClassType: "BELIEF_CLASS_FOUNDER" },
        { BeliefType: "BELIEF_BONUS_18", Name: "Stewardship", BeliefClassType: "BELIEF_CLASS_FOUNDER" },
        { BeliefType: "FOUNDER_BELIEF_BONUS_16", Name: "Chesed", BeliefClassType: "BELIEF_CLASS_FOUNDER" },
        { BeliefType: "BELIEF_BONUS_9", Name: "Icons", BeliefClassType: "BELIEF_CLASS_RELIQUARY" },
        { BeliefType: "BELIEF_BONUS_33", Name: "Akhlaq", BeliefClassType: "BELIEF_CLASS_RELIQUARY" },
    ];
    world.notifications = [{ name: "NOTIFICATION_CHOOSE_BELIEF", player: 0 }];
    Game.Religion = { isBeliefClaimable: () => true, hasBeenFounded: () => false };
    world.cities.push({ owner: 0, x: 8, y: 9, name: "Capua" }, { owner: 0, x: 16, y: 9, name: "Nola", isTown: true });
    // The game confirms each belief (BeliefAdded); one of each class here.
    let founder = false;
    Game.PlayerOperations.sendRequest = (p, op, args) => {
        send(p, op, args);
        if (op === PlayerOperationTypes.ADD_BELIEF) {
            const cls = GameInfo.Beliefs.find((b) => hashOf(b.BeliefType) === args.BeliefType)?.BeliefClassType;
            if (cls === "BELIEF_CLASS_FOUNDER") founder = true;
            setTimeout(() => engine.trigger("BeliefAdded", {}), 1);
        }
    };
    const canStart = Game.PlayerOperations.canStart;
    Game.PlayerOperations.canStart = (p, op, args, q) => {
        if (op !== PlayerOperationTypes.ADD_BELIEF) return canStart(p, op, args, q);
        const cls = GameInfo.Beliefs.find((b) => hashOf(b.BeliefType) === args.BeliefType)?.BeliefClassType;
        return { Success: !(cls === "BELIEF_CLASS_FOUNDER" && founder) && fake.sent.filter((s) => s.op === PlayerOperationTypes.ADD_BELIEF).length < 2 };
    };
    try {
        delete globalThis.LfYieldsPreview;
        fake.sent.length = 0;
        await choices.foundReligion({ ...DEFAULT_SETTINGS, profile: "SCIENCE" });
        assert.deepEqual(sentOf(PlayerOperationTypes.ADD_BELIEF), [hashOf("FOUNDER_BELIEF_BONUS_16"), hashOf("BELIEF_BONUS_33")]);
    } finally {
        GameInfo.Beliefs = beliefs;
        Game.PlayerOperations.sendRequest = send;
        Game.PlayerOperations.canStart = canStart;
        Game.Religion = religion;
        world.cities.splice(2);
        delete world.notifications;
    }
});
