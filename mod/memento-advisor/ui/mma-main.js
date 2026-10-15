/**
 * Memento Advisor entry point (UIScript in the front end and in game): suggested mementos for the
 * chosen leader and civilization, ranked 1–6, on the memento selection screen. The front end
 * hosts that screen in "create-game-sp" (new game); the game in "age-transition-bootstrap" (the
 * mementos are chosen again at every age change). A decorator that fails returns a no-op one:
 * an error here must never break the game's screen.
 */
import { MmaScreenDecorator } from './mma-decorator.js';

const NOOP = { beforeAttach() {}, afterAttach() {}, beforeDetach() {}, afterDetach() {} };

function decorate(host) {
    Controls.decorate(host, (component) => {
        try {
            return new MmaScreenDecorator(component);
        } catch (error) {
            console.error("[MMA] decorator", error);
            return NOOP;
        }
    });
}

if (!globalThis.__MMA_DECORATED) {
    globalThis.__MMA_DECORATED = true;
    try {
        Controls.loadStyle("fs://game/memento-advisor/ui/mma-style.css");
        let inGame = false;
        try {
            inGame = !!UI.isInGame();
        } catch (_e) {
            inGame = false;
        }
        decorate(inGame ? "age-transition-bootstrap" : "create-game-sp");
        console.warn(`[MMA] memento advice on ${inGame ? "the age transition" : "new games"}`);
    } catch (error) {
        console.error("[MMA] start", error);
    }
}
