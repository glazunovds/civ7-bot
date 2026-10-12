/**
 * "Recalculate?" suggestions: why the last building plan or site list may be outdated.
 * Kept in the shared state, so the reasons collect while the panel is closed, show on
 * the toolbar button and in the tabs, and clear when that result is recalculated.
 * kind: "plans" | "sites"; reasons are short keys (LOC_XPL_STALE_<key> / LOC_XPL_SITES_STALE_<key>).
 */
import { state } from './xpl-state.js';

const EMPTY = Object.freeze({ plans: [], sites: [] });

export function adviceFor(kind) {
    return (state.get().advice ?? EMPTY)[kind] ?? [];
}

export function suggestRecalc(kind, reason) {
    const advice = state.get().advice ?? EMPTY;
    if ((advice[kind] ?? []).includes(reason)) return;
    state.set({ advice: { ...advice, [kind]: [...(advice[kind] ?? []), reason] } });
}

export function clearAdvice(kind) {
    const advice = state.get().advice ?? EMPTY;
    if ((advice[kind] ?? []).length === 0) return;
    state.set({ advice: { ...advice, [kind]: [] } });
}
