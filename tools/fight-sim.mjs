// The fight simulator from the command line (tests/fakes/fight-sim.mjs, the scenes in tests/fakes/fight-scenes.mjs): the
// autopilot's unit steps on game 58's village (or game 60's raids: `raids60`), or on a game's own turns (a scene from
// tools/unitmap.mjs), turn by turn, and what the generals gained.
// Usage: node tools/fight-sim.mjs [turns=20] [seeds=1] [log] [raids60] [fog] [sight=N] [scene=<file.json>] [age=antiquity]
//   seeds > 1: each seed with the game's spread of damage (±18%), and the mean; `log`: the first seed's turns.
//   scene=: replays that window (its own turns unless given) and prints the game's numbers for the same turns beside.
//   fog: we see only `sight` tiles (default 2) around our units and settlements (the fake's world.sight; the danger readers
//   count only the units we see, game 60).
import { readFileSync } from "node:fs";
import { installFakeEngine } from "../tests/fakes/fake-engine.mjs";
import { raids60, village58, replayScene, runScene } from "../tests/fakes/fight-scenes.mjs";

const args = process.argv.slice(2);
const arg = (k) => args.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? null;
const plain = args.filter((a) => !a.includes("="));
const sceneFile = arg("scene");
const data = sceneFile ? JSON.parse(readFileSync(sceneFile, "utf8")) : null;
const turns = Number(plain[0]) || data?.turns || 20;
const seeds = Number(plain[1]) || 1;
const showLog = plain.includes("log");

const scene = data ? replayScene(data) : args.includes("raids60") ? raids60() : village58();
if (args.includes("fog")) scene.world.sight = Number(arg("sight")) || 2;
const fake = installFakeEngine(scene.world, arg("age") ?? data?.age ?? "antiquity");
const units = await import("../mod/expansion-planner/ui/data/xpl-autopilot-units.js");
const steps = await import("../mod/expansion-planner/ui/data/xpl-autopilot-steps.js");
const { DEFAULT_SETTINGS } = await import("../mod/expansion-planner/ui/services/xpl-settings.js");
const mods = { fake, units, steps, settings: DEFAULT_SETTINGS };

if (data) {
    const game = data.game.slice(0, turns);
    const sum = (k) => game.reduce((a, t) => a + (t[k] ?? 0), 0);
    console.log(`scene ${sceneFile}: T${data.from}-${data.from + turns - 1}, ${data.ours.length} of ours (${data.packed?.length ?? 0} packed), ${data.theirs.length} of theirs, villages ${(data.villages ?? []).map((v) => `p${v.owner} every ${v.every} from sim turn ${v.first}`).join(", ") || "none"}; levels ${data.levels.slice(0, 4).join("/")}`);
    console.log(`game: fights ${sum("fights")} (${sum("naval")} with ships, not in the scene), kills ${sum("kills")}, lost ${sum("losses")}, in a general's radius ${sum("inRadius")} of ${sum("logged")} logged; XP ${JSON.stringify(data.gameXp ?? {})}`);
    console.log(`game by turn: ${game.map((t) => `T${t.turn} ${t.fights}${t.naval ? `(${t.naval}s)` : ""}/${t.kills}k/${t.losses}l`).join(" ")}`);
}
const rows = [];
for (let seed = 1; seed <= seeds; seed++) {
    const sim = await runScene(scene, mods, { turns, random: seeds > 1, seed, log: showLog && seed === 1 });
    const s = sim.summary();
    const xp = Object.values(s.xp).reduce((a, b) => a + b, 0);
    rows.push({ ...s, xpTotal: xp });
    const born = sim.stats.births.length ? `; births ${sim.stats.births.map((b) => `p${b.owner} T${b.turn}`).join(", ")}` : "";
    console.log(`seed ${seed}: XP ${xp} ${JSON.stringify(s.xp)}; fights ${s.combats} (${s.inRadius} in a general's radius); kills ${s.kills}; lost ${s.losses}; generals defeated ${s.commanderDefeats}${s.dispersed ? `; village dispersed T${s.dispersed}` : ""}${born}`);
    if (showLog && seed === 1) console.log(sim.stats.log.join("\n"));
}
if (rows.length > 1) {
    const mean = (k) => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
    console.log(`mean of ${rows.length}: XP ${mean("xpTotal")}, fights ${mean("combats")} (${mean("inRadius")} in radius), kills ${mean("kills")}, lost ${mean("losses")}, generals defeated ${mean("commanderDefeats")}`);
}
