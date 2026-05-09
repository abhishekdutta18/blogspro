import { test, expect } from '@playwright/test';

test.describe('Users Management', () => {
  test('handles API failure when loading users', async ({ page }) => {
    // Navigate to a minimal test page to isolate loadUsers
    await page.route('/test-users.html', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
          <!DOCTYPE html>
          <html>
            <body>
              <table id="usersTableBody"></table>
              <script type="module">
                import { loadUsers } from './js/users.js';
                // Attach to window so we can trigger it from Playwright
                window.loadUsers = loadUsers;
              </script>
            </body>
          </html>
        `
      });
    });

    // Mock auth so we can access admin features
    await page.route('**/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, user: { role: 'admin' } })
      });
    });

    // We must mock the api call since the real one throws an unhandled promise rejection if not mocked correctly
    await page.route('**/api/data/users*', async route => {
      // Aborting might not trigger the catch block if fetchWithRetry throws something else or we're not waiting
      // Actually `api.data.getAll('users')` translates to `/api/data/users`
      // Let's fulfill with a 500 error instead of aborting to simulate API failure properly
      await route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    // Navigate to the test page using relative URL so it goes to baseURL
    await page.goto('/test-users.html');

    // Call loadUsers and wait for it to complete
    await page.evaluate(async () => {
      // The function exists because of our module script
      if (window.loadUsers) {
        await window.loadUsers();
      }
    });

    // Check if the catch block populated the table with the error message
    const tbody = page.locator('#usersTableBody');
    await expect(tbody).toContainText('Users unavailable. Please retry.');
  });
});
