import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, DEFAULT_INPUT, dollars, normalizeInput, scenariosCSV } from '../public/calculator.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);
test('annual 5% raise: 60000 to 63000 with 26 paychecks', () => {
  const result = calculate(DEFAULT_INPUT);
  assert.equal(result.after, 63000);
  assert.equal(result.increase, 3000);
  close(result.paycheckIncrease, 115.3846153846);
  assert.equal(result.monthlyIncrease, 250);
  assert.equal(dollars(result.paycheckIncrease, 2, true), '+$115.38');
});
test('24 and 26 payments remain distinct', () => {
  assert.equal(calculate({ ...DEFAULT_INPUT, frequency: 'semimonthly' }).paycheckIncrease, 125);
  assert.notEqual(calculate(DEFAULT_INPUT).paycheckIncrease, 125);
});
test('hourly pay uses the actual paid schedule', () => {
  const r = calculate({ ...DEFAULT_INPUT, basis: 'hourly', pay: 25, mode: 'amount', raise: 2, hours: 30, weeks: 48 });
  assert.equal(r.before, 36000);
  assert.equal(r.after, 38880);
  close(r.percent, 8);
  assert.equal(r.hourlyAfter, 27);
});
test('target pay works backward to raise percentage', () => {
  const r = calculate({ ...DEFAULT_INPUT, mode: 'target', raise: 72000 });
  close(r.percent, 20);
  assert.equal(r.after, 72000);
});
test('changing schedule does not change an annual salary', () => {
  const r = calculate({ ...DEFAULT_INPUT, hours: 20, weeks: 50 });
  assert.equal(r.after, 63000);
  assert.equal(r.hourlyAfter, 63);
});
test('pay cuts, no change, and a full pay cut are supported', () => {
  assert.equal(calculate({ ...DEFAULT_INPUT, raise: -10 }).after, 54000);
  assert.equal(calculate({ ...DEFAULT_INPUT, raise: 0 }).increase, 0);
  assert.equal(calculate({ ...DEFAULT_INPUT, raise: -100 }).after, 0);
  assert.equal(calculate({ ...DEFAULT_INPUT, mode: 'target', raise: 0 }).percent, -100);
  assert.equal(calculate({ ...DEFAULT_INPUT, mode: 'amount', raise: -60000 }).after, 0);
});
test('real raise uses a ratio rather than subtracting percentages', () => {
  close(calculate({ ...DEFAULT_INPUT, inflationEnabled: true }).realPercent, 1.9417475728);
  close(calculate({ ...DEFAULT_INPUT, inflationEnabled: true, inflation: -2 }).realPercent, 7.1428571429);
  assert.equal(calculate(DEFAULT_INPUT).realPercent, null);
});
test('reject missing, invalid, non-finite and out-of-range inputs', () => {
  for (const change of [{ pay: '' }, { pay: 0 }, { pay: -1 }, { pay: Infinity }, { pay: null }, { pay: [] }, { raise: NaN }, { raise: '' }, { raise: -101 }, { mode: 'target', raise: -1 }, { mode: 'amount', raise: -60001 }, { hours: 0 }, { weeks: 53 }, { frequency: '__proto__' }, { inflationEnabled: true, inflation: -100 }, { basis: 'weekly' }, { mode: 'unknown' }]) assert.throws(() => calculate({ ...DEFAULT_INPUT, ...change }));
});
test('normalization handles persisted values without trusting extra fields', () => {
  const input = normalizeInput({ ...DEFAULT_INPUT, pay: '60000', arbitrary: 'value' });
  assert.equal(input.pay, 60000);
  assert.equal(Object.hasOwn(input, 'arbitrary'), false);
});
test('display rounding handles cents and avoids negative zero', () => {
  assert.equal(dollars(-0.00001, 2, true), '$0.00');
  assert.equal(dollars(-115.3846, 2, true), '-$115.38');
});
test('CSV quotes names, neutralizes spreadsheet formulas, and preserves negative numbers', () => {
  const csv = scenariosCSV([{ name: '=SUM(1,2)', input: { ...DEFAULT_INPUT, raise: -5 } }, { name: 'Review, "Plan A"', input: DEFAULT_INPUT }]);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.ok(csv.includes('"Review, ""Plan A"""'));
  assert.ok(csv.includes('"-3000"'));
  assert.ok(csv.startsWith('\uFEFF'));
});
