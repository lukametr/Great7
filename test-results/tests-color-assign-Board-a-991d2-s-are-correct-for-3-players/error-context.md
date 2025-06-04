# Test info

- Name: Board and stones are correct for 3 players
- Location: C:\Users\lukacode\Desktop\G7\go-app\tests\color-assign.spec.mjs:73:1

# Error details

```
Error: expect(received).toBeTruthy()

Received: false
    at C:\Users\lukacode\Desktop\G7\go-app\tests\color-assign.spec.mjs:78:20
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | // Helper: extract color from window.colorPlayers, with debug
   4 | async function getMyColor(page, timeout = 5000) {
   5 |   const start = Date.now();
   6 |   while (Date.now() - start < timeout) {
   7 |     const debug = await page.evaluate(() => ({
   8 |       ws: typeof window.ws !== 'undefined',
   9 |       wsUserId: window.ws && window.ws._userId,
   10 |       colorPlayers: window.colorPlayers,
   11 |       colorPlayersKeys: window.colorPlayers ? Object.keys(window.colorPlayers) : null,
   12 |     }));
   13 |     // eslint-disable-next-line no-console
   14 |     console.log('DEBUG:', debug);
   15 |     const color = await page.evaluate(() => {
   16 |       if (!window.ws || !window.ws._userId) return null;
   17 |       const colorPlayers = window.colorPlayers || {};
   18 |       const myColorHex = colorPlayers[window.ws._userId];
   19 |       // Map hex to name
   20 |       const colorMap = {
   21 |         '#e74c3c': 'red',
   22 |         '#2ecc40': 'green',
   23 |         '#3498db': 'blue',
   24 |         '#3a3a7a': 'navy',
   25 |         '#ff9800': 'orange',
   26 |         '#f1c40f': 'yellow',
   27 |       };
   28 |       return colorMap[myColorHex] || myColorHex;
   29 |     });
   30 |     if (color) return color;
   31 |     await new Promise(r => setTimeout(r, 100));
   32 |   }
   33 |   return null;
   34 | }
   35 |
   36 | test('პირველი მოთამაშე ყოველთვის წითელია, მეორე მწვანე', async ({ browser }) => {
   37 |   // ორი user-ის იმიტაცია
   38 |   const context1 = await browser.newContext();
   39 |   const context2 = await browser.newContext();
   40 |   const page1 = await context1.newPage();
   41 |   const page2 = await context2.newPage();
   42 |
   43 |   // ორივე user შედის ერთ ოთახში
   44 |   await page1.goto('http://localhost:8000/great7.html?room=playwright-test');
   45 |   await page2.goto('http://localhost:8000/great7.html?room=playwright-test');
   46 |
   47 |   // დავბეჭდოთ გვერდის მისამართი და html
   48 |   const href1 = await page1.evaluate(() => window.location.href);
   49 |   const html1 = await page1.evaluate(() => document.body.outerHTML);
   50 |   console.log('PAGE1 HREF:', href1);
   51 |   console.log('PAGE1 HTML:', html1);
   52 |
   53 |   // დაველოდოთ ფერების მინიჭებას (retry)
   54 |   const color1 = await getMyColor(page1);
   55 |   const color2 = await getMyColor(page2);
   56 |
   57 |   console.log('color1:', color1);
   58 |   console.log('color2:', color2);
   59 |
   60 |   expect(color1).toBe('red');
   61 |   expect(color2).toBe('green');
   62 |
   63 |   // დავრწმუნდეთ, რომ თამაში არ მთავრდება დროზე ადრე
   64 |   const gameOver1 = await page1.evaluate(() => window.GAME_OVER || false);
   65 |   const gameOver2 = await page2.evaluate(() => window.GAME_OVER || false);
   66 |   expect(gameOver1).toBeFalsy();
   67 |   expect(gameOver2).toBeFalsy();
   68 |
   69 |   await context1.close();
   70 |   await context2.close();
   71 | });
   72 |
   73 | test('Board and stones are correct for 3 players', async ({ browser, request }) => {
   74 |   // Create room via API (use full URL)
   75 |   const res = await request.post('http://localhost:8000/api/rooms', {
   76 |     data: { name: 'Playwright Room', players: 3 }
   77 |   });
>  78 |   expect(res.ok()).toBeTruthy();
      |                    ^ Error: expect(received).toBeTruthy()
   79 |   const { id: roomId } = await res.json();
   80 |   const roomUrl = `/great7.html?room=${roomId}`;
   81 |
   82 |   // Create 3 browser contexts (players)
   83 |   const context1 = await browser.newContext();
   84 |   const context2 = await browser.newContext();
   85 |   const context3 = await browser.newContext();
   86 |   const page1 = await context1.newPage();
   87 |   const page2 = await context2.newPage();
   88 |   const page3 = await context3.newPage();
   89 |
   90 |   // Set localStorage and join room for each player
   91 |   await page1.goto(roomUrl);
   92 |   await page1.evaluate(() => {
   93 |     localStorage.setItem('great7-lobby', JSON.stringify({ n: 3, regName: 'P1' }));
   94 |   });
   95 |   await page1.reload();
   96 |   await page1.click('text=შესვლა');
   97 |
   98 |   await page2.goto(roomUrl);
   99 |   await page2.evaluate(() => {
  100 |     localStorage.setItem('great7-lobby', JSON.stringify({ n: 3, regName: 'P2' }));
  101 |   });
  102 |   await page2.reload();
  103 |   await page2.click('text=შესვლა');
  104 |
  105 |   await page3.goto(roomUrl);
  106 |   await page3.evaluate(() => {
  107 |     localStorage.setItem('great7-lobby', JSON.stringify({ n: 3, regName: 'P3' }));
  108 |   });
  109 |   await page3.reload();
  110 |   await page3.click('text=შესვლა');
  111 |
  112 |   // Wait for all players to join and board to render
  113 |   await page1.waitForTimeout(2000);
  114 |   await page2.waitForTimeout(2000);
  115 |   await page3.waitForTimeout(2000);
  116 |
  117 |   // Check that each player sees 21 stones (3 colors x 7 stones)
  118 |   for (const page of [page1, page2, page3]) {
  119 |     const stones = await page.$$('[data-stone-id]');
  120 |     expect(stones.length).toBe(21);
  121 |   }
  122 |
  123 |   // Check that each player sees 3 unique colors
  124 |   for (const page of [page1, page2, page3]) {
  125 |     const colors = await page.$$eval('[data-stone-id]', els => Array.from(new Set(els.map(e => e.getAttribute('fill')))));
  126 |     expect(colors.length).toBe(3);
  127 |   }
  128 |
  129 |   await context1.close();
  130 |   await context2.close();
  131 |   await context3.close();
  132 | }); 
```