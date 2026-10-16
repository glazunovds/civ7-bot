/**
 * Wonder tiers (research/27 §4): what a wonder's effect is worth beyond its own yields and the
 * adjacency it gives its neighbours, which is all the autopilot's wonder choice used to count (Oxford's
 * two free technologies counted as nothing). Graded from each wonder's text in the game (71 wonders of
 * the base game and the DLCs) and a community tier list the player shared:
 *   S  free technologies, attribute points, a settlement limit, growth in every city, a free commander,
 *      gold for every wonder;
 *   A  a specialist limit, resource capacity, great works with points, celebrations, empire-wide yields;
 *   B  yields that depend on the map or on things we may not have (desert, tropical, lakes, suzerains);
 *   C  small local bonuses, war and walls;
 *   D  units and fortifications the autopilot does not use.
 * Unknown (modded) wonders count as C. Pure module.
 */
export const WONDER_TIERS = Object.freeze({
    // Antiquity
    WONDER_HANGING_GARDENS: "S",        // +10% growth in all cities, Expansionist attribute point
    WONDER_ORACLE: "S",                 // +20 culture per age on every narrative reward, Wildcard attribute point
    WONDER_TERRACOTTA_ARMY: "S",        // a free Army Commander, +25% commander experience
    WONDER_GREAT_STELE: "S",            // 200 gold per age for every wonder built, itself included
    WONDER_GREAT_LIBRARY: "A",          // +1 science on every science building, 3 great work slots, Innovation
    WONDER_NALANDA: "A",                // a codex, 2 slots, Scientific attribute point, Innovation
    WONDER_COLOSSUS: "A",               // +3 resource capacity, Economic attribute point
    WONDER_EMILE_BELL: "A",             // Diplomatic attribute point, a food endeavor
    WONDER_ANGKOR_WAT: "A",             // +1 specialist limit in its settlement
    WONDER_SANCHI_STUPA: "A",           // +1 culture for every 5 excess happiness
    WONDER_HA_AMONGA_A_MAUI: "A",       // Cultural attribute point, culture and food on fishing boats
    WONDER_MIREUKSA: "A",               // +2 culture +1 production on every urban district with an Antiquity building
    WONDER_MAUSOLEUM_OF_THEODORIC: "B", // Militaristic attribute point
    WONDER_WEIYANG_PALACE: "B",         // +1 tradition slot
    WONDER_PYRAMIDS: "B",               // gold and production on river tiles
    WONDER_PETRA: "B",                  // desert tiles only
    WONDER_MUNDO_PERDIDO: "B",          // tropical tiles only (science on improvements)
    WONDER_MONKS_MOUND: "B",            // +4 resource capacity
    WONDER_GREAT_LIGHTHOUSE: "B",       // a free merchant
    WONDER_VIX: "B",                    // culture and gold on ageless buildings, 2 slots
    WONDER_HOO_DO_HALL: "C",            // breathtaking tiles only
    WONDER_GATE_OF_ALL_NATIONS: "C",    // war support
    WONDER_PYRAMID_OF_THE_SUN: "C",     // culture on unique quarters
    WONDER_COLOSSEUM: "C",              // happiness and gold on unique quarters
    WONDER_MAUSOLEUM_AT_HALICARNASSUS: "C", // cavalry respawn
    WONDER_DUR_SHARRUKIN: "C",          // fortifications
    WONDER_BYRSA: "C",                  // coastal walls, safe trade routes
    // Exploration
    WONDER_EL_ESCORIAL: "S",            // +1 settlement limit, +4 happiness in cities within 7, 3 slots
    WONDER_SHWEDAGON_ZEDI_DAW: "S",     // Wildcard attribute point, science on appealing tiles, Innovation
    WONDER_HOUSE_OF_WISDOM: "A",        // a relic, 3 slots, +2 science from great works, Innovation
    WONDER_NOTRE_DAME: "A",             // a celebration at once, culture on specialists while celebrating
    WONDER_FORBIDDEN_CITY: "A",         // +1 culture and gold on every rural improvement
    WONDER_MACHU_PIKCHU: "A",           // buildings +1 culture and gold adjacency for mountains
    WONDER_TOMB_OF_ASKIA: "A",          // +2 resource capacity, gold and production per resource
    WONDER_RILA_MONASTERY: "B",         // a relic for every wonder built, 3 slots
    WONDER_GLOBE_THEATRE: "B",          // 3 slots, gold for great works
    WONDER_HALE_O_KEAWE: "B",           // culture on water buildings, 3 slots
    WONDER_GRAND_BAZAAR: "B",           // +2 resource capacity
    WONDER_WAT_XIENG_THONG: "B",        // 200 gold for every great work
    WONDER_HAVANA_HARBOR: "B",          // Economic attribute point, distant-lands coast only
    WONDER_WHITE_TOWER: "C",            // happiness per tradition
    WONDER_BRIHADEESWARAR_TEMPLE: "C",  // happiness adjacency for navigable rivers
    WONDER_BOROBUDUR: "C",              // unique quarters
    WONDER_SERPENT_MOUND: "C",          // unique improvements only
    WONDER_BUSEOKSA: "C",               // unique improvements of joyous settlements
    WONDER_NAN_MADOL: "C",              // islands only
    WONDER_ERDENE_ZUU: "D",             // culture for cavalry
    WONDER_REYKHOLT: "D",               // military production
    WONDER_HIMEJI_CASTLE: "D",          // fortifications
    WONDER_THANH_HUE: "D",              // needs 7 walls
    // Modern
    WONDER_OXFORD_UNIVERSITY: "S",      // 2 free technologies, Wildcard attribute point, Innovation
    WONDER_BRANDENBURG_GATE: "A",       // +1 settlement limit (military points)
    WONDER_TAJ_MAHAL: "A",              // +50% celebration length, Wildcard attribute point
    WONDER_EIFFEL_TOWER: "A",           // culture and tourism on unique quarters
    WONDER_HWASEONG: "A",               // +1 policy and tradition slot, cheap
    WONDER_UBUDIAH_MOSQUE: "A",         // +50% yields of rural improvements in its settlement
    WONDER_MANHATTAN_PROJECT: "A",      // Operation Ivy (military victory), Innovation
    WONDER_HERMITAGE: "B",              // culture with great works on display
    WONDER_PALACIO_DE_BELLAS_ARTES: "B", // an artifact, 3 slots
    WONDER_SULTANAHMET_CAMII: "B",      // culture and gold on the settlement's wonders
    WONDER_STATUE_OF_LIBERTY: "B",      // 4 migrants
    WONDER_DOGO_ONSEN: "B",             // a citizen for every celebration
    WONDER_CHENGDE_MOUNTAIN_RESORT: "B", // culture per trading civilization
    WONDER_DOI_SUTHEP: "B",             // culture and gold per suzerainty
    WONDER_MUZIBU_AZAALA_MPANGA: "B",   // lake tiles only
    WONDER_NIRAYAMA_REVERBERATORY_FURNACE: "B", // mines on resources
    WONDER_ERAM_GARDEN: "B",            // +1 specialist limit
    WONDER_WORLDS_FAIR: "C",            // tourism on wonders
    WONDER_RED_FORT: "C",               // a fortified district
    WONDER_BOUDHANATH: "C",             // influence, relationships
    WONDER_BATTERSEA_POWER_STATION: "D", // naval units
});

/** Weighted yield units added to a wonder's value (the same scale as its yields and its tile's boost). */
export const TIER_VALUE = Object.freeze({ S: 10, A: 6, B: 3, C: 1, D: 0 });

export function wonderTier(type) {
    return WONDER_TIERS[type] ?? "C";
}

export function tierValue(type) {
    return TIER_VALUE[wonderTier(type)];
}
