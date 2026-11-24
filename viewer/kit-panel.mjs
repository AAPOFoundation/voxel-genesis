// COPY-DRAFT: render shared panel data as text, with audio opt-in owned by the button.
import { panelOf } from '../src/kit/story.mjs';
import { KIT_COPY as C } from '../src/kit-copy.mjs';
import { createMusic } from './music.mjs';

export function createPanel(document, root, speech, feed = document.createElement('section')) {
  const node = (tag, text) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  root.setAttribute('aria-live', 'polite');
  speech.setAttribute('aria-live', 'polite');
  feed.setAttribute('aria-live', 'polite');
  return {
    update(model, entries = []) {
      const kept = entries.filter(entry => !entry.says.startsWith('img sha256:')).slice(-3);
      feed.hidden = !kept.length;
      feed.replaceChildren(...kept.map(entry => node('p', entry.says)));
      root.hidden = !model.chips.length && !model.objective;
      const chips = model.chips.map(text => node('span', text));
      if (model.objective) chips.push(node('p', model.objective));
      root.replaceChildren(...chips);
      speech.hidden = !model.talk;
      if (!model.talk) { speech.replaceChildren(); return; }
      const talk = model.talk, list = document.createElement('ul');
      list.replaceChildren(...talk.asks.map(ask => node('li', C.say + ask.id + ': ' + ask.says)));
      speech.replaceChildren(node('strong', talk.voice),
        ...talk.lines.map(t => node('p', t)), list);
    }
  };
}
// The controller emits only on load and operation changes. No animation-frame work.
export function connectKit(document, window) {
  const panel = createPanel(document, document.querySelector('#kit'),
    document.querySelector('#speech'), document.querySelector('#feed'));
  const button = document.querySelector('#sound');
  const music = createMusic({ clock: window, makeContext: () => new window.AudioContext() });
  const label = on => {
    button.textContent = on ? C.soundOn : C.soundOff;
    button.setAttribute('aria-label', button.textContent);
    button.setAttribute('aria-pressed', String(on));
  };
  label(false);
  button.onclick = () => label(music.toggle());
  const search = window.location?.search ?? '';
  const motion = new URLSearchParams(search).get('motion') === 'reduce';
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => motion || media.matches;
  music.reduced(reduced());
  media.addEventListener('change', () => music.reduced(reduced()));
  document.addEventListener('visibilitychange', () => music.hidden(document.hidden));
  document.addEventListener('kit-change', event => {
    panel.update(panelOf(event.detail), event.detail?.feed);
    music.update(event.detail);
    position();
  });
  const position = () => {
    const canvas = document.querySelector('#world');
    const speech = document.querySelector('#speech');
    document.querySelector('#feed').style.top = canvas.offsetTop + 'px';
    speech.style.top = canvas.offsetTop + canvas.clientHeight + 'px';
    speech.style.maxHeight = Math.min(180, canvas.clientHeight) + 'px';
  };
  const observer = new window.ResizeObserver(position);
  for (const selector of ['main', '#world', '#kit', '#hud', 'nav']) {
    observer.observe(document.querySelector(selector));
  }
  position();
}
if (typeof document !== 'undefined') connectKit(document, window);
