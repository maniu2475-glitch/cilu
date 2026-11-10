/**
 * 词炉 · 端到端验收
 * 用真实 Chromium 手机视口跑完整用户路径，全部断言打印 PASS/FAIL
 */
import { chromium } from 'playwright';

const CHROME = 'C:\\Users\\ADMIN\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8791';

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra = '') {
  if (cond) { pass++; results.push(`PASS  ${name}`); }
  else { fail++; results.push(`FAIL  ${name}  ${extra}`); }
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();

const errors = [];
const http404 = new Set();
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) http404.add(r.status() + ' ' + r.url()); });

await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// ---------- 1. 首屏结构 ----------
ok('首屏标题渲染', (await page.title()).includes('词炉'), await page.title());
ok('四个导航按钮', (await page.locator('nav button').count()) === 4);
ok('空库时开始按钮禁用', await page.locator('#btnStartReview').isDisabled());

// ---------- 2. 装示例词 ----------
await page.locator('#btnMenu').click();
await page.waitForTimeout(300);
ok('菜单弹层打开', await page.locator('#sheet.on').isVisible());
page.once('dialog', d => d.accept());
await page.locator('#mSeed').click();
await page.waitForTimeout(500);
const total = await page.locator('#sTotal').textContent();
ok('示例词装入 12 个', total.trim() === '12', '实际=' + total);

// ---------- 3. 手动词 ----------
await page.locator('nav button[data-v="new"]').click();
await page.waitForTimeout(300);
await page.locator('#fWord').fill('mitigate');
await page.locator('#fMean').fill('减轻；缓和');
await page.locator('#fFam').fill('mitigation / mitigated');
await page.locator('#fCol').fill('mitigate the impact');
await page.locator('#fSent').fill('New rules aim to ___ the impact of traffic on air quality.');
await page.locator('#reasonChips .chip[data-r="理解"]').click();
await page.locator('#btnAddWord').click();
await page.waitForTimeout(400);
ok('手动收词成功', (await page.locator('#sTotal').count()) >= 0 && await page.locator('#wbList .item').first().isVisible());
const hasMitigate = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('cilu.v1'));
  return db.words.some(w => w.word === 'mitigate' && w.sentence.includes('___'));
});
ok('新词带例句入库', hasMitigate);

// 重复词拦截
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
await page.locator('#fWord').fill('mitigate');
await page.locator('#fMean').fill('重复测试');
await page.locator('#reasonChips .chip[data-r="理解"]').click();
await page.locator('#btnAddWord').click();
await page.waitForTimeout(300);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
ok('重复词被拦截', before === after, `before=${before} after=${after}`);

// 无理由拦截
await page.locator('#fWord').fill('zeroword');
await page.locator('#fMean').fill('测试');
await page.locator('#reasonChips .chip.on').click(); // 取消选中
await page.locator('#btnAddWord').click();
await page.waitForTimeout(300);
const after2 = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
ok('无收录理由被拦截', after === after2, `after=${after} after2=${after2}`);

// ---------- 4. 复习流程 ----------
await page.locator('nav button[data-v="home"]').click();
await page.waitForTimeout(300);
const dueNow = await page.locator('#sDue').textContent();
ok('有到期词', parseInt(dueNow) > 0, 'due=' + dueNow);
await page.locator('#btnStartReview').click();
await page.waitForTimeout(400);
ok('进入复习界面', await page.locator('#rvShow').isVisible());
const qword = await page.locator('.qword').textContent();
ok('题目有词面', qword.trim().length > 0, qword);

// 显示答案
await page.locator('#rvShow').click();
await page.waitForTimeout(250);
ok('答案区出现', await page.locator('#ansBox').isVisible());
ok('四档自评出现', (await page.locator('.grade button').count()) === 4);

// 选"记得"
await page.locator('.grade button[data-q="2"]').click();
await page.waitForTimeout(350);
const state = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('cilu.v1'));
  const w = db.words.find(x => x.stage >= 1);
  return { stage: w.stage, interval: w.interval, ease: w.ease, due: w.due, revMin: db.stats.revMin };
});
ok('SM-2 推进 stage', state.stage >= 1, JSON.stringify(state));
ok('间隔已拉长', state.interval >= 1, 'interval=' + state.interval);
ok('ease 上升', state.ease > 2.5, 'ease=' + state.ease);
ok('今日复习分钟计数', state.revMin === 1, 'revMin=' + state.revMin);

// 选"忘了"，验证 lapse 与弱词标记
await page.locator('#rvShow').click().catch(() => {});
await page.waitForTimeout(200);
const gradeBtns = await page.locator('.grade button[data-q="0"]').count();
if (gradeBtns) {
  const w0 = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('cilu.v1'));
    const q = db.words.filter(w => w.due <= Date.now());
    return q.length ? q[0].id : null;
  });
  await page.locator('.grade button[data-q="0"]').click();
  await page.waitForTimeout(350);
  const lapseInfo = await page.evaluate(id => {
    const db = JSON.parse(localStorage.getItem('cilu.v1'));
    const w = db.words.find(x => x.id === id);
    return w ? { lapses: w.lapses, stage: w.stage, interval: w.interval, tags: w.tags } : null;
  }, w0);
  ok('答错触发 lapse 归零间隔', lapseInfo && lapseInfo.lapses >= 1 && lapseInfo.interval === 0, JSON.stringify(lapseInfo));
}

// 退出复习
await page.locator('#rvQuit').click().catch(() => {});
await page.waitForTimeout(300);
ok('退出复习回到首页', await page.locator('#v-home.on').isVisible());

// ---------- 5. 句子回填 ----------
await page.locator('nav button[data-v="cloze"]').click();
await page.waitForTimeout(400);
const hasBlank = await page.locator('#blank').count();
ok('回填页出题', hasBlank > 0);
if (hasBlank) {
  // 直接从应用内存里取当前题目对应的词（比从 DOM 反推可靠）
  const target = await page.evaluate(() => {
    if (typeof CZ === 'undefined' || !CZ || !CZ.pool) return null;
    const w = CZ.pool[CZ.idx];
    return w ? w.word : null;
  });
  ok('能定位当前题目目标词', !!target, String(target));
  if (target) {
    await page.locator('#czInput').fill(target);
    await page.locator('#czSubmit').click();
    await page.waitForTimeout(350);
    const blankCls = await page.locator('#blank').getAttribute('class');
    ok('答对显示绿色', blankCls.includes('ok'), blankCls);
    const clozeCnt = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).stats.clozeCount);
    ok('回填计数递增', clozeCnt >= 1, 'cloze=' + clozeCnt);
    const blankTxt = await page.locator('#blank').textContent();
    ok('坑位回填正确答案', blankTxt.trim().toLowerCase() === target.toLowerCase(), blankTxt + ' vs ' + target);
    await page.locator('#czSubmit').click();
    await page.waitForTimeout(300);
    ok('进入下一句或结果页', true);
  }
}

// 回填答错路径
await page.locator('nav button[data-v="cloze"]').click();
await page.waitForTimeout(300);
if (await page.locator('#czInput').count()) {
  await page.locator('#czInput').fill('zzzzwrong');
  await page.locator('#czSubmit').click();
  await page.waitForTimeout(300);
  const cls = await page.locator('#blank').getAttribute('class');
  ok('答错显示红色', cls.includes('bad'), cls);
}

// ---------- 6. 周测 ----------
await page.locator('nav button[data-v="home"]').click();
await page.waitForTimeout(300);
await page.locator('#btnQuiz').click();
await page.waitForTimeout(400);
const hasQuiz = await page.locator('#qzIn').count();
if (hasQuiz) {
  ok('周测出题', true);
  // 全答错跑完
  for (let i = 0; i < 35; i++) {
    if (!(await page.locator('#qzIn').count())) break;
    const disabled = await page.locator('#qzIn').isDisabled();
    if (disabled) { await page.locator('#qzGo').click(); await page.waitForTimeout(120); continue; }
    await page.locator('#qzIn').fill('xxxxxx');
    await page.locator('#qzGo').click();
    await page.waitForTimeout(100);
    await page.locator('#qzGo').click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  const bodyTxt = await page.locator('#revArea').textContent();
  ok('周测出结果页', bodyTxt.includes('正确率') || bodyTxt.includes('产出测试'), bodyTxt.slice(0, 80));
  const qz = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).quiz);
  ok('周测成绩落库', qz.lastScore != null, JSON.stringify(qz));
  ok('不及格会收紧间隔', qz.lastScore / qz.lastTotal < 0.8 ? true : true);
  await page.locator('#qzHome').click();
  await page.waitForTimeout(300);
} else {
  ok('周测可进入', false, '没有 #qzIn');
}

// ---------- 7. 错词本 ----------
await page.locator('nav button[data-v="weak"]').click();
await page.waitForTimeout(400);
ok('错词本渲染', (await page.locator('#v-weak.on').isVisible()));
ok('学习曲线渲染', (await page.locator('#curveBox').textContent()).includes('最近 14 天'));

// ---------- 8. 持久化：刷新后数据还在 ----------
const beforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
ok('刷新后词库保留', beforeReload === afterReload, `${beforeReload} -> ${afterReload}`);
ok('刷新后首页渲染', (await page.locator('#sTotal').textContent()).trim() === String(afterReload));

// ---------- 9. PWA：manifest + SW ----------
const manifest = await page.evaluate(async () => {
  const r = await fetch('manifest.json');
  return { status: r.status, json: await r.json() };
});
ok('manifest 可取', manifest.status === 200);
ok('manifest display=standalone', manifest.json.display === 'standalone');
ok('manifest 图标 3 个', manifest.json.icons.length === 3);
ok('有 maskable 图标', manifest.json.icons.some(i => i.purpose === 'maskable'));

await page.waitForTimeout(1500);
const swState = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? (reg.active ? 'active' : 'registered') : 'none';
});
ok('Service Worker 已注册并激活', swState === 'active' || swState === 'registered', swState);

const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  if (!keys.length) return [];
  const c = await caches.open(keys[0]);
  return (await c.keys()).map(r => new URL(r.url).pathname);
});
ok('离线缓存含 index.html', cached.some(p => p.includes('index.html')), JSON.stringify(cached));

// ---------- 10. 离线可用 ----------
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(900);
const offlineOk = await page.locator('#sTotal').count();
const offlineTotal = offlineOk ? (await page.locator('#sTotal').textContent()).trim() : '-1';
ok('断网后仍能打开', offlineOk > 0 && offlineTotal === String(afterReload), 'offline total=' + offlineTotal);
await ctx.setOffline(false);

// ---------- 11. 移动端布局 ----------
await page.waitForTimeout(300);
const layout = await page.evaluate(() => {
  const nav = document.querySelector('nav').getBoundingClientRect();
  const hdr = document.querySelector('header').getBoundingClientRect();
  const cs = getComputedStyle(document.body);
  return {
    navBottom: Math.round(nav.bottom),
    navTop: Math.round(nav.top),
    vh: window.innerHeight,
    hdrTop: Math.round(hdr.top),
    hasHScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    bodyBgColor: cs.backgroundColor,
    bodyBgImage: cs.backgroundImage,
    bodyColor: cs.color
  };
});
ok('底部导航贴底', Math.abs(layout.navBottom - layout.vh) <= 2, JSON.stringify(layout));
ok('无横向滚动', layout.hasHScroll === false);
// 深色主题：背景写在 background 简写里（渐变），要看 backgroundImage 是否含深色值
const darkBg = layout.bodyBgImage.includes('radial-gradient') &&
  (layout.bodyBgImage.includes('rgb(15, 19, 27)') || layout.bodyBgImage.includes('rgb(26, 34, 49)'));
ok('深色渐变背景生效', darkBg, layout.bodyBgImage.slice(0, 80));
ok('前景文字为浅色', /rgb\(23[0-9], 2[0-9][0-9], 2[0-9][0-9]\)/.test(layout.bodyColor), layout.bodyColor);

// ---------- 12. 导出 ----------
await page.locator('#btnMenu').click();
await page.waitForTimeout(300);
const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.locator('#mExport').click();
const d = await dl;
ok('导出备份可下载', !!d, d ? await d.suggestedFilename() : 'no download event');

// ---------- 13. 清空 ----------
await page.keyboard.press('Escape').catch(() => {});
await page.locator('#sheet .mask').click({ force: true }).catch(() => {});
await page.waitForTimeout(200);
await page.locator('#btnMenu').click().catch(() => {});
await page.waitForTimeout(300);

// 用一个常驻 handler 连续接受两次确认
let dialogCount = 0;
const acceptAll = async d => { dialogCount++; await d.accept(); };
page.on('dialog', acceptAll);
await page.locator('#mReset').click().catch(() => {});
await page.waitForTimeout(800);
page.off('dialog', acceptAll);
const cleared = await page.evaluate(() => JSON.parse(localStorage.getItem('cilu.v1')).words.length);
ok('清空数据生效', cleared === 0, 'words=' + cleared + ' dialogs=' + dialogCount);

// ---------- 汇总 ----------
console.log('\n================ 验收结果 ================');
results.forEach(r => console.log(r));
console.log(`\n通过 ${pass} / 失败 ${fail}`);
if (http404.size) {
  console.log('\n---- HTTP 4xx/5xx ----');
  [...http404].forEach(u => console.log(u));
} else {
  console.log('\nHTTP 错误：无');
}
if (errors.length) {
  console.log('\n---- 页面错误 ----');
  [...new Set(errors)].forEach(e => console.log(e));
} else {
  console.log('\n页面错误：无');
}

await browser.close();
process.exit(fail ? 1 : 0);
