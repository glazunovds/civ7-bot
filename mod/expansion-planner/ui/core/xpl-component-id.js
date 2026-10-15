/**
 * Component ids ({ owner, id, type }: units, cities, districts, query tokens) compared as the game's
 * own helpers do (core/ui/utilities/utilities-component-id.js). That module is imported by the game's
 * UI files, not a global: game 7 showed `ComponentID` undefined in our scripts, and a fallback by
 * object identity dropped every combat prediction the game sent (research/22 B1). Pure.
 */

/** The same component: owner, id and type equal (the game's ComponentID.isMatch). */
export function sameId(a, b) {
    return !!a && !!b && a.owner == b.owner && a.id == b.id && a.type == b.type;
}

/** A valid id (the game's ComponentID.isValid): owner and id not -1. */
export function validId(id) {
    return id != null && id.owner != -1 && id.id != -1;
}

/** "owner;id;type" (the game's ComponentID.toString), "" for none. */
export function idString(id) {
    if (!id) return "";
    return id.type ? `${id.owner};${id.id};${id.type}` : `${id.owner};${id.id}`;
}
