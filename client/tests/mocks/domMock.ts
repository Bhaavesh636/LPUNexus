/**
 * Lightweight, zero-dependency Mock DOM implementation for unit testing
 * pure DOM inspection modules (`umsDetector.ts` and `umsPreflight.ts`).
 */

export class MockElement {
  tagName: string;
  id: string = '';
  className: string = '';
  textContent: string = '';
  hidden: boolean = false;
  style: Record<string, string> = {};
  attributes: Map<string, string> = new Map();
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  clicked: boolean = false;
  clickCount: number = 0;
  rect: { width: number; height: number } = { width: 100, height: 100 };

  constructor(tagName: string, id: string = '', className: string = '', textContent: string = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.textContent = textContent;
  }

  getAttribute(name: string): string | null {
    const lower = name.toLowerCase();
    if (lower === 'id') return this.id || null;
    if (lower === 'class') return this.className || null;
    if (lower === 'style') {
      const styles = Object.entries(this.style)
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ');
      return styles || null;
    }
    return this.attributes.get(lower) ?? null;
  }

  setAttribute(name: string, value: string): void {
    const lower = name.toLowerCase();
    if (lower === 'id') {
      this.id = value;
    } else if (lower === 'class') {
      this.className = value;
    } else if (lower === 'style') {
      // Parse basic "display: none; visibility: hidden" string
      const pairs = value.split(';');
      for (const pair of pairs) {
        const [k, v] = pair.split(':');
        if (k && v) {
          this.style[k.trim().toLowerCase()] = v.trim().toLowerCase();
        }
      }
    } else {
      this.attributes.set(lower, value);
    }
  }

  getBoundingClientRect(): { width: number; height: number } {
    return this.rect;
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  contains(other: MockElement | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    let curr: MockElement | null = other.parentElement;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  click(): void {
    this.clicked = true;
    this.clickCount += 1;
  }

  matches(selector: string): boolean {
    const trimmed = selector.trim();
    if (!trimmed) return false;

    // Split on attribute selectors, classes, and IDs
    // Example: input[type="submit"][value*="login" i] or .modal.show or div[id*="CampusDrive" i]
    let remaining = trimmed;

    // 1. Tag name check
    const tagMatch = remaining.match(/^[a-zA-Z0-9]+/);
    if (tagMatch) {
      const expectedTag = tagMatch[0]?.toUpperCase();
      if (this.tagName !== expectedTag) return false;
      remaining = remaining.slice(tagMatch[0]?.length ?? 0);
    }

    // 2. ID check: #id
    const idMatch = remaining.match(/^#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      if (this.id !== idMatch[1]) return false;
      remaining = remaining.slice(idMatch[0]?.length ?? 0);
    }

    // 3. Classes check: .class1.class2
    while (remaining.startsWith('.')) {
      const classMatch = remaining.match(/^\.([a-zA-Z0-9_-]+)/);
      if (!classMatch) break;
      const expectedClass = classMatch[1] ?? '';
      const classes = this.className.split(/\s+/).filter(Boolean);
      if (!classes.includes(expectedClass)) return false;
      remaining = remaining.slice(classMatch[0]?.length ?? 0);
    }

    // 4. Attributes check: [attr], [attr="val"], [attr*="val" i], [attr*="val"]
    while (remaining.startsWith('[')) {
      const endBracket = remaining.indexOf(']');
      if (endBracket === -1) break;
      const attrExpr = remaining.slice(1, endBracket).trim();
      remaining = remaining.slice(endBracket + 1);

      const opMatch = attrExpr.match(/^([a-zA-Z0-9_-]+)\s*(\*=|=)\s*(['"]?)(.*?)\3(\s+i)?$/);
      if (!opMatch) {
        // Simple presence check [attr]
        const attrVal = this.getAttribute(attrExpr);
        if (attrVal === null) return false;
      } else {
        const attrName = opMatch[1] ?? '';
        const op = opMatch[2];
        const rawExpected = opMatch[4] ?? '';
        const isCaseInsensitive = Boolean(opMatch[5]);

        const actualVal = this.getAttribute(attrName);
        if (actualVal === null) return false;

        const val = isCaseInsensitive ? actualVal.toLowerCase() : actualVal;
        const expected = isCaseInsensitive ? rawExpected.toLowerCase() : rawExpected;

        if (op === '=') {
          if (val !== expected) return false;
        } else if (op === '*=') {
          if (!val.includes(expected)) return false;
        }
      }
    }

    return remaining.length === 0;
  }

  querySelector(selector: string): MockElement | null {
    const list = this.querySelectorAll(selector);
    return list[0] ?? null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const subSelectors = selector.split(',').map((s) => s.trim());

    const traverse = (el: MockElement) => {
      for (const sel of subSelectors) {
        if (el.matches(sel)) {
          results.push(el);
          break; // Avoid duplicate match from multiple comma-separated branches
        }
      }
      for (const child of el.children) {
        traverse(child);
      }
    };

    for (const child of this.children) {
      traverse(child);
    }

    return results;
  }
}

export class MockDocument {
  title: string = '';
  body: MockElement;
  head: MockElement;

  constructor() {
    this.body = new MockElement('BODY');
    this.head = new MockElement('HEAD');
  }

  querySelector(selector: string): MockElement | null {
    const subSelectors = selector.split(',').map((s) => s.trim());
    for (const sel of subSelectors) {
      if (this.body.matches(sel)) return this.body;
      const found = this.body.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const subSelectors = selector.split(',').map((s) => s.trim());
    for (const sel of subSelectors) {
      if (this.body.matches(sel)) results.push(this.body);
    }
    results.push(...this.body.querySelectorAll(selector));
    return results;
  }

  createElement(tagName: string, id: string = '', className: string = '', textContent: string = ''): MockElement {
    return new MockElement(tagName, id, className, textContent);
  }
}

// Polyfill global Element and HTMLElement in Node.js test environment
if (typeof globalThis.HTMLElement === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).HTMLElement = MockElement;
}
if (typeof globalThis.Element === 'undefined') {
  (globalThis as unknown as Record<string, unknown>).Element = MockElement;
}

