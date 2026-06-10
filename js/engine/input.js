// Twin-stick multi-touch input, tracked by pointerId (KB: input-and-controls).
// Left ~44% of screen = floating move stick planted where the thumb lands.
// Right side = drag-to-aim with a trajectory preview; RELEASE fires; releasing
// near the origin (or a pointercancel) cancels cleanly — no misfires.
export class TwinStick {
  constructor(canvas, view) {
    this.view = view;
    this.move = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.aim = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.fired = null;          // {nx,ny} set on aim release, consumed by the sim
    this.anyTap = false;        // any pointerdown this frame (menu/unlock audio)

    const onDown = (e) => {
      this.anyTap = true;
      if (e.target && e.target.closest && e.target.closest('.spell-btn, .btn, button, .card')) return;
      const p = view.toWorld(e.clientX, e.clientY);
      const isLeft = e.clientX < view.cssW * 0.44;
      if (isLeft && this.move.id === null) {
        this.move.id = e.pointerId;
        this.move.ox = p.x; this.move.oy = p.y; this.move.x = p.x; this.move.y = p.y;
      } else if (this.aim.id === null) {
        this.aim.id = e.pointerId;
        this.aim.ox = p.x; this.aim.oy = p.y; this.aim.x = p.x; this.aim.y = p.y;
      } else if (this.move.id === null) {
        // both thumbs already busy never happens; but allow late move stick on right-handed lefties
        this.move.id = e.pointerId;
        this.move.ox = p.x; this.move.oy = p.y; this.move.x = p.x; this.move.y = p.y;
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      const p = view.toWorld(e.clientX, e.clientY);
      if (e.pointerId === this.move.id) { this.move.x = p.x; this.move.y = p.y; e.preventDefault(); }
      else if (e.pointerId === this.aim.id) { this.aim.x = p.x; this.aim.y = p.y; e.preventDefault(); }
    };
    const onUp = (e) => {
      if (e.pointerId === this.move.id) this.move.id = null;
      else if (e.pointerId === this.aim.id) {
        const dx = this.aim.x - this.aim.ox, dy = this.aim.y - this.aim.oy;
        const len = Math.hypot(dx, dy);
        if (len >= 16) this.fired = { nx: dx / len, ny: dy / len };
        this.aim.id = null;
      }
    };
    const onCancel = (e) => {
      // the browser stole the gesture (scroll etc.) — end without firing
      if (e.pointerId === this.move.id) this.move.id = null;
      if (e.pointerId === this.aim.id) this.aim.id = null;
    };
    canvas.addEventListener('pointerdown', onDown, { passive: false });
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  // {mag 0..1, nx, ny} from the floating stick
  joystick(maxR = 60) {
    if (this.move.id === null) return { mag: 0, nx: 0, ny: 0 };
    const dx = this.move.x - this.move.ox, dy = this.move.y - this.move.oy;
    const len = Math.hypot(dx, dy);
    if (len < 4) return { mag: 0, nx: 0, ny: 0 };
    return { mag: Math.min(len, maxR) / maxR, nx: dx / len, ny: dy / len };
  }

  // current aim drag, for the trajectory preview and aimed spells
  aiming() {
    if (this.aim.id === null) return null;
    const dx = this.aim.x - this.aim.ox, dy = this.aim.y - this.aim.oy;
    const len = Math.hypot(dx, dy);
    if (len < 16) return null;
    return { nx: dx / len, ny: dy / len, len };
  }

  takeFire() { const f = this.fired; this.fired = null; return f; }
  consumeTap() { const t = this.anyTap; this.anyTap = false; return t; }
}
