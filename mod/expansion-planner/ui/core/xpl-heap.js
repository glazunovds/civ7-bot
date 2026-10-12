/** Binary max-heap with a comparator (cmp(a, b) > 0 means a ranks above b). Pure module. */
export class MaxHeap {
    constructor(cmp, items = []) {
        this.cmp = cmp;
        this.items = [];
        for (const item of items) this.push(item);
    }

    get size() {
        return this.items.length;
    }

    peek() {
        return this.items[0];
    }

    push(item) {
        const a = this.items;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.cmp(a[i], a[parent]) <= 0) break;
            [a[i], a[parent]] = [a[parent], a[i]];
            i = parent;
        }
    }

    pop() {
        const a = this.items;
        if (a.length === 0) return undefined;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let best = i;
                if (l < a.length && this.cmp(a[l], a[best]) > 0) best = l;
                if (r < a.length && this.cmp(a[r], a[best]) > 0) best = r;
                if (best === i) break;
                [a[i], a[best]] = [a[best], a[i]];
                i = best;
            }
        }
        return top;
    }
}
