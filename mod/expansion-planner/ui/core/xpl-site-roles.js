/**
 * One site, two possible jobs. Every new settlement starts as a town; the question is
 * whether it is better kept as a feeder town or grown into a city. Scores the candidate
 * for each wanted role and keeps the better one (both scores stay on the result for
 * display). Pure module.
 */
import { scoreSite } from './xpl-site-scorer.js';
import { scoreTownSite } from './xpl-town-scorer.js';

export const ROLE_SETS = Object.freeze({
    BOTH: ["CITY", "TOWN"],
    CITY: ["CITY"],
    TOWN: ["TOWN"],
});

export function rolesOf(setting) {
    return ROLE_SETS[setting] ?? ROLE_SETS.CITY;
}

export function scoreSiteRoles(idx, ctx, extraCentres = [], roles = ROLE_SETS.CITY) {
    const city = roles.includes("CITY") ? { ...scoreSite(idx, ctx, extraCentres), role: "CITY" } : null;
    const town = roles.includes("TOWN") ? scoreTownSite(idx, ctx, extraCentres) : null;
    const okCity = city && !city.rejected ? city : null;
    const okTown = town && !town.rejected ? town : null;
    if (!okCity && !okTown) return city ?? town;
    const best = !okTown || (okCity && okCity.value >= okTown.value) ? okCity : okTown;
    return {
        ...best,
        cityScore: okCity?.score ?? null,
        townScore: okTown?.score ?? null,
        cityValue: okCity?.value ?? null,
        townValue: okTown?.value ?? null,
    };
}
