import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Users - loadUsers', () => {
  // Common setup function for testbench
  async function setupTestbench(page) {
    await page.route('https://blogspro.in/testbench.html', async route => {
      const html = `
        <!DOCTYPE html>
        <html>
        <head><title>Testbench</title></head>
        <body>
            <table id="usersTable"><tbody id="usersTableBody"></tbody></table>
            <script type="module">
                import { loadUsers } from '/js/users.js';
                window.loadUsers = loadUsers;
                window.__READY = true;
            </script>
        </body>
        </html>
      `;
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
    });

    await page.route('https://blogspro.in/js/**', async route => {
      const filePath = path.resolve('.' + new URL(route.request().url()).pathname);
      if (fs.existsSync(filePath)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/javascript',
          body: fs.readFileSync(filePath)
        });
      } else {
        await route.continue();
      }
    });
  }

  test('renders empty state correctly when api returns no users', async ({ page }) => {
    await setupTestbench(page);
    await page.route('**/api/data/users*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto('https://blogspro.in/testbench.html');
    await page.waitForFunction(() => window.__READY === true, { timeout: 15000 });

    await page.evaluate(() => window.loadUsers());
    const tbody = page.locator('#usersTableBody');
    await expect(tbody).toContainText('No other users yet.');
  });
});
