import { chromium } from 'playwright';
const CHROME = 'C:\\Users\\ADMIN\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe';
const BASE = 'http://127.0.0.1:8791';

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai'
});
const page = await ctx.newPage();
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

// 装示例词
await page.locator('#btnMenu').click(); await page.waitForTimeout(250);
page.once('dialog', d => d.accept());
await page.locator('#mSeed').click(); await page.waitForTimeout(600);
await page.locator('#home').count();
await page.locator('#mClose').click().catch(() => {});
await page.locator('#sheet .mask').click({ force: true }).catch(() => {});
await page.waitForTimeout(400);

await page.screenshot({ path: 'shot-1-home.png' });

// 复习
await page.locator('#btnStartReview').click(); await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-2-review-q.png' });
await page.locator('#rvShow').click(); await page.waitForTimeout(300);
await page.screenshot({ path: 'shot-3-review-a.png' });

// 做几个词，让数据好看点
for (let i = 0; i < 5; i++) {
  const b = page.locator('.grade button[data-q="2"]');
  if (await b.count()) { await b.click(); await page.waitForTimeout(250); }
  await page.locator('#rvShow').click().catch(() => {});
  await page.waitForTimeout(150);
}
await page.locator('#rvQuit').click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-4-home-progress.png' });

// 收词页
await page.locator('nav button[data-v="new"]').click(); await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-5-newform.png', fullPage: false });

// 回填
await page.locator('nav button[data-v="cloze"]').click(); await page.waitForTimeout(400);
await page.locator('#czShowHint').click().catch(() => {});
await page.waitForTimeout(200);
await page.screenshot({ path: 'shot-6-cloze.png' });

// 错词本
await page.locator('nav button[data-v="weak"]').click(); await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-7-weak.png' });

// 周测
await page.locator('nav button[data-v="home"]').click(); await page.waitForTimeout(300);
await page.locator('#btnQuiz').click(); await page.waitForTimeout(500);
await page.screenshot({ path: 'shot-8-quiz.png' });

console.log('截图完成');
await browser.close();
