// Keyboard and mouse input. Held keys give a movement vector and the fire/handbrake holds; one-shot
// presses (enter/exit, use, pause, a single shot) are latched and cleared by the loop each frame, so
// a press between frames is never lost and never counted twice. The mouse aim is reported in canvas
// screen coordinates for the caller to unproject through the camera.
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const ENTER = new Set(['KeyE']);
const USE = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const HAND = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const keys = new Set();
  let fireHeld = false;
  let firePressed = false;
  let enterPressed = false;
  let usePressed = false;
  let pausePressed = false;
  let aim = { x: 0, y: 0 };

  window.addEventListener('keydown', (event) => {
    if (ENTER.has(event.code)) {
      if (!event.repeat) enterPressed = true;
    } else if (USE.has(event.code)) {
      if (!event.repeat) usePressed = true;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) pausePressed = true;
    } else if (event.code === 'Space') {
      if (!event.repeat) firePressed = true;
      fireHeld = true;
    } else if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || HAND.has(event.code)) {
      keys.add(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') fireHeld = false;
    else keys.delete(event.code);
  });

  window.addEventListener('blur', () => {
    keys.clear();
    fireHeld = false;
  });

  const rect = () => target.getBoundingClientRect();
  target.addEventListener('pointermove', (event) => {
    const r = rect();
    aim = { x: event.clientX - r.left, y: event.clientY - r.top };
  });
  target.addEventListener('pointerdown', (event) => {
    const r = rect();
    aim = { x: event.clientX - r.left, y: event.clientY - r.top };
    fireHeld = true;
    firePressed = true;
  });
  target.addEventListener('pointerup', () => {
    fireHeld = false;
  });
  target.addEventListener('pointerleave', () => {
    fireHeld = false;
  });

  const held = (set) => {
    for (const code of set) if (keys.has(code)) return true;
    return false;
  };

  return {
    move() {
      const x = (held(RIGHT) ? 1 : 0) - (held(LEFT) ? 1 : 0);
      const y = (held(DOWN) ? 1 : 0) - (held(UP) ? 1 : 0);
      return { x, y };
    },
    get fire() {
      return fireHeld;
    },
    get firePressed() {
      return firePressed;
    },
    get enter() {
      return enterPressed;
    },
    get use() {
      return usePressed;
    },
    get pause() {
      return pausePressed;
    },
    get handbrake() {
      return held(HAND);
    },
    get aim() {
      return aim;
    },
    clearPresses() {
      firePressed = false;
      enterPressed = false;
      usePressed = false;
      pausePressed = false;
    },
  };
}
