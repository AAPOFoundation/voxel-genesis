// Match affordable town actions to measured needs and explicit road paths.
const building = code => ['h', 'w', 's'].includes(code);
const edge = i => i < 6 || i >= 30 || i % 6 === 0 || i % 6 === 5;
const near = i => [i - 6, i - 1, i + 1, i + 6].filter(n => n >= 0 && n < 36 &&
  Math.abs(n % 6 - i % 6) + Math.abs(Math.floor(n / 6) - Math.floor(i / 6)) === 1);

/** Find a free-lot route first, then a route whose replacements must be disclosed. */
export function repairPaths(lots, fronted, awake) {
  const repairs = [];
  for (const [home, [code]] of lots.entries()) {
    if (!building(code) || awake[home]) continue;
    for (const allowed of [['.'], ['.', '*', 'p'], ['.', '*', 'p', 'h', 's', 'w']]) {
      const queue = near(home).map(i => [i]);
      const seen = new Set([home]);
      let found;
      while (queue.length) {
        // Existing disconnected road cells cost no move to join.
        queue.sort((a, b) => a.filter(i => lots[i][0] !== '#').length -
          b.filter(i => lots[i][0] !== '#').length);
        const path = queue.shift(), i = path.at(-1);
        if (seen.has(i) || ![...allowed, '#'].includes(lots[i][0])) continue;
        seen.add(i);
        if (fronted[i] || edge(i)) {
          found = path.filter(n => lots[n][0] !== '#').reverse();
          break;
        }
        for (const n of near(i)) if (!seen.has(n)) queue.push([...path, n]);
      }
      if (found?.length) {
        repairs.push({ home, path: found });
        break;
      }
    }
  }
  return repairs;
}

/** Rank legal actions, and attach the needs they improve plus any displaced lot. */
export function rankMoves(game, st, legacy, derive) {
  const lots = game.lots;
  const choices = legacy.map(move => ({ ...move }));
  const add = (kind, i, cost, value, why) => {
    const op = ['build', kind, i % 6, Math.floor(i / 6)];
    let move = choices.find(m => m.op.join() === op.join());
    if (!move) choices.push(move = { op, cost, value, why });
    move.value = Math.max(value, move.value);
    return move;
  };
  for (const { home, path } of st.repairs) {
    const move = add('road', path[0], 1, 80, 'roads');
    move.repair ??= { home, steps: path.length };
  }
  for (const [i, [code, level]] of lots.entries()) {
    const park = st.parkHome;
    if (park >= 0 && i !== park && !['p', '*', '~'].includes(code) &&
      Math.abs(i % 6 - park % 6) <= 1 &&
      Math.abs(Math.floor(i / 6) - Math.floor(park / 6)) <= 1) {
      add('park', i, 3, 0, 'parks');
    }
    if (code === 'w' && near(i).some(n => lots[n][0] === 'h' && lots[n][2] > 0)) {
      add('park', i, 3, 30, 'quiet');
      if (game.coins < 3) add('road', i, 1, 1, 'quiet');
    }
    if (st.fronted[i] && ['.', '*', 'p'].includes(code)) {
      if (st.P > st.J) add('work', i, 6, 1, 'jobs');
      if (st.P > st.S) add('shop', i, 6, 1, 'shops');
    }
    if (code !== 'w' || level !== 1 || !st.awake[i] || st.C <= st.J) continue;
    const op = ['grow', i % 6, Math.floor(i / 6)];
    if (!choices.some(m => m.op.join() === op.join())) {
      choices.push({ op, cost: 8, value: Math.min(6, st.C - st.J), why: 'jobs' });
    }
  }
  for (const move of choices) {
    const i = move.op.at(-1) * 6 + move.op.at(-2);
    const code = lots[i][0];
    if (move.why === 'homes') move.value -= Math.max(0, st.C - st.J) + Math.max(0, st.C - st.S);
    if (move.why === 'jobs') move.value += Math.max(0, st.P - st.J) * 2;
    if (move.why === 'shops') move.value += Math.max(0, st.P - st.S) * 2;
    if (move.why === 'roads' && !move.repair) {
      const nearby = near(i).filter(n => building(lots[n][0])).length;
      move.value = st.F <= 2 && nearby ? 4 + nearby : 0;
    }
    if (move.op[0] === 'build' && code !== '.') move.replaces = code;
    const next = { ...game, lots: lots.map(lot => [...lot]) };
    if (move.op[0] === 'grow') next.lots[i][1] = 2;
    else next.lots[i] = [{ home: 'h', work: 'w', shop: 's', park: 'p', road: '#' }
      [move.op[1]], 1, 0];
    const after = derive(next);
    move.needs = [];
    if (st.P > st.J && after.J > st.J) move.needs.push('jobs');
    if (st.P > st.S && after.S > st.S) move.needs.push('shops');
    if (st.parkHome >= 0 && next.lots[st.parkHome][0] === 'h' && after.greens[st.parkHome]) {
      move.needs.push('park');
    }
    if (st.quietHome >= 0 && !near(st.quietHome).some(n => next.lots[n][0] === 'w')) {
      move.needs.push('quiet');
    }
    if (move.repair && move.repair.home === st.repairs[0]?.home) move.needs.push('road');
    if (st.asleep === 0 && st.C === st.P && st.J >= st.P && st.S >= st.P && after.C > st.C) {
      move.needs.push('homes');
    }
  }
  return choices.filter(move => move.cost <= game.coins && (move.value > 0 || move.needs.length))
    .sort((a, b) => Number(!!a.replaces) - Number(!!b.replaces) || b.value - a.value ||
      a.cost - b.cost);
}
