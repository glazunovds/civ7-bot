/**
 * Repairs (game 60): when a pillaged tile is repaired, and from which gold. Pure: no engine globals.
 *
 * Seen in game 60 (Antiquity): 54 repairs for 1,408 gold (21% of the age's income), 31 of them re-pillaged within 1-5 turns.
 * An independent's Army Commander (a support unit, so never a raider of ours) pillaged next to Тула and Нижний Новгород every
 * second turn T89-T139, and their Woodcutters were bought back 9 times each, 24 gold a time, while a conversion goal waited.
 * Four repairs queued in the capital (a wonder city: no purchase there) waited 21-33 turns and then took a turn of production
 * each, about 107 production lost to the overflow cap.
 *
 * So an improvement (a rural tile) is bought, never queued, from the free gold; it waits while a hostile land unit of any
 * class stands near it, a while after its last repair, and on a non-final age's last turns while the gold goes to a town's
 * conversion. A building (a centre or a district) is repaired as before: first, from all the gold, queued when it cannot be
 * bought, at most REPAIR.QUEUED_MAX of them in a city's queue.
 */

export const REPAIR = Object.freeze({
    SAFE_RADIUS: 2,    // an improvement waits while a hostile land unit (a commander too) stands this close to it
    REPEAT_TURNS: 6,   // ...and this many turns after we repaired that tile (a pillager that comes back)
    QUEUED_MAX: 1,     // repairs standing in a city's queue at most (each takes a turn of production and its overflow)
});

/** Is this a repair of an improvement (a rural tile), not of a building or a wonder? */
export const isImprovementRepair = (def) => def?.ConstructibleClass === "IMPROVEMENT";

/**
 * Why an improvement's repair waits now, or null: `hostile` { type, owner, d } the nearest hostile land unit within
 * REPAIR.SAFE_RADIUS (null: none), `repairedAgo` the turns since we last repaired that tile (null: never), `conversion` the
 * town a conversion goal pays for on a non-final age's last turns while the gold covers it (null: none).
 * @returns { why: "HOSTILE" | "RECENT" | "CONVERT", ... } or null
 */
export function improvementRepairWait({ hostile = null, repairedAgo = null, conversion = null } = {}) {
    if (hostile && Number(hostile.d) <= REPAIR.SAFE_RADIUS) return { why: "HOSTILE", unit: hostile.type, owner: hostile.owner ?? null, d: Number(hostile.d) };
    if (repairedAgo !== null && Number.isFinite(Number(repairedAgo)) && Number(repairedAgo) >= 0 && Number(repairedAgo) <= REPAIR.REPEAT_TURNS) {
        return { why: "RECENT", turns: Number(repairedAgo) };
    }
    if (conversion) return { why: "CONVERT", town: conversion };
    return null;
}
