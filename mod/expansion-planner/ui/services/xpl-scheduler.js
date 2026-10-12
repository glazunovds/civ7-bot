/**
 * Runs generator-based jobs a few milliseconds per frame so heavy map scans never
 * freeze the UI (same idea as the base trade lens, trade-layer.js:24-53).
 * A generator yields progress fractions (0..1) and returns its result.
 * Starting a job with the same name cancels the previous one.
 */
import { log } from './xpl-log.js';

const DEFAULT_BUDGET_MS = 6;
const running = new Map();

function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function nextFrame(callback) {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(callback);
    else setTimeout(callback, 16);
}

/**
 * @param name      job name (a new job with the same name cancels the old one)
 * @param generator iterator from a generator function
 * @param options   { budgetMs: number | () => number (checked every frame), onProgress(fraction) }
 * @returns { promise, cancel() }  promise resolves to { result, elapsedMs, frames } or
 *          { cancelled: true }, and rejects if the generator throws.
 */
export function runJob(name, generator, options = {}) {
    cancelJob(name);
    const budgetOf = typeof options.budgetMs === "function" ? options.budgetMs : () => options.budgetMs ?? DEFAULT_BUDGET_MS;
    let cancelled = false;
    let frames = 0;
    let busyMs = 0;
    const startedAt = now();

    const promise = new Promise((resolve, reject) => {
        const step = () => {
            if (cancelled) {
                resolve({ cancelled: true });
                return;
            }
            frames++;
            const sliceStart = now();
            const budget = Math.max(1, Number(budgetOf()) || DEFAULT_BUDGET_MS);
            try {
                for (;;) {
                    const next = generator.next();
                    if (next.done) {
                        busyMs += now() - sliceStart;
                        running.delete(name);
                        resolve({ result: next.value, elapsedMs: Math.round(now() - startedAt), busyMs: Math.round(busyMs), frames });
                        return;
                    }
                    if (typeof next.value === "number") options.onProgress?.(next.value);
                    if (now() - sliceStart >= budget) break;
                }
            } catch (error) {
                running.delete(name);
                reject(error);
                return;
            }
            busyMs += now() - sliceStart;
            nextFrame(step);
        };
        nextFrame(step);
    });

    const handle = {
        promise,
        cancel() {
            cancelled = true;
            running.delete(name);
        },
    };
    running.set(name, handle);
    return handle;
}

export function cancelJob(name) {
    const job = running.get(name);
    if (job) {
        job.cancel();
        log.debug(`job ${name} cancelled`);
    }
}

export function isJobRunning(name) {
    return running.has(name);
}
