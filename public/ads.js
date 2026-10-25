// Monetag is loaded only by the unmodified provider snippet in index.html.
// This file does not load ads or offer controls that cannot stop that snippet.
(() => {
  const tag = document.querySelector('script[data-zone="12120101"][src="https://nap5k.com/tag.min.js"]');
  if (tag) tag.id = 'monetag-inpage-tag';
  const footer = document.querySelector('.site-footer nav');
  if (!footer) return;
  const link = document.createElement('a');
  link.href = '/privacy/#advertising';
  link.textContent = 'Advertising privacy';
  footer.append(link);
})();
