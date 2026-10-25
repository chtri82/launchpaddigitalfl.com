import { chromium } from 'playwright-core';
const out = '/workspace/lp-newsletter/screenshots';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
for (const [n, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const p = await b.newPage({ viewport: vp });
  await p.goto('http://localhost:8080/subscribe/#launchpad', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in', 'visible', 'is-visible')));
  await p.addStyleTag({ content: '.reveal{opacity:1!important;transform:none!important}' });
  await p.locator('#launchpad').screenshot({ path: `${out}/subscribe-form-${n}.png` });
  await p.screenshot({ path: `${out}/subscribe-page-${n}-full.png`, fullPage: true });
  if (n === 'desktop') {
    await p.fill('#lp-email', `browser${Date.now()}@example.com`); await p.fill('#lp-name', 'Browser Test');
    await p.click('button[type=submit]'); await p.waitForFunction(() => /Check your email|wrong|reach/.test(document.querySelector('.lp-msg').textContent));
    console.log('form result:', await p.textContent('.lp-msg'));
    await p.locator('#lp-signup').screenshot({ path: `${out}/subscribe-form-submitted.png` });
  }
}
await b.close();
