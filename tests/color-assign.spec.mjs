import { test, expect } from '@playwright/test';

// Helper: extract color from window.colorPlayers, with debug
async function getMyColor(page, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const debug = await page.evaluate(() => ({
      ws: typeof window.ws !== 'undefined',
      wsUserId: window.ws && window.ws._userId,
      colorPlayers: window.colorPlayers,
      colorPlayersKeys: window.colorPlayers ? Object.keys(window.colorPlayers) : null,
    }));
    // eslint-disable-next-line no-console
    console.log('DEBUG:', debug);
    const color = await page.evaluate(() => {
      if (!window.ws || !window.ws._userId) return null;
      const colorPlayers = window.colorPlayers || {};
      const myColorHex = colorPlayers[window.ws._userId];
      // Map hex to name
      const colorMap = {
        '#e74c3c': 'red',
        '#2ecc40': 'green',
        '#3498db': 'blue',
        '#3a3a7a': 'navy',
        '#ff9800': 'orange',
        '#f1c40f': 'yellow',
      };
      return colorMap[myColorHex] || myColorHex;
    });
    if (color) return color;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

test('პირველი მოთამაშე ყოველთვის წითელია, მეორე მწვანე', async ({ browser }) => {
  // ორი user-ის იმიტაცია
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // ორივე user შედის ერთ ოთახში
  await page1.goto('http://localhost:8000/great7.html?room=playwright-test');
  await page2.goto('http://localhost:8000/great7.html?room=playwright-test');

  // დავბეჭდოთ გვერდის მისამართი და html
  const href1 = await page1.evaluate(() => window.location.href);
  const html1 = await page1.evaluate(() => document.body.outerHTML);
  console.log('PAGE1 HREF:', href1);
  console.log('PAGE1 HTML:', html1);

  // დაველოდოთ ფერების მინიჭებას (retry)
  const color1 = await getMyColor(page1);
  const color2 = await getMyColor(page2);

  console.log('color1:', color1);
  console.log('color2:', color2);

  expect(color1).toBe('red');
  expect(color2).toBe('green');

  // დავრწმუნდეთ, რომ თამაში არ მთავრდება დროზე ადრე
  const gameOver1 = await page1.evaluate(() => window.GAME_OVER || false);
  const gameOver2 = await page2.evaluate(() => window.GAME_OVER || false);
  expect(gameOver1).toBeFalsy();
  expect(gameOver2).toBeFalsy();

  await context1.close();
  await context2.close();
});

test('Board and stones are correct for 3 players', async ({ browser, request }) => {
  // Create room via API (use full URL)
  const res = await request.post('http://localhost:8000/api/rooms', {
    data: { name: 'Playwright Room', players: 3 }
  });
  expect(res.ok()).toBeTruthy();
  const { id: roomId } = await res.json();
  const roomUrl = `/great7.html?room=${roomId}`;

  // Create 3 browser contexts (players)
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const context3 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  const page3 = await context3.newPage();

  // Set localStorage and join room for each player
  await page1.goto(roomUrl);
  await page1.evaluate(() => {
    localStorage.setItem('great7-lobby', JSON.stringify({ n: 3, regName: 'P1' }));
  });
  await page1.reload();
  await page1.click('text=შესვლა');

  await page2.goto(roomUrl);
  await page2.evaluate(() => {
    localStorage.setItem('great7-lobby', JSON.stringify({ n: 3, regName: 'P2' }));
  });
  await page2.reload();
  await page2.click('text=შესვლა');

  await page3.goto(roomUrl);
  await page3.evaluate(() => {
    localStorage.setItem('great7-lobby', JSON.stringify({ n: 3, regName: 'P3' }));
  });
  await page3.reload();
  await page3.click('text=შესვლა');

  // Wait for all players to join and board to render
  await page1.waitForTimeout(2000);
  await page2.waitForTimeout(2000);
  await page3.waitForTimeout(2000);

  // Check that each player sees 21 stones (3 colors x 7 stones)
  for (const page of [page1, page2, page3]) {
    const stones = await page.$$('[data-stone-id]');
    expect(stones.length).toBe(21);
  }

  // Check that each player sees 3 unique colors
  for (const page of [page1, page2, page3]) {
    const colors = await page.$$eval('[data-stone-id]', els => Array.from(new Set(els.map(e => e.getAttribute('fill')))));
    expect(colors.length).toBe(3);
  }

  await context1.close();
  await context2.close();
  await context3.close();
}); 