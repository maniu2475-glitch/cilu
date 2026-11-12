/**
 * 词炉 · PWA 离线能力专项验收
 * 在 localhost（等同 HTTPS 安全上下文）上验证 Service Worker 真能离线
 */
import { chromium } from 'playwright';

const CHROME = 'C:\\Users\\ADMIN\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = process.env.BASE || 'http://localhost:8799';

let pass = 0, fail = 0;
const out = [];
const ok = (n, c, e = '') => { c ? pass++ : fail++; out.push(`${c ? 'PASS' : 'FAIL'}  ${n}  ${c ? '' : e}`); };

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
const netErr = [];
page.on('pageerror', e => netErr.push('PAGEERROR ' + e.message));
page.on('response', r => { if (r.status() >= 400) netErr.push(`HTTP ${r.status()} ${r.url()}`); });

// ---------- 1. 安全上下文 ----------
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const sec = await page.evaluate(() => ({
  isSecure: window.isSecureContext,
  hasSW: 'serviceWorker' in navigator,
  origin: location.origin
}));
ok('运行在安全上下文', sec.isSecure === true, JSON.stringify(sec));
ok('浏览器支持 Service Worker', sec.hasSW === true);

// ---------- 2. SW 注册与激活 ----------
await page.waitForTimeout(2500);
const sw1 = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { state: 'none' };
  return {
    state: reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'registered',
    scope: reg.scope,
    activeUrl: reg.active?.scriptURL || null
  };
});
ok('SW 已激活', sw1.state === 'active', JSON.stringify(sw1));
ok('SW 作用域覆盖根', sw1.scope && sw1.scope.endsWith('/'), sw1.scope);

// ---------- 3. 缓存内容 ----------
const cache = await page.evaluate(async () => {
  const names = await caches.keys();
  const detail = {};
  for (const n of names) {
    const c = await caches.open(n);
    detail[n] = (await c.keys()).map(r => new URL(r.url).pathname);
  }
  return { names, detail };
});
ok('存在缓存空间', cache.names.length > 0, JSON.stringify(cache.names));
const allCached = Object.values(cache.detail).flat();
ok('缓存含首页', allCached.some(p => p.endsWith('/index.html') || p === '/'), JSON.stringify(allCached));
ok('缓存含 manifest', allCached.some(p => p.includes('manifest.json')), JSON.stringify(allCached));
ok('缓存含 sw 自身或图标', allCached.some(p => p.includes('icon')), JSON.stringify(allCached));

// ---------- 4. 造点数据 ----------
await page.locator('#btnMenu').click();
await page.waitForTimeout(300);
page.once('dialog', d => d.accept());
await page.locator('#mSeed').click();
await page.waitForTimeout(700);
await page.locator('#sheet .mask').click({ force: true }).catch(() => {});
await page.waitForTimeout(300);
const seeded = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
ok('示例词已装', seeded === 12, 'words=' + seeded);

// 做一个词让统计有变化
await page.locator('#btnStartReview').click();
await page.waitForTimeout(400);
if (await page.locator('#rvShow').count()) {
  await page.locator('#rvShow').click();
  await page.waitForTimeout(200);
  await page.locator('.grade button[data-q="2"]').click();
  await page.waitForTimeout(300);
  await page.locator('#rvQuit').click().catch(() => {});
}
await page.waitForTimeout(400);
const beforeOffline = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('cilu.v1'));
  return { words: db.words.length, rev: db.stats.revMin };
});
ok('离线前有学习记录', beforeOffline.rev >= 1, JSON.stringify(beforeOffline));

// ---------- 5. 完全断网重载 ----------
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const off = await page.evaluate(() => {
  const db = (() => { try { return JSON.parse(localStorage.getItem('cilu.v1')); } catch (e) { return null; } })();
  return {
    title: document.title,
    total: document.querySelector('#sTotal')?.textContent,
    due: document.querySelector('#sDue')?.textContent,
    words: db ? db.words.length : -1,
    hasNav: document.querySelectorAll('nav button').length,
    styled: getComputedStyle(document.body).backgroundImage.includes('gradient')
  };
});
ok('断网后页面能打开', off.title.includes('词炉') && off.hasNav === 4, JSON.stringify(off));
ok('断网后数据完整', off.words === beforeOffline.words, `本地 ${off.words} vs 断网前 ${beforeOffline.words}`);
ok('断网后样式加载', off.styled === true);
ok('断网后统计渲染正确', off.total === String(off.words), `total=${off.total} words=${off.words}`);

// 断网状态下还能操作
await page.locator('nav button[data-v="new"]').click();
await page.waitForTimeout(300);
await page.locator('#fWord').fill('offlinetest');
await page.locator('#fMean').fill('离线测试');
await page.locator('#reasonChips .chip[data-r="理解"]').click();
await page.locator('#btnAddWord').click();
await page.waitForTimeout(400);
const addedOffline = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
ok('断网状态下能新增词', addedOffline === beforeOffline.words + 1, `${beforeOffline.words} -> ${addedOffline}`);

// 断网下做一次复习
await page.locator('nav button[data-v="home"]').click();
await page.waitForTimeout(300);
await page.locator('#btnStartReview').click();
await page.waitForTimeout(400);
const canReview = await page.locator('#rvShow').count();
ok('断网状态下能进复习', canReview > 0);
if (canReview) {
  await page.locator('#rvShow').click();
  await page.waitForTimeout(200);
  await page.locator('.grade button[data-q="2"]').click();
  await page.waitForTimeout(300);
  const revAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).stats.revMin);
  ok('断网复习进度落盘', revAfter >= 2, 'revMin=' + revAfter);
}

// ---------- 6. 恢复网络 ----------
await ctx.setOffline(false);
await page.waitForTimeout(500);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const back = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('cilu.v1'));
  return { words: db.words.length, total: document.querySelector('#sTotal')?.textContent };
});
ok('恢复网络后数据保留', back.words === addedOffline, `${addedOffline} -> ${back.words}`);
ok('恢复网络后 SW 仍激活', await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return !!(r && r.active);
}));

// ---------- 7. 可安装性素材 ----------
const inst = await page.evaluate(async () => {
  const r = await fetch('manifest.json');
  const m = await r.json();
  return {
    name: m.name, short: m.short_name, display: m.display,
    startUrl: m.start_url, icons: m.icons.map(i => i.sizes + ':' + i.purpose),
    okIconPaths: m.icons.every(i => i.src.split('/')[0] === 'icons')
  };
});
ok('manifest 名称合规', !!inst.name && !!inst.short, JSON.stringify(inst));
ok('display 为 standalone', inst.display === 'standalone');
ok('图标尺寸齐全', inst.icons.some(s => s.startsWith('192')) && inst.icons.some(s => s.startsWith('512')), JSON.stringify(inst.icons));

console.log('\n=========== PWA 离线验收 ===========');
out.forEach(l => console.log(l));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
console.log(netErr.length ? '\n---- 异常 ----\n' + [...new Set(netErr)].join('\n') : '\n异常：无');

await browser.close();
process.exit(fail ? 1 : 0);
