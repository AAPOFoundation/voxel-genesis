// Connect viewer controls, rendering and local state events.
import { createPlayer, MOTION } from './player.mjs';
import { C, townHud } from './copy.mjs';
import { packOf } from './core/rules.mjs';
import { fitCamera } from './camera.mjs';
import { CachedCanvasRenderer } from './canvas-renderer.mjs';
import { GLRenderer } from './gl-renderer.mjs';
import { tappable } from './tap.mjs';
let canvas = document.querySelector('#world');
const name = document.querySelector('#name');
const count = document.querySelector('#count');
const status = document.querySelector('#status');
const hud = document.querySelector('#hud');
const chips = ['turn', 'people', 'happy', 'coins'].map(id =>
  document.querySelector('#hud-' + id));
const goal = document.querySelector('#hud-goal');
const goalLabel = document.querySelector('#hud-label');
const end = document.querySelector('#hud-end');
const needs = document.querySelector('#hud-needs');
const params = new URLSearchParams(location.search);
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const motionReduce = params.get('motion') === 'reduce';
const media = {
  get matches() {
    return motionReduce || motionQuery.matches;
  },
  addEventListener(type, fn) {
    motionQuery.addEventListener(type, event => {
      fn(motionReduce ? { matches: true } : event);
    });
  }
};
const player = createPlayer(window.AapoVoxel, {
  reduced: media.matches, onChange: updateHud
});
let renderer = null;
let loading = null;
let turn = 0;
let targetYaw = Math.PI - .7;
let zoom = 1;
let previous = 0;
let drag = null;
let events = null;
const bench = params.get('bench') === '1';
const stepping = params.get('step') === '1';
const samples = [];
const gaps = [];
let canvasOnly = params.get('renderer') === 'canvas';
let benchStarted = false;
let posted = false;
function makeRenderer() {
  renderer?.dispose?.();
  renderer = null;
  if (!canvasOnly) {
    try {
      renderer = GLRenderer.create(canvas, player.world, { reduced: media.matches });
    } catch {} if (!renderer) {
      canvasOnly = true;
    }
  }
  if (!renderer) {
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
    bindCanvas();
    renderer = new CachedCanvasRenderer(window.AapoVoxel, canvas, player.world,
      { reduced: media.matches });
    renderer.kind = 'canvas';
  }
  renderer.yaw = targetYaw;
  fitCamera(renderer, canvas.width, canvas.height, zoom);
  samples.length = 0;
  gaps.length = 0;
  benchStarted = false;
}
function labels() {
  if (!player.world) {
    status.textContent = C.waiting;
    return;
  }
  name.textContent = player.world.name.replaceAll('-', ' ').replace(
    /^./,
    letter => letter.toUpperCase()
  );
  count.textContent = player.world.cells.reduce((n, v) => n + (v > 0), 0) +
  ' ' + C.blocks;
}
function updateHud() {
  document.dispatchEvent?.(new CustomEvent('kit-change', { detail: player.world }));
  const value = player.world ? packOf(player.world).hud?.(player.world) : null;
  hud.hidden = !value;
  if (!value) return;
  const text = townHud(value);
  const update = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  text.chips.forEach((text, i) => update(chips[i], text));
  if (needs.textContent !== text.needs.join('')) {
    needs.replaceChildren(...text.needs.map(text => {
      const chip = document.createElement('span');
      chip.textContent = text;
      return chip;
    }));
  }
  goal.value = value.hearts;
  update(goalLabel, text.progress);
  update(end, text.end);
}
async function load() {
  if (loading) {
    return loading;
  }
  loading = (
    async () => {
      try {
        const response = await fetch('/api/state');
        if (!response.ok) {
          throw new Error(C.reconnect);
        }
        const state = await response.json();
        player.load(state);
        if (player.world) {
          makeRenderer();
          status.textContent = '';
        } else {
          renderer?.dispose?.();
          renderer = null;
        }
        labels();
      } catch {
        status.textContent = C.reconnect;
      } finally {
        loading = null;
      }
    }
  )();
  return loading;
}
function connect() {
  events?.close();
  events = new EventSource('/api/events');
  events.onopen = () => {
    load();
  };
  events.onerror = () => {
    status.textContent = C.reconnect;
  };
  events.onmessage = e => {
    try {
      if (document.hidden) {
        player.hidden();
        return;
      }
      player.enqueue(JSON.parse(e.data));
      if (!renderer && player.world) makeRenderer();
      if (player.needsState) {
        load();
      }
    } catch {
      load();
    }
  };
}
document.querySelector('#left').onclick = () => {
  targetYaw -= Math.PI / 2;
};
document.querySelector('#right').onclick = () => {
  targetYaw += Math.PI / 2;
};
document.querySelector('#zoom-in').onclick = () => {
  zoom = Math.max(.6, zoom / 1.15);
};
document.querySelector('#zoom-out').onclick = () => {
  zoom = Math.min(2, zoom * 1.15);
};
document.querySelector('#pause').onclick = e => {
  player.paused = !player.paused;
  e.currentTarget.textContent = player.paused ? C.play: C.pause;
  e.currentTarget.setAttribute('aria-label', player.paused ? C.play: C.pause);
  e.currentTarget.setAttribute('aria-pressed', String(player.paused));
};
let inputSentTimer;
let latestInput = 0;
async function postInput(value) {
  const input = ++latestInput;
  clearTimeout(inputSentTimer);
  try {
    const response = await fetch('/api/input', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) {
      const raw = (await response.json()).error;
      if (input === latestInput && typeof raw === 'string') {
        const error = raw.replace(/^input: /, '');
        status.textContent = error.charAt(0).toUpperCase() + error.slice(1);
      }
    } else if (input === latestInput) {
      status.textContent = C.inputSent;
      inputSentTimer = setTimeout(() => {
        if (input === latestInput && status.textContent === C.inputSent) status.textContent = '';
      }, 2000);
    }
  } catch {
    if (input === latestInput) status.textContent = C.reconnect;
  }
}
function bindCanvas() {
  canvas.onpointerdown = e => {
    if (e.button !== 0 || drag) return;
    drag = { x: e.clientX, y: e.clientY, yaw: targetYaw, id: e.pointerId, moved: false };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (drag && e.pointerId === drag.id) {
      drag.moved ||= Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 6;
      targetYaw = drag.yaw + (e.clientX - drag.x) *.006;
    }
    const rect = canvas.getBoundingClientRect();
    const hit = renderer?.pick((e.clientX - rect.left) * canvas.width / rect.width,
      (e.clientY - rect.top) * canvas.height / rect.height);
    canvas.style.cursor = tappable(player.world, hit) ? 'pointer' : 'default';
  };
  canvas.onpointerup = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) {
      const rect = canvas.getBoundingClientRect();
      const hit = renderer?.pick((e.clientX - rect.left) * canvas.width / rect.width,
        (e.clientY - rect.top) * canvas.height / rect.height);
      if (hit) postInput({ click: [hit.x, hit.y, hit.z] });
    }
    drag = null;
  };
  canvas.onpointercancel = () => { drag = null; };
  canvas.onkeydown = e => {
    const key = { w: 'up', a: 'left', s: 'down', d: 'right', ' ': 'space' }[e.key.toLowerCase()];
    if (key) {
      e.preventDefault();
      if (!e.repeat) postInput({ key });
    }
    if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
      turn = e.key === 'ArrowLeft' ? - 1: 1;
      e.preventDefault();
    }
  };
  canvas.onkeyup = () => {
    turn = 0;
  };
  canvas.onblur = () => {
    turn = 0;
  };
  canvas.addEventListener(
    'webglcontextlost',
    e => {
      e.preventDefault();
      canvasOnly = true;
      if (player.world) {
        makeRenderer();
      }
    }
  );
}
bindCanvas();
media.addEventListener(
  'change',
  e => {
    player.reduced(e.matches);
    load();
  }
);
document.addEventListener(
  'visibilitychange',
  () => {
    if (document.hidden) {
      player.hidden();
    } else {
      load();
    }
  }
);
const percentile = (values, p) => [...values].sort((a, b) => a - b)[
  Math.min(values.length - 1, Math.floor(values.length * p))
];
function render(dt, gap = 0) {
  if (!document.hidden) {
    player.step(dt);
    if (player.needsState) {
      load();
    }
    if (!renderer && player.world) makeRenderer();
    if (renderer && player.world) {
      renderer.world = player.world;
      targetYaw += turn * MOTION.turnSpeed * dt;
      if (bench && !posted && !media.matches) {
        targetYaw += MOTION.turnSpeed * dt;
      }
      const difference = targetYaw - renderer.yaw;
      renderer.yaw += media.matches ? difference: Math.sign(difference) * Math.min(
        Math.abs(difference),
        MOTION.turnSpeed * dt
      );
      renderer.span = Math.max(player.world.w, player.world.d) * 1.5 * zoom;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }
      fitCamera(renderer, width, height, zoom);
      const start = performance.now();
      renderer.render();
      const elapsed = performance.now() - start;
      labels();
      if (bench && !posted && !player.busy) {
        if (benchStarted) {
          samples.push(elapsed);
          gaps.push(gap);
        }
        benchStarted = true;
        if (samples.length === 600) {
          posted = true;
          fetch(
            '/bench',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(
                {
                  renderer: renderer.kind,
                  p50: percentile(samples,.5),
                  p95: percentile(samples,.95),
                  gapP95: percentile(gaps,.95),
                  frames: 600,
                  w: canvas.width / dpr,
                  h: canvas.height / dpr,
                  dpr
                }
              )
            }
          ).catch (
            () => {
              status.textContent = C.reconnect;
            }
          );
        }
      }
    }
  }
}
function frame(now) {
  render(previous ? Math.min(.1, (now - previous) / 1000) : 0, previous ? now - previous : 0);
  previous = now;
  requestAnimationFrame(frame);
}
await load();
connect();
if (stepping) {
  window.genesisStep = seconds => {
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    // Advance the full requested time in bounded physics steps, with one final paint.
    let left = duration;
    while (left > .1) {
      player.step(.1);
      left -= .1;
    }
    render(left);
    return { busy: player.busy, bodies: player.world?.bodies.length || 0,
      rev: player.world?.rev || 0 };
  };
  // Step mode only. Draw again before toBlob; the GL buffer clears after paint.
  window.genesisShot = () => new Promise((resolve, reject) => {
    renderer?.render();
    canvas.toBlob(blob => {
      fetch('/shot', {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: blob
      }).then(resolve, reject);
    }, 'image/png');
  });
  window.genesisStep(0);
} else requestAnimationFrame(frame);
