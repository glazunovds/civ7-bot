// A small DOM for the panel's tabs (tests only): elements with classes, attributes, children, events and simple selectors
// (tag, .class and their compounds; a descendant combinator), and a parser for our own panel HTML. The game's components
// behave as far as the tabs rely on them:
// - fxs-checkbox: `selected` set from code sends component-value-changed with { forced: true } when it changes, as the game's
//   does (root CLAUDE.md gotcha 8); `userToggle(box)` is a click: the attribute, then an unforced change;
// - fxs-dropdown: `selected-item-index` set from code sends nothing (fxs-dropdown.js onItemSelected); `userSelect(dd, i)` sends
//   dropdown-selection-change first, as a click does;
// - click events bubble (`click(el)`), like Coherent's DOM clicks the Buildings tab's toggle relies on.

class ClassList {
    constructor(el) {
        this.el = el;
    }
    get list() {
        return (this.el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
    }
    set(list) {
        this.el.attributes.set("class", [...new Set(list)].join(" "));
    }
    add(...c) {
        this.set([...this.list, ...c]);
    }
    remove(...c) {
        this.set(this.list.filter((x) => !c.includes(x)));
    }
    contains(c) {
        return this.list.includes(c);
    }
    toggle(c, force) {
        const on = force === undefined ? !this.contains(c) : !!force;
        if (on) this.add(c);
        else this.remove(c);
        return on;
    }
}

export class FakeElement {
    constructor(tag) {
        this.localName = String(tag).toLowerCase();
        this.tagName = this.localName.toUpperCase();
        this.attributes = new Map();
        this.children = [];
        this.parentElement = null;
        this.listeners = new Map();
        this.ownText = "";
        this.style = {};
        this.classList = new ClassList(this);
        this.silent = false;
    }

    get className() {
        return this.getAttribute("class") ?? "";
    }
    set className(v) {
        this.attributes.set("class", String(v));
    }

    getAttribute(k) {
        return this.attributes.has(k) ? this.attributes.get(k) : null;
    }
    hasAttribute(k) {
        return this.attributes.has(k);
    }
    removeAttribute(k) {
        this.attributes.delete(k);
    }
    setAttribute(k, v) {
        const before = this.getAttribute(k);
        this.attributes.set(k, String(v));
        this.setCount = (this.setCount ?? 0) + 1;
        if (this.localName === "fxs-checkbox" && k === "selected" && before !== String(v) && !this.silent && before !== null) {
            this.dispatchEvent({ type: "component-value-changed", detail: { value: String(v) === "true", forced: true } });
        }
    }

    appendChild(c) {
        c.remove();
        c.parentElement = this;
        this.children.push(c);
        return c;
    }
    remove() {
        const p = this.parentElement;
        if (!p) return;
        p.children.splice(p.children.indexOf(this), 1);
        this.parentElement = null;
    }
    get firstChild() {
        return this.children[0] ?? null;
    }

    get textContent() {
        return this.ownText + this.children.map((c) => c.textContent).join("");
    }
    set textContent(v) {
        for (const c of this.children) c.parentElement = null;
        this.children = [];
        this.ownText = v == null ? "" : String(v);
    }
    set innerHTML(v) {
        if (v !== "") throw new Error("fake DOM: only innerHTML = \"\"");
        this.textContent = "";
    }

    addEventListener(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(fn);
    }
    removeEventListener(type, fn) {
        const l = this.listeners.get(type) ?? [];
        const i = l.indexOf(fn);
        if (i >= 0) l.splice(i, 1);
    }
    dispatchEvent(ev) {
        ev.target ??= this;
        let stopped = false;
        ev.stopPropagation = () => (stopped = true);
        for (let node = this; node; node = ev.bubbles ? node.parentElement : null) {
            for (const fn of [...(node.listeners.get(ev.type) ?? [])]) fn(ev);
            if (stopped) break;
        }
        return true;
    }

    matches(selector) {
        const parts = selector.trim().split(/\s+/);
        if (!matchesCompound(this, parts[parts.length - 1])) return false;
        let i = parts.length - 2;
        for (let node = this.parentElement; node && i >= 0; node = node.parentElement) if (matchesCompound(node, parts[i])) i--;
        return i < 0;
    }
    querySelectorAll(selector) {
        const out = [];
        const walk = (n) => {
            for (const c of n.children) {
                if (selector.split(",").some((s) => c.matches(s))) out.push(c);
                walk(c);
            }
        };
        walk(this);
        return out;
    }
    querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
    }
    closest(selector) {
        for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
        return null;
    }
}

function matchesCompound(el, compound) {
    const m = compound.match(/^([a-z][\w-]*)?((?:\.[\w-]+)*)$/i);
    if (!m) throw new Error(`fake DOM: selector ${compound} not supported`);
    if (m[1] && el.localName !== m[1].toLowerCase()) return false;
    return (m[2] ?? "").split(".").filter(Boolean).every((c) => el.classList.contains(c));
}

/** Installs `document` (createElement only) and returns its helpers. */
export function installFakeDom() {
    globalThis.document = { createElement: (tag) => new FakeElement(tag) };
    return { parseHtml, userToggle, userSelect, click };
}

/** Our panel HTML (no comments, no self-closing tags, attributes in double quotes) into a root element holding it. */
export function parseHtml(html) {
    const root = new FakeElement("div");
    const stack = [root];
    for (const m of html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>|([^<]+)/gi)) {
        const top = stack[stack.length - 1];
        if (m[4] !== undefined) {
            if (m[4].trim()) top.ownText += m[4].trim();
            continue;
        }
        if (m[1]) {
            if (top.localName !== m[2].toLowerCase()) throw new Error(`fake DOM: </${m[2]}> closes <${top.localName}>`);
            stack.pop();
            continue;
        }
        const e = new FakeElement(m[2]);
        for (const a of m[3].matchAll(/([\w-]+)="([^"]*)"/g)) e.attributes.set(a[1], a[2]);
        top.appendChild(e);
        stack.push(e);
    }
    if (stack.length !== 1) throw new Error("fake DOM: unclosed tags");
    return root;
}

/** A click on a checkbox: its attribute, then the unforced change (the game's fxs-checkbox toggle()). */
export function userToggle(box) {
    const value = box.getAttribute("selected") !== "true";
    box.silent = true;
    box.setAttribute("selected", value ? "true" : "false");
    box.silent = false;
    box.dispatchEvent({ type: "component-value-changed", detail: { value, forced: false } });
}

/** A pick in a dropdown: the event, then the attribute (fxs-dropdown onItemSelected). */
export function userSelect(dd, index) {
    dd.dispatchEvent({ type: "dropdown-selection-change", detail: { selectedIndex: index } });
    dd.setAttribute("selected-item-index", String(index));
}

/** A DOM click, bubbling to the ancestors. */
export function click(el) {
    el.dispatchEvent({ type: "click", bubbles: true });
}
