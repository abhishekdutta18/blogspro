import { test, expect } from '@playwright/test';

// ── Homepage ──────────────────────────────────────────────────────────────────

test.describe('Homepage', () => {
  test('loads with correct title', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/BlogsPro/i);
  });

  test('hero section is visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero h1')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.hero .btn-primary')).toBeVisible({ timeout: 15_000 });
  });

  test('navigation renders with brand and links', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav .nav-brand')).toHaveText('BlogsPro.');
    await expect(page.locator('nav a[href="#posts"]')).toBeVisible();
    await expect(page.locator('nav a[href="#about"]')).toBeVisible();
  });

  test('articles section has filter chips and search input', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#posts')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.filter-chip').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#postSearch')).toBeVisible({ timeout: 15_000 });
  });

  test('newsletter section renders with email input', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#newsletter')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#emailInput')).toBeVisible({ timeout: 20_000 });
  });
});

// ── Filter interaction ────────────────────────────────────────────────────────

test.describe('Filter chips', () => {
  test('no ReferenceError when clicking a filter after module loads', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // filterByCategory is registered at module parse-time (top of init.js).
    // Wait up to 15s for the <script type="module"> to execute.
    await page.waitForFunction(
      () => typeof window.filterByCategory === 'function',
      { timeout: 15_000 }
    ).catch(() => {
      // If it never appears, the test will still validate the absence of errors
      // and the chip click below will surface the real failure.
    });

    // If filterByCategory is available, click a chip; otherwise skip the click.
    const hasFilter = await page.evaluate(() => typeof window.filterByCategory === 'function');
    if (hasFilter) {
      await page.locator('.filter-chip', { hasText: 'Fintech' }).click();
    }

    const filterErrors = jsErrors.filter(msg =>
      msg.includes('filterByCategory') || msg.includes('handleSearch') || msg.includes('renderPosts')
    );
    expect(filterErrors).toHaveLength(0);

    // Hard assert that the function must be present (fail clearly if missing)
    expect(hasFilter, 'window.filterByCategory must be registered by init.js').toBe(true);
  });

  test('active chip updates after click', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(
      () => typeof window.filterByCategory === 'function',
      { timeout: 15_000 }
    );

    const fintechChip = page.locator('.filter-chip', { hasText: 'Fintech' });
    await fintechChip.click();
    await expect(fintechChip).toHaveClass(/active/);
  });
});

// ── Auth pages ────────────────────────────────────────────────────────────────

test.describe('Auth pages', () => {
  test('login page returns 200', async ({ page }) => {
    const response = await page.goto('/login.html', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/Login|BlogsPro/i);
  });

  test('register page returns 200', async ({ page }) => {
    const response = await page.goto('/register.html', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(400);
  });
});

// ── Mobile viewport ───────────────────────────────────────────────────────────

test.describe('Mobile viewport', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger menu button is visible', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#navHamburger')).toBeVisible({ timeout: 15_000 });
  });

  test('nav links hidden before hamburger tap', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#navLinksMenu')).not.toHaveClass(/mobile-open/, { timeout: 10_000 });
  });
});
