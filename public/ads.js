// Monetag In-Page Push. Keep the provider URL and zone together when replacing a tag.
// Load automatically on the homepage, while respecting saved opt-outs and GPC.
(() => {
  'use strict';
  const KEY = 'raisewise.ad-choice.v1';
  const ZONE = '12120101';
  const TAG_URL = 'https://nap5k.com/tag.min.js';
  const EXPIRY = 180 * 24 * 60 * 60 * 1000;
  let loaded = false;
  let choice = readChoice();
  let lastFocus;
  const gpc = navigator.globalPrivacyControl === true;
  const home = location.pathname === '/' || location.pathname === '/index.html';

  function readChoice() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (data && ['allow', 'deny'].includes(data.value) && Number.isFinite(data.time) && Date.now() - data.time >= 0 && Date.now() - data.time < EXPIRY) return data.value;
    } catch { /* Storage may be disabled; use the default for this visit. */ }
    return null;
  }

  const panel = document.createElement('section');
  panel.id = 'ad-preferences';
  panel.className = 'ad-preferences';
  panel.setAttribute('aria-label', 'Advertising preferences');
  panel.hidden = true;
  panel.innerHTML = '<h2>Your ad choices</h2><p>Monetag ads load automatically on the calculator homepage. You can turn them off here. Monetag and its partners may use cookies and device or browsing information to deliver and measure ads. The calculator works either way. <a href="/privacy/#advertising">Privacy details</a></p><p class="ad-choice-status" role="status"></p><div class="ad-choice-actions"><button type="button" class="button button-outline" data-ad-choice="deny">Turn off ads</button><button type="button" class="button button-outline" data-ad-choice="allow">Turn on ads</button></div><button type="button" class="text-button ad-choice-close">Close preferences</button>';
  document.body.append(panel);
  const status = panel.querySelector('.ad-choice-status');
  const allowButton = panel.querySelector('[data-ad-choice="allow"]');
  const closeButton = panel.querySelector('.ad-choice-close');

  const preferencesButton = document.createElement('button');
  preferencesButton.id = 'ad-preferences-button';
  preferencesButton.type = 'button';
  preferencesButton.className = 'text-button';
  preferencesButton.textContent = 'Ad choices';
  preferencesButton.setAttribute('aria-controls', panel.id);
  preferencesButton.setAttribute('aria-expanded', 'false');
  const footerNav = document.querySelector('.site-footer nav');
  if (footerNav) footerNav.append(preferencesButton);
  else document.body.append(preferencesButton);

  function toggle(open, moveFocus = false) {
    panel.hidden = !open;
    document.body.classList.toggle('ad-choice-open', open);
    preferencesButton.setAttribute('aria-expanded', String(open));
    closeButton.hidden = false;
    if (open && moveFocus) {
      lastFocus = document.activeElement;
      panel.querySelector('[data-ad-choice="deny"]').focus();
    } else if (!open && moveFocus) {
      (lastFocus?.isConnected ? lastFocus : preferencesButton).focus({ preventScroll: true });
    }
  }

  function loadAd() {
    if (!home || loaded || choice === 'deny' || gpc) return;
    loaded = true;
    // Equivalent to the supplied tag, without an inline executable script.
    const script = document.createElement('script');
    script.id = 'monetag-inpage-tag';
    script.dataset.zone = ZONE;
    script.dataset.cfasync = 'false';
    script.src = TAG_URL;
    script.async = true;
    script.addEventListener('error', () => {
      status.textContent = 'The ad service could not load. Your calculator still works.';
    });
    document.head.append(script);
  }

  function showStatus() {
    allowButton.disabled = gpc;
    status.textContent = gpc ? 'Ads are off because your browser sends a Global Privacy Control signal.' : choice === 'deny' ? 'Ads are off in this browser.' : 'Ads are on in this browser.';
  }

  for (const button of panel.querySelectorAll('[data-ad-choice]')) button.addEventListener('click', () => {
    choice = button.dataset.adChoice === 'allow' && !gpc ? 'allow' : 'deny';
    try { localStorage.setItem(KEY, JSON.stringify({ value: choice, time: Date.now() })); }
    catch { /* The choice is still valid for this page visit. */ }
    showStatus();
    if (choice === 'deny' && loaded) {
      // Removing the script element cannot undo provider listeners or already inserted ads.
      // Reload the document after giving the calculator time to finish its pending save.
      status.textContent = 'Ads are off. Reloading to stop the ad service…';
      panel.querySelectorAll('button').forEach(button => { button.disabled = true; });
      setTimeout(() => location.reload(), 350);
      return;
    }
    toggle(false, true);
    loadAd();
  });
  preferencesButton.addEventListener('click', () => { showStatus(); toggle(true, true); });
  closeButton.addEventListener('click', () => toggle(false, true));
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') toggle(false, true);
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    choice = readChoice();
    if (loaded && choice === 'deny') { location.reload(); return; }
    showStatus();
    toggle(false);
    // An allowance made in another tab takes effect on the next navigation here.
  });
  showStatus();
  toggle(false);
  loadAd();
})();
