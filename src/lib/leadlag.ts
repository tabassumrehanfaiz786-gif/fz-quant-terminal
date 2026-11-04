// Pure cross-venue lead-lag helpers. Series are mid prices sampled on a shared fixed clock.

export const basisBps = (a: number, b: number) => (a > 0 && b > 0 ? ((a - b) / b) * 10_000 : 0);

export function returns(s: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < s.length; i++) r.push(s[i - 1]! > 0 ? Math.log(s[i]! / s[i - 1]!) : 0);
  return r;
}

function corr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]!; my += y[i]!; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i]! - mx, b = y[i]! - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Positive lag = leader moves first by `lag` samples. Returns best lag and its correlation. */
export function leadLag(leader: number[], follower: number[], maxLag: number): { lag: number; corr: number } {
  const a = returns(leader), b = returns(follower);
  let best = { lag: 0, corr: corr(a, b) };
  for (let k = 1; k <= maxLag; k++) {
    const fwd = corr(a.slice(0, a.length - k), b.slice(k)); // a leads b
    const back = corr(a.slice(k), b.slice(0, b.length - k)); // b leads a
    if (fwd > best.corr) best = { lag: k, corr: fwd };
    if (back > best.corr) best = { lag: -k, corr: back };
  }
  return best;
}

/** A simulated taker arbitrage is worth it only when the gap beats round-trip fees on both legs. */
export function arbEdge(gapBps: number, feeBpsPerLeg: number) {
  const net = Math.abs(gapBps) - 2 * feeBpsPerLeg;
  return { net, open: net > 0 };
}
