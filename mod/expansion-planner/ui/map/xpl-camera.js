/** Camera helpers: pan to a plot and move the plot cursor there (keeps the current zoom). */
import { PlotCursor } from '/core/ui/input/plot-cursor.js';
import { log } from '../services/xpl-log.js';

export function focusPlot(x, y) {
    const location = { x, y };
    try {
        PlotCursor.plotCursorCoords = location;
    } catch (_e) {
        // cursor is cosmetic
    }
    try {
        Camera.lookAtPlot(location);
    } catch (error) {
        log.error("Camera.lookAtPlot failed", error);
    }
}
