const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const outDir = '/Users/samiaji/Documents/Diregram/web/.codex-screens';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const shot = async (name) => {
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  };

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await shot('final_landing');

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="you@company.com"]', 'samiadmin');
  await page.getByRole('button', { name: /send code/i }).click();
  await page.waitForURL('**/workspace', { timeout: 10000 });
  await shot('final_workspace');

  // Open project list for Demo Map
  const demoMapRowOnWorkspace = page.locator('text=Demo Map').first();
  if (await demoMapRowOnWorkspace.count()) {
    await demoMapRowOnWorkspace.click({ force: true });
    await page.waitForTimeout(1200);
  }
  await shot('final_project_files');

  const openAndShot = async (label, fileName) => {
    const row = page.locator(`text=${label}`).first();
    if (!(await row.count())) return false;
    await row.click({ force: true });
    await page.waitForTimeout(1400);
    await shot(fileName);
    await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1000);
    return true;
  };

  await openAndShot('Evidence Diagram', 'final_editor_diagram');
  await openAndShot('Evidence Grid', 'final_editor_grid');
  await openAndShot('Evidence Note', 'final_editor_note');
  await openAndShot('Evidence Vision', 'final_editor_vision');
  await openAndShot('Evidence Test', 'final_editor_test');
  await openAndShot('Demo Map', 'final_editor_demo_map');

  await browser.close();
})();
