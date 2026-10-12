// Static import checker for the mod's ES modules.
// Resolves every `import ... from '<spec>'` against the real game files (read-only)
// and verifies that the file exists and that each named/default import is exported.
// Usage: node tools/check-imports.mjs [modFolder modId]   (default: this mod)
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MOD_ROOT = process.argv[2] ? resolve(process.argv[2]) : resolve(here, "../mod/expansion-planner");
const MOD_ID = process.argv[3] ?? "expansion-planner";
const GAME_MODULES = "D:/SteamLibrary/steamapps/common/Sid Meier's Civilization VII/Base/modules";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/1295660";
// Absolute-import roots: '/<mod-id>/...'
const ROOTS = {
    "core": join(GAME_MODULES, "core"),
    "base-standard": join(GAME_MODULES, "base-standard"),
    [MOD_ID]: MOD_ROOT,
    "detailed-map-tacks": join(WORKSHOP, "3507297712"),
};

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.m?js$/.test(name)) out.push(p);
    }
    return out;
}

function resolveSpec(spec, fromFile) {
    if (spec.startsWith("./") || spec.startsWith("../")) return resolve(dirname(fromFile), spec);
    if (spec.startsWith("/")) {
        const [, root, ...rest] = spec.split("/");
        if (ROOTS[root]) return join(ROOTS[root], ...rest);
        return null;
    }
    return null; // bare specifiers are not used in game UI
}

function exportsOf(file) {
    const src = readFileSync(file, "utf8");
    const names = new Set();
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
            const p = part.trim();
            if (!p) continue;
            const asMatch = p.match(/^(\S+)\s+as\s+(\S+)$/);
            names.add(asMatch ? asMatch[2] : p);
        }
    }
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    if (/export\s+default\b/.test(src)) names.add("default");
    return names;
}

const IMPORT_RE = /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s+as\s+[\w$]+\s*)?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

let problems = 0;
let checked = 0;
const SKIP_DIRS = /[\\/](node_modules|ci|types|\.github)[\\/]/;
for (const file of walk(MOD_ROOT).filter((f) => !SKIP_DIRS.test(f))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
        const [, defName, named, spec1, spec2] = m;
        const spec = spec1 ?? spec2;
        const target = resolveSpec(spec, file);
        const where = relative(MOD_ROOT, file);
        checked++;
        if (!target) { console.log(`?    ${where}: unresolvable '${spec}'`); problems++; continue; }
        if (!existsSync(target)) { console.log(`MISS ${where}: '${spec}' -> ${target}`); problems++; continue; }
        const exp = exportsOf(target);
        if (defName && !exp.has("default")) { console.log(`DEF  ${where}: '${spec}' has no default export`); problems++; }
        for (const part of (named ?? "").split(",")) {
            const p = part.trim();
            if (!p) continue;
            const name = p.split(/\s+as\s+/)[0].trim();
            if (!exp.has(name)) { console.log(`NAME ${where}: '${name}' not exported by '${spec}'`); problems++; }
        }
    }
}
console.log(`${checked} imports checked, ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
