# Test info

- Name: მთავარი გვერდი იტვირთება და დაფა ჩანს
- Location: C:\Users\lukacode\Desktop\G7\go-app\tests\smoke.spec.mjs:3:1

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/index.html
Call log:
  - navigating to "http://localhost:3000/index.html", waiting until "load"

    at C:\Users\lukacode\Desktop\G7\go-app\tests\smoke.spec.mjs:4:14
```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 |
  3 | test('მთავარი გვერდი იტვირთება და დაფა ჩანს', async ({ page }) => {
> 4 |   await page.goto('http://localhost:3000/index.html');
    |              ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/index.html
  5 |   await expect(page.locator('#board')).toBeVisible();
  6 | }); 
```