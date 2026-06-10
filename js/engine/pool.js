// Object pool to avoid per-frame GC on phones. Items have an `alive` flag.
export class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.items = [];
  }
  spawn(init) {
    let o = null;
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i].alive) { o = this.items[i]; break; }
    }
    if (!o) { o = this.factory(); this.items.push(o); }
    this.reset(o);
    if (init) init(o);
    o.alive = true; // mark alive only after a successful init, so a throw can't leave a half-built object
    return o;
  }
  forEach(fn) {
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].alive) fn(this.items[i], i);
    }
  }
  get countAlive() {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i].alive) n++;
    return n;
  }
  clear() { for (let i = 0; i < this.items.length; i++) this.items[i].alive = false; }
}
