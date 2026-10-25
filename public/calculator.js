export const FREQUENCIES = Object.freeze({
  weekly: { count: 52, label: 'weekly', description: '52 paychecks / year' },
  biweekly: { count: 26, label: 'every two weeks', description: '26 paychecks / year' },
  semimonthly: { count: 24, label: 'twice a month', description: '24 paychecks / year' },
  monthly: { count: 12, label: 'monthly', description: '12 paychecks / year' },
});

export const DEFAULT_INPUT = Object.freeze({
  basis: 'annual', pay: 60000, mode: 'percent', raise: 5,
  frequency: 'biweekly', hours: 40, weeks: 52,
  inflationEnabled: false, inflation: 3,
});

export class InputError extends Error {
  constructor(field, message) { super(message); this.field = field; }
}

function number(value, field, label, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') throw new InputError(field, `Enter ${label}.`);
  if (String(value).trim() === '' || !Number.isFinite(Number(value))) throw new InputError(field, `Enter ${label}.`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new InputError(field, `${label[0].toUpperCase() + label.slice(1)} must be between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')}.`);
  return parsed;
}

export function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object') throw new InputError('pay', 'Enter your current pay.');
  if (!['annual', 'hourly'].includes(raw.basis)) throw new InputError('pay', 'Choose annual salary or hourly pay.');
  if (!['percent', 'amount', 'target'].includes(raw.mode)) throw new InputError('raise', 'Choose a calculation mode.');
  if (!Object.hasOwn(FREQUENCIES, raw.frequency)) throw new InputError('frequency', 'Choose a pay frequency.');
  const pay = number(raw.pay, 'pay', 'current pay', 0.01, raw.basis === 'hourly' ? 10000 : 100000000);
  const hours = number(raw.hours, 'hours', 'hours per week', 1, 168);
  const weeks = number(raw.weeks, 'weeks', 'paid weeks per year', 1, 52);
  const raise = number(raw.raise, 'raise', raw.mode === 'percent' ? 'raise percentage' : raw.mode === 'target' ? 'new pay' : 'pay increase', raw.mode === 'percent' ? -100 : raw.mode === 'target' ? 0 : -pay, raw.mode === 'percent' ? 1000 : raw.basis === 'hourly' ? 10000 : 100000000);
  const inflationEnabled = raw.inflationEnabled === true;
  const inflation = inflationEnabled ? number(raw.inflation, 'inflation', 'inflation assumption', -99, 100) : 3;
  return { basis: raw.basis, pay, mode: raw.mode, raise, frequency: raw.frequency, hours, weeks, inflationEnabled, inflation };
}

export function calculate(raw) {
  const input = normalizeInput(raw);
  const factor = input.basis === 'annual' ? 1 : input.hours * input.weeks;
  const nextPay = input.mode === 'percent' ? input.pay * (1 + input.raise / 100) : input.mode === 'amount' ? input.pay + input.raise : input.raise;
  const before = input.pay * factor;
  const after = nextPay * factor;
  const increase = after - before;
  const percent = (nextPay / input.pay - 1) * 100;
  const count = FREQUENCIES[input.frequency].count;
  return {
    input, before, after, nextPay, increase, percent, count,
    paycheckBefore: before / count, paycheckAfter: after / count,
    paycheckIncrease: increase / count, monthlyIncrease: increase / 12,
    hourlyBefore: before / (input.hours * input.weeks),
    hourlyAfter: after / (input.hours * input.weeks),
    realPercent: input.inflationEnabled ? ((1 + percent / 100) / (1 + input.inflation / 100) - 1) * 100 : null,
  };
}

export function dollars(value, decimals = 0, signed = false) {
  const rounded = Math.round((value + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals, signDisplay: signed ? 'exceptZero' : 'auto' }).format(Object.is(rounded, -0) ? 0 : rounded);
}

export function percentage(value, signed = false) {
  const rounded = Math.round(value * 100) / 100;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, signDisplay: signed ? 'exceptZero' : 'auto' }).format(Object.is(rounded, -0) ? 0 : rounded)}%`;
}

export function csvCell(value) {
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function scenariosCSV(scenarios) {
  const rows = [['Scenario', 'Current annual gross (USD)', 'New annual gross (USD)', 'Raise (%)', 'Annual change (USD)', 'Pay frequency', 'Change per paycheck (USD)', 'Hours per week', 'Paid weeks per year', 'Inflation assumption (%)', 'Real change (%)']];
  for (const scenario of scenarios) {
    const r = calculate(scenario.input);
    rows.push([scenario.name, r.before.toFixed(2), r.after.toFixed(2), Number(r.percent.toFixed(4)), Number(r.increase.toFixed(2)), FREQUENCIES[r.input.frequency].label, Number(r.paycheckIncrease.toFixed(2)), r.input.hours, r.input.weeks, r.input.inflationEnabled ? r.input.inflation : '', r.realPercent === null ? '' : Number(r.realPercent.toFixed(4))]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}
