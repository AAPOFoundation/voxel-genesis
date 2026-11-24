// Compute a conservative vertical budget from the shipped CSS and longest HUD copy.
import { C, townHud } from '../src/copy.mjs';
/** Guard the flex contract and space for the world at both review sizes. */
export function checkLayout(html, check) {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const base = css.split('@media')[0];
  const phone = css.split('@media (max-width: 480px)')[1].split('@media')[0];
  const rule = (text, selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = text.match(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]+)'))?.[1];
    return Object.fromEntries((body || '').split(';').filter(s => s.includes(':'))
      .map(s => s.trim().split(/:\s*/)));
  };
  const px = value => parseFloat(value || 0);
  const pairs = value => {
    const parts = value.trim().split(/\s+/).map(px);
    return [parts[0], parts[1] ?? parts[0]];
  };
  const main = rule(base, 'main');
  const canvas = rule(base, 'canvas');
  check('layout-budget', main.height === '100dvh' && main.display === 'flex' &&
    main['flex-direction'] === 'column', 'viewport-sized column');
  check('layout-budget', canvas.flex === '1 1 0' && px(canvas['min-height']) === 0 &&
    px(canvas.height) === 0, 'only the canvas absorbs remaining height');
  check('layout-budget', rule(base, 'main > :not(canvas)').flex === 'none', 'fixed siblings');
  const text = townHud({ turn: 24, turns: 24, people: 128, happy: 100, coins: 999,
    hearts: 384, goal: 120, stars: 3, done: true, par: 384,
    needs: ['128 more jobs', 'more shops', 'a park', 'quiet by homes',
      'road to sleeping home at 5 5', 'more homes'] });
  for (const [width, height] of [[1280, 800], [375, 812]]) {
    const style = selector => ({ ...rule(base, selector),
      ...(width <= 480 ? rule(phone, selector) : {}) });
    const padding = px(style('main').padding);
    const available = Math.min(width, px(main['max-width'])) - 2 * padding;
    const font = px(style('body')['font-size']);
    const line = px(style('body')['line-height']);
    const pLine = Number(style('p')['line-height']) * font;
    const measure = (text, size = font) => text.length * size * .62;
    const wrapped = (items, gap) => {
      let rows = 1, used = 0;
      for (const item of items) {
        if (used && used + gap + item > available) { rows++; used = 0; }
        used += (used ? gap : 0) + item;
      }
      return rows;
    };
    const title = style('h1');
    const clamp = title['font-size'].match(/[\d.]+/g).map(Number);
    const titleFont = Math.max(clamp[0], Math.min(width * clamp[1] / 100, clamp[2]));
    const margins = title.margin.split(/\s+/).map(px);
    const titleHeight = Math.ceil(measure('A'.repeat(32), titleFont) / available) *
      titleFont * Number(title['line-height']) + margins[0] + margins[2];
    const header = titleHeight + pLine + 2 * font + px(style('header')['border-bottom']);
    const hud = style('#hud:not([hidden])');
    const chip = style('#hud > span');
    const [cy, cx] = pairs(chip.padding);
    const border = px(chip.border);
    const gap = px(hud.gap);
    const rows = wrapped([...text.chips.map(t => measure(t) + 2 * (cx + border)),
      measure(text.progress), px(style('#hud-goal').flex.split(' ').at(-1))], gap);
    const need = style('#hud-needs span');
    const [ny, nx] = pairs(need.padding);
    const needGap = px(style('#hud-needs').gap);
    const needRows = wrapped(text.needs.map(t => measure(t, px(need['font-size'])) + 2 * nx),
      needGap);
    const needsHeight = needRows * (px(need['line-height']) + 2 * ny) +
      (needRows - 1) * needGap;
    const hudHeight = 2 * px(hud.padding) + rows * (line + 2 * (cy + border)) +
      (rows + 1) * gap + needsHeight + Math.ceil(measure(text.end) / available) * pLine;
    const button = style('button');
    const [by, bx] = pairs(button.padding);
    const navGap = px(style('nav').gap);
    const navRows = wrapped([C.left, C.right, C.zoomIn, C.zoomOut, C.pause]
      .map(t => measure(t) + 2 * (bx + px(button.border))), navGap);
    const buttonHeight = Math.max(px(button['min-height']), line + 2 * (by + px(button.border)));
    const nav = navRows * buttonHeight +
      (navRows - 1) * navGap;
    const status = Math.max(px(style('#status')['min-height']), pLine) + 2 * font;
    const fixed = 2 * padding + header + hudHeight + nav + status;
    check('layout-budget', height - fixed >= 100,
      width + 'x' + height + ': fixed ' + Math.ceil(fixed) +
       ', world ' + Math.floor(height - fixed));
    const kit = style('#kit:not([hidden])');
    const kitFont = px(style('#kit')['font-size']) || font;
    const kitLine = px(style('#kit')['line-height']) || line;
    const kitRows = wrapped(['quarter 12/12', 'apples 999', 'coins 999', 'fuel 999',
      'You, orange ring, 999', 'Rival, slate ring, 999'].map(t => measure(t, kitFont)),
    px(kit.gap));
    const kitHeight = kitRows * kitLine + kitRows * px(kit.gap) +
      Math.ceil(measure('a'.repeat(120), kitFont) / available) * kitLine;
    const soundRows = wrapped([C.left, C.right, C.zoomIn, C.zoomOut, C.pause, 'Sound off']
      .map(t => measure(t) + 2 * (bx + px(button.border))), navGap);
    const extraNav = (soundRows - navRows) * (buttonHeight + navGap);
    const kitFixed = fixed + kitHeight + extraNav;
    check('layout-budget', height - kitFixed >= 100,
      'kit ' + width + 'x' + height + ': fixed ' + Math.ceil(kitFixed) +
      ', world ' + Math.floor(height - kitFixed));
    check('layout-budget', style('#speech').position === 'absolute',
      'three speech lines and three choices add no fixed height');
    check('layout-budget', !style('canvas')['min-height'].includes('vh'), 'no phone canvas floor');
  }
  const feed = rule(base, '#feed'), fp = rule(base, '#feed p')['line-height'];
  check('layout-caption', px(feed['font-size']) === px(rule(base, 'body')['font-size']) &&
    px(feed['padding-top']) >= 6 && (!feed['max-height'] || feed['max-height'] === 'none' ||
    px(feed['max-height']) >= 3 * (px(fp) < 4 ? px(fp) * px(feed['font-size']) : px(fp))),
  'caption at body size, 6px under the rule, three lines');
}
