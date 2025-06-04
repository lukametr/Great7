import { test, expect } from '@playwright/test';

test('მთავარი გვერდი იტვირთება და დაფა ჩანს', async ({ page }) => {
  await page.goto('http://localhost:3000/index.html');
  await expect(page.locator('#board')).toBeVisible();
}); 