import { cp, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { documents, documentHTML } from './documents.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist');
const config = JSON.parse(await readFile(path.join(root, 'site.config.json'), 'utf8'));
const rawURL = (process.env.SITE_URL || config.url || '').trim();
let siteURL = '';
if (rawURL) {
  const parsed = new URL(rawURL);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw new Error('SITE_URL must be an http(s) origin, such as https://example.com, without a path, query, or credentials.');
  siteURL = parsed.origin;
}
const escapeHTML = text => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function withMeta(html, route) {
  const canonical = siteURL ? `<link rel="canonical" href="${escapeHTML(siteURL + route)}"><meta property="og:url" content="${escapeHTML(siteURL + route)}">` : '';
  return html.replace('<!-- SITE_META -->', canonical);
}

await mkdir(out, { recursive: true });
await cp(path.join(root, 'public'), out, { recursive: true });
const home = await readFile(path.join(root, 'public/index.html'), 'utf8');
await writeFile(path.join(out, 'index.html'), withMeta(home, '/'));
for (const doc of documents) {
  await mkdir(path.join(out, doc.slug), { recursive: true });
  await writeFile(path.join(out, doc.slug, 'index.html'), withMeta(documentHTML(doc), `/${doc.slug}/`));
}
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n${siteURL ? `\nSitemap: ${siteURL}/sitemap.xml\n` : ''}`);
if (siteURL) {
  const urls = ['/', ...documents.map(doc => `/${doc.slug}/`)];
  await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(route => `<url><loc>${escapeHTML(siteURL + route)}</loc></url>`).join('')}</urlset>\n`);
} else {
  await unlink(path.join(out, 'sitemap.xml')).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
console.log(`Built RaiseWise → ${out}`);
console.log(siteURL ? `Canonical URLs and sitemap: ${siteURL}` : 'No production domain set. Set SITE_URL in Cloudflare Pages to generate canonical URLs and sitemap.xml.');
