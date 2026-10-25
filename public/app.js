import { DEFAULT_INPUT, FREQUENCIES, calculate, normalizeInput, dollars, percentage, scenariosCSV } from './calculator.js';

const $ = id => document.getElementById(id);
const KEYS = { inputs: 'raisewise.inputs.v1', saved: 'raisewise.scenarios.v1', prefs: 'raisewise.preferences.v1' };
let storageAvailable = true;
let toastTimer, announceTimer, persistTimer;
let basis = 'annual', mode = 'percent', current = null;
let dialogInput = null;
let inputVisible = false, resultVisible = false;

function updateMobileResult() {
  $('mobile-result').hidden = !current || !inputVisible || resultVisible;
  if (current) $('mobile-result-value').textContent = dollars(current.paycheckIncrease, 2, true);
}

function storageFailure() {
  storageAvailable = false;
  $('storage-note').textContent = 'Browser storage is unavailable. You can still calculate and copy your result, but changes cannot be saved here.';
  $('remember').disabled = true;
  $('save-scenario').disabled = true;
}

function readStorage(key, fallback) {
  let value;
  try { value = localStorage.getItem(key); } catch { storageFailure(); return fallback; }
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { storageFailure(); toast('Your browser could not save this. Check storage permissions or available space.'); return false; }
}

function loadScenarios() {
  const raw = readStorage(KEYS.saved, []);
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 6).flatMap(item => {
    try {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return [];
      const input = normalizeInput(item.input);
      return [{ id: item.id.slice(0, 100), name: item.name.trim().slice(0, 60) || 'Saved scenario', input, date: typeof item.date === 'string' && Number.isFinite(Date.parse(item.date)) ? item.date : null }];
    } catch { return []; }
  });
}

let scenarios = loadScenarios();
const preferences = readStorage(KEYS.prefs, {});
$('remember').checked = preferences?.remember !== false;
let initial = DEFAULT_INPUT;
if ($('remember').checked) {
  try { initial = normalizeInput(readStorage(KEYS.inputs, DEFAULT_INPUT)); } catch { initial = DEFAULT_INPUT; }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}

function readInputs() {
  return { basis, mode, pay: $('pay').value, raise: $('raise').value, frequency: $('frequency').value, hours: $('hours').value, weeks: $('weeks').value, inflationEnabled: $('inflation-enabled').checked, inflation: $('inflation').value };
}

function updateLabels() {
  document.querySelectorAll('[data-basis]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.basis === basis)));
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
  $('pay-label').textContent = basis === 'annual' ? 'Current annual salary' : 'Current hourly wage';
  $('pay-unit').textContent = basis === 'annual' ? '/ year' : '/ hour';
  $('pay').max = basis === 'annual' ? '100000000' : '10000';
  $('raise-label').textContent = mode === 'percent' ? 'Your raise percentage' : mode === 'amount' ? `Your ${basis === 'annual' ? 'annual' : 'hourly'} pay increase` : `Your new ${basis === 'annual' ? 'annual salary' : 'hourly wage'}`;
  $('raise-prefix').hidden = mode === 'percent';
  $('raise-unit').textContent = mode === 'percent' ? '%' : basis === 'annual' ? '/ year' : '/ hour';
  $('raise').min = mode === 'percent' ? '-100' : mode === 'target' ? '0' : String(-Number($('pay').value));
  $('raise').max = mode === 'percent' ? '1000' : basis === 'annual' ? '100000000' : '10000';
  $('inflation-field').hidden = !$('inflation-enabled').checked;
}

function applyInputs(input) {
  basis = input.basis;
  mode = input.mode;
  for (const field of ['pay', 'raise', 'frequency', 'hours', 'weeks', 'inflation']) $(field).value = input[field];
  $('inflation-enabled').checked = input.inflationEnabled;
  if (basis === 'hourly' || input.inflationEnabled) $('advanced').open = true;
  updateLabels();
  render(false);
}

function persist(input) {
  clearTimeout(persistTimer);
  if ($('remember').checked && storageAvailable) persistTimer = setTimeout(() => { if ($('remember').checked) writeStorage(KEYS.inputs, input); }, 250);
}

function clearErrors() {
  for (const field of ['pay', 'raise', 'hours', 'weeks', 'frequency', 'inflation']) {
    $(field).removeAttribute('aria-invalid');
    $(`${field}-error`).textContent = '';
  }
}

function render(announce = true) {
  clearErrors();
  clearTimeout(announceTimer);
  clearTimeout(persistTimer);
  const raw = readInputs();
  updateLabels();
  try {
    current = calculate(raw);
  } catch (error) {
    current = null;
    const field = error.field || 'pay';
    $(field).setAttribute('aria-invalid', 'true');
    $(`${field}-error`).textContent = error.message;
    if (['hours', 'weeks', 'inflation'].includes(field)) $('advanced').open = true;
    $('result-content').hidden = true;
    $('result-error').hidden = false;
    $('percent-badge').hidden = true;
    for (const id of ['save-scenario', 'copy-result', 'print-result']) $(id).disabled = true;
    updatePresets(raw);
    updateMobileResult();
    return;
  }
  const r = current;
  $('result-content').hidden = false;
  $('result-error').hidden = true;
  $('percent-badge').hidden = false;
  $('save-scenario').disabled = !storageAvailable;
  $('copy-result').disabled = false;
  $('print-result').disabled = false;
  const amount = dollars(r.after, 2);
  const dot = amount.lastIndexOf('.');
  $('annual-result').replaceChildren(document.createTextNode(amount.slice(0, dot)));
  const cents = document.createElement('span');
  cents.textContent = amount.slice(dot);
  $('annual-result').append(cents);
  $('before-annual').textContent = dollars(r.before, 2);
  $('percent-badge').textContent = `${percentage(r.percent, true)} ${r.percent < 0 ? '↘' : r.percent > 0 ? '↗' : '→'}`;
  $('percent-badge').classList.toggle('negative', r.percent < 0);
  $('paycheck-label').textContent = r.increase < 0 ? 'Less in every paycheck' : r.increase === 0 ? 'Change in every paycheck' : 'More in every paycheck';
  $('paycheck-result').textContent = dollars(r.paycheckIncrease, 2, true);
  const f = FREQUENCIES[r.input.frequency];
  $('paycheck-caption').textContent = `${f.label[0].toUpperCase() + f.label.slice(1)} · ${f.description}`;
  $('monthly-result').textContent = dollars(r.monthlyIncrease, 2, true);
  $('yearly-result').textContent = dollars(r.increase, 2, true);
  $('hourly-result').textContent = dollars(r.hourlyAfter, 2);
  $('chart-before').textContent = dollars(r.before);
  $('chart-after').textContent = dollars(r.after);
  const largest = Math.max(r.before, r.after);
  $('before-bar').style.width = `${r.before / largest * 100}%`;
  $('after-bar').style.width = `${r.after / largest * 100}%`;
  $('inflation-result').hidden = r.realPercent === null;
  if (r.realPercent !== null) $('inflation-result').textContent = `With your ${percentage(r.input.inflation)} inflation assumption, purchasing power changes by ${percentage(r.realPercent, true)}. This compares annual rates before tax.`;
  updatePresets(raw);
  updateMobileResult();
  persist(r.input);
  if (announce) announceTimer = setTimeout(() => {
    $('calculation-status').textContent = `New annual gross pay ${dollars(r.after, 2)}. Change per paycheck ${dollars(r.paycheckIncrease, 2, true)}.`;
  }, 550);
}

function updatePresets(raw) {
  for (const button of document.querySelectorAll('[data-preset]')) {
    const value = Number(button.dataset.preset);
    try {
      const result = calculate({ ...raw, mode: 'percent', raise: value });
      $(`preset-${value}`).textContent = dollars(result.paycheckIncrease, 2, true);
      button.disabled = false;
      button.setAttribute('aria-pressed', String(current !== null && Math.abs(current.percent - value) < 0.000001));
    } catch {
      $(`preset-${value}`).textContent = '—';
      button.disabled = true;
      button.setAttribute('aria-pressed', 'false');
    }
  }
}

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function renderSaved() {
  $('saved-count').textContent = scenarios.length;
  $('saved-empty').hidden = scenarios.length > 0;
  $('export').disabled = scenarios.length === 0;
  $('clear-scenarios').hidden = scenarios.length === 0;
  $('saved-list').replaceChildren();
  for (const scenario of scenarios) {
    const r = calculate(scenario.input);
    const card = element('article', 'scenario-card');
    const top = element('div', 'scenario-top');
    const name = element('h3', 'scenario-name', scenario.name);
    const remove = element('button', 'icon-button', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${scenario.name}`);
    remove.addEventListener('click', () => {
      const next = scenarios.filter(s => s.id !== scenario.id);
      if (!writeStorage(KEYS.saved, next)) return;
      scenarios = next;
      renderSaved();
      const nextFocus = $('saved-list').querySelector('button') || $('save-scenario');
      nextFocus.focus();
      toast('Scenario removed from this browser.');
    });
    top.append(name, remove);
    card.append(top);
    if (scenario.date) card.append(element('p', 'scenario-date', `Saved ${new Date(scenario.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`));
    const total = element('p', 'scenario-total', dollars(r.after));
    total.append(element('small', '', ' / year'));
    card.append(total, element('p', 'scenario-description', `${percentage(r.percent, true)} · ${dollars(r.increase, 2, true)} annually`));
    const paycheck = element('p', 'scenario-paycheck');
    paycheck.append(element('strong', '', dollars(r.paycheckIncrease, 2, true)), document.createTextNode(' per paycheck'));
    const schedule = element('p', 'scenario-schedule', `${FREQUENCIES[r.input.frequency].label} · before tax`);
    const load = element('button', 'button button-outline scenario-load', 'Load this scenario ↗');
    load.type = 'button';
    load.setAttribute('aria-label', `Load ${scenario.name}`);
    load.addEventListener('click', () => {
      applyInputs(scenario.input);
      $('calculator').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      $('pay').focus({ preventScroll: true });
      toast(`Loaded “${scenario.name}”. Changes won’t overwrite the saved scenario.`);
    });
    card.append(paycheck, schedule, load);
    $('saved-list').append(card);
  }
}

function rounded(value) { return Math.round(value * 100) / 100; }

document.querySelectorAll('[data-basis]').forEach(button => button.addEventListener('click', () => {
  const nextBasis = button.dataset.basis;
  if (nextBasis === basis) return;
  if (current) {
    const factor = nextBasis === 'annual' ? 1 : current.input.hours * current.input.weeks;
    $('pay').value = rounded(current.before / factor);
    if (mode === 'amount') $('raise').value = rounded(current.increase / factor);
    if (mode === 'target') $('raise').value = rounded(current.after / factor);
  }
  basis = nextBasis;
  if (basis === 'hourly') $('advanced').open = true;
  render();
}));

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  const nextMode = button.dataset.mode;
  if (nextMode === mode) return;
  if (current) $('raise').value = rounded(nextMode === 'percent' ? current.percent : nextMode === 'amount' ? current.nextPay - current.input.pay : current.nextPay);
  else $('raise').value = nextMode === 'percent' ? 5 : nextMode === 'target' ? $('pay').value : 0;
  mode = nextMode;
  render();
}));

$('raise-form').addEventListener('submit', e => { e.preventDefault(); render(); });
$('raise-form').addEventListener('input', e => { if (e.target.id !== 'remember') render(); });
$('frequency').addEventListener('change', () => render());
$('inflation-enabled').addEventListener('change', () => render());

$('remember').addEventListener('change', () => {
  clearTimeout(persistTimer);
  if (!writeStorage(KEYS.prefs, { remember: $('remember').checked })) return;
  if (!$('remember').checked) {
    try { localStorage.removeItem(KEYS.inputs); toast('Remembered inputs cleared. Saved scenarios are kept separately.'); }
    catch { storageFailure(); toast('Could not clear inputs. You can remove them in your browser’s site-data settings.'); }
  } else if (current) {
    if (writeStorage(KEYS.inputs, current.input)) toast('Your inputs will be remembered in this browser.');
  }
});

$('reset').addEventListener('click', () => {
  $('advanced').open = false;
  applyInputs(DEFAULT_INPUT);
  toast('Calculator reset. Your saved scenarios are unchanged.');
});

document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  mode = 'percent';
  $('raise').value = button.dataset.preset;
  render();
}));

$('save-scenario').addEventListener('click', () => {
  if (!current || !storageAvailable) return;
  if (scenarios.length >= 6) { toast('You have 6 saved scenarios. Remove one to make room for another.'); return; }
  dialogInput = { ...current.input };
  $('scenario-name').value = `${percentage(current.percent)} ${current.percent < 0 ? 'pay change' : 'raise'}`;
  $('save-dialog').showModal();
  $('scenario-name').focus();
  $('scenario-name').select();
});

document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => $('save-dialog').close()));
$('save-dialog').addEventListener('click', event => {
  if (event.target !== $('save-dialog')) return;
  const rect = $('save-dialog').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('save-dialog').close();
});
$('scenario-name').addEventListener('input', () => $('scenario-name').setCustomValidity(''));
$('save-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('scenario-name').value.trim();
  if (!name) { $('scenario-name').setCustomValidity('Give your scenario a name.'); $('scenario-name').reportValidity(); return; }
  if (!dialogInput || scenarios.length >= 6) { $('save-dialog').close(); return; }
  const item = { id: crypto.randomUUID(), name: name.slice(0, 60), input: dialogInput, date: new Date().toISOString() };
  const next = [...scenarios, item];
  if (!writeStorage(KEYS.saved, next)) return;
  scenarios = next;
  renderSaved();
  $('save-dialog').close();
  toast('Scenario saved. Find it below in My scenarios.');
});

$('clear-scenarios').addEventListener('click', () => {
  if (!window.confirm('Remove all saved scenarios from this browser? Export a CSV first if you want to keep a copy.')) return;
  if (!writeStorage(KEYS.saved, [])) return;
  scenarios = [];
  renderSaved();
  $('save-scenario').focus({ preventScroll: true });
  toast('Saved scenarios cleared.');
});

$('export').addEventListener('click', () => {
  if (!scenarios.length) return;
  const blob = new Blob([scenariosCSV(scenarios)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'raisewise-scenarios.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Your CSV download is ready. All amounts are before tax.');
});

$('copy-result').addEventListener('click', async () => {
  if (!current) return;
  const r = current;
  const summary = [
    'RaiseWise · Pay raise estimate (USD, before tax)',
    `Current annual pay: ${dollars(r.before, 2)}`,
    `New annual pay: ${dollars(r.after, 2)} (${percentage(r.percent, true)})`,
    `Annual change: ${dollars(r.increase, 2, true)}`,
    `Monthly change: ${dollars(r.monthlyIncrease, 2, true)}`,
    `Change per paycheck: ${dollars(r.paycheckIncrease, 2, true)} (${FREQUENCIES[r.input.frequency].label}; ${r.count}/year)`,
    `Work schedule: ${r.input.hours} hours/week, ${r.input.weeks} paid weeks/year. No overtime premium.`,
  ];
  if (r.realPercent !== null) summary.push(`Inflation assumption: ${percentage(r.input.inflation)}; real change: ${percentage(r.realPercent, true)}.`);
  try { await navigator.clipboard.writeText(summary.join('\n')); toast('Result copied. Ready to paste into your notes.'); }
  catch { toast('Clipboard access is unavailable. Use the print button to keep a copy instead.'); }
});
$('print-result').addEventListener('click', () => { if (current) window.print(); });
$('view-result').addEventListener('click', () => {
  $('result-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  $('result-panel').focus({ preventScroll: true });
});
const resultObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.target === $('raise-form')) inputVisible = entry.isIntersecting;
    if (entry.target === $('result-panel')) resultVisible = entry.isIntersecting;
  }
  updateMobileResult();
}, { threshold: 0 });
resultObserver.observe($('raise-form'));
resultObserver.observe($('result-panel'));

window.addEventListener('storage', event => {
  if (event.key === KEYS.saved || event.key === null) { scenarios = loadScenarios(); renderSaved(); }
  if (event.key === KEYS.prefs || event.key === null) {
    const prefs = readStorage(KEYS.prefs, {});
    $('remember').checked = prefs?.remember !== false;
    clearTimeout(persistTimer);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && current && $('remember').checked && storageAvailable) {
    clearTimeout(persistTimer);
    writeStorage(KEYS.inputs, current.input);
  }
});

$('year').textContent = new Date().getFullYear();
applyInputs(initial);
renderSaved();
document.documentElement.dataset.ready = 'true';
