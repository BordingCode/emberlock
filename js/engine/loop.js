// Fixed-timestep game loop with accumulator. update() runs at a fixed 1/60s step;
// render(alpha) runs once per animation frame. Pauses when the tab is hidden.
export class GameLoop {
  constructor({ update, render, step = 1 / 60, maxSteps = 5 }) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.maxSteps = maxSteps;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.raf = 0;
    this.speed = 1;
    this._tick = this._tick.bind(this);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.last = 0; // avoid huge dt on resume
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.acc = 0;
    this.raf = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  _tick(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this._tick);
    if (document.hidden) return;
    const t = now / 1000;
    if (!this.last) { this.last = t; }
    let frame = t - this.last;
    this.last = t;
    if (frame > 0.25) frame = 0.25; // clamp after a stall
    this.acc += frame * this.speed;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSteps) {
      this.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0; // give up backlog
    this.render(this.acc / this.step);
  }
}
