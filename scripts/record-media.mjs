// Records the README animations: a 3D banner and a tour of the real shop. Needs ffmpeg.
// Usage: node scripts/record-media.mjs   (writes docs/media/*.webm and *.gif)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, readdirSync, rmSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = 'docs/media', TMP = '/tmp/rec'; rmSync(TMP, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const env = { ...process.env, PORT: '8793', NODE_ENV: 'development', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'x'.repeat(20), ADMIN_TOKEN: 'a'.repeat(30) };
const srv = spawn('node', ['scripts/dev-server.mjs'], { env, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
const B = 'http://localhost:8793';
// Demo-only placeholder photos (soft gradients), so the recording never shows third-party pictures.
const hues = [350, 255, 170, 30, 200, 320];
let n = 0; const seen = new Map();
const pic = url => { if (!seen.has(url)) seen.set(url, hues[n++ % hues.length]); const h = seen.get(url);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,72%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},60%,45%)"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><circle cx="300" cy="330" r="120" fill="#fff" opacity=".18"/><rect x="190" y="470" width="220" height="150" rx="24" fill="#fff" opacity=".14"/></svg>`; };
async function record(name, w, h, fn) {
  const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: TMP, size: { width: w, height: h } } });
  const p = await ctx.newPage(); await p.route(/images\.unsplash\.com/, r => r.fulfill({ contentType: 'image/svg+xml', body: pic(r.request().url()) }));
  await fn(p); const v = p.video(); await ctx.close(); await v.saveAs(`${OUT}/${name}.webm`); await br.close();
}
const wait = (p, ms) => p.waitForTimeout(ms);
await record('banner', 1200, 600, async p => { await p.goto('file://' + process.cwd() + '/docs/banner.html'); await wait(p, 8000); });
await record('tour', 1280, 720, async p => {
  await p.goto(B + '/'); await wait(p, 1800);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 380); await wait(p, 600); }
  await p.goto(B + '/product/own-sample-tee'); await wait(p, 1200);
  await p.getByRole('button', { name: /Size guide/ }).click(); await wait(p, 800);
  const d = p.locator('[role=dialog]'); await d.getByLabel('Height (cm)').fill('175'); await d.getByLabel('Weight (kg)').fill('70');
  await d.getByRole('button', { name: 'Suggest a size' }).click(); await wait(p, 1500);
  await d.getByRole('button', { name: /Select size/ }).click(); await wait(p, 700);
  await p.getByRole('button', { name: /add to bag/i }).first().click(); await wait(p, 800);
  await p.goto(B + '/shop'); await wait(p, 1200); await p.locator('.product-grid article').first().hover(); await wait(p, 600);
  await p.locator('.qv-btn').first().click(); await wait(p, 1400); await p.keyboard.press('Escape'); await wait(p, 500);
  await p.goto(B + '/collections'); await wait(p, 1400); await p.goto(B + '/bag'); await wait(p, 1800);
});
srv.kill();
for (const [n, ss, fps, w, colors] of [['banner', 1, 12, 720, 48], ['tour', 0.5, 12, 800, 96]]) {
  execSync(`ffmpeg -y -loglevel error -ss ${ss} -i ${OUT}/${n}.webm -vf "fps=${fps},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=none" ${OUT}/${n}.gif`);
}
console.log(readdirSync(OUT).join('\n'));
