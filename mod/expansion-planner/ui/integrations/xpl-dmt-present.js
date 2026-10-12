// Loaded only when Detailed Map Tacks is active (ModInUse-gated action group in the modinfo).
globalThis.__XPL_DMT_ACTIVE = true;
window.dispatchEvent(new CustomEvent("xpl-dmt-present"));
console.warn("[XPL] Detailed Map Tacks detected (ModInUse group loaded)");
