import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function build(url) {
  return spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, env: { ...process.env, SITE_URL: url }, encoding: 'utf8', windowsHide: true });
}
test('deployment build generates real canonical URLs and a matching sitemap, and removes placeholders', async () => {
  try {
    const result = build('https://raisewise.example');
    assert.equal(result.status, 0, result.stderr);
    const sitemap = await readFile(path.join(root, 'dist/sitemap.xml'), 'utf8');
    const robots = await readFile(path.join(root, 'dist/robots.txt'), 'utf8');
    assert.ok(robots.includes('Sitemap: https://raisewise.example/sitemap.xml'));
    for (const route of ['', 'about/', 'methodology/', 'privacy/']) {
      const page = await readFile(path.join(root, 'dist', route, 'index.html'), 'utf8');
      assert.ok(page.includes(`rel="canonical" href="https://raisewise.example/${route}"`));
      assert.ok(sitemap.includes(`<loc>https://raisewise.example/${route}</loc>`));
      assert.ok(!page.includes('SITE_META'));
    }
    await access(path.join(root, 'dist/404.html'));
    await access(path.join(root, 'dist/_headers'));
    const invalid = build('https://example.com/private/path');
    assert.notEqual(invalid.status, 0);
  } finally {
    const result = build('');
    assert.equal(result.status, 0, result.stderr);
  }
  const page = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.ok(!page.includes('raisewise.example'));
  await assert.rejects(access(path.join(root, 'dist/sitemap.xml')));
});
