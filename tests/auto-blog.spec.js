import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('auto-blog fillEditor', () => {

  test('fallback behavior: returns safely when editor element is missing', async ({ page }) => {
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });

    const testModuleContent = `
      import { initAutoBlog } from '/js/auto-blog.js';
      window.initAutoBlog = initAutoBlog;
    `;

    await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.id = 'autoBlogBtn';
      btn.innerText = 'Generate';
      document.body.appendChild(btn);

      const topicInput = document.createElement('input');
      topicInput.id = 'autoBlogTopic';
      topicInput.value = 'Test Topic';
      document.body.appendChild(topicInput);

      const titleInput = document.createElement('input');
      titleInput.id = 'postTitle';
      document.body.appendChild(titleInput);

      // Editor is intentionally missing!
    });

    await page.route('**/ai-core.js', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `export async function callAI() { return "Test Generated Content"; }`
      });
    });

    await page.route('**/services/ai-image-service.js', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `export async function generateImage() { return "http://example.com/image.png"; }`
      });
    });

    await page.route('**/config.js', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          export function showToast() {}
          export function sanitize(c) { return c; }
          export function validateImageUrl(url) { return url; }
          export class RateLimiter { canRequest() { return true; } }
        `
      });
    });

    await page.addScriptTag({ content: testModuleContent, type: 'module' });
    await page.waitForFunction(() => typeof window.initAutoBlog === 'function');

    const result = await page.evaluate(async () => {
      try {
        window.initAutoBlog();
        document.getElementById('autoBlogBtn').click();

        await new Promise(r => setTimeout(r, 100));

        return { errorOccurred: false };
      } catch (err) {
        return { errorOccurred: true, errorMessage: err.message };
      }
    });

    expect(result.errorOccurred).toBe(false);
  });

  test('normal behavior: populates inputs when elements exist', async ({ page }) => {
    await page.goto('/login.html', { waitUntil: 'domcontentloaded' });

    await page.route('**/ai-core.js', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `export async function callAI() { return "Test Generated Content"; }`
      });
    });

    await page.route('**/services/ai-image-service.js', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `export async function generateImage() { return "http://example.com/image.png"; }`
      });
    });

    await page.route('**/config.js', async route => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `
          export function showToast() {}
          export function sanitize(c) { return c; }
          export function validateImageUrl(url) { return url; }
          export class RateLimiter { canRequest() { return true; } }
        `
      });
    });

    await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.id = 'autoBlogBtn';
      btn.innerText = 'Generate';
      document.body.appendChild(btn);

      const topicInput = document.createElement('input');
      topicInput.id = 'autoBlogTopic';
      topicInput.value = 'Test Topic';
      document.body.appendChild(topicInput);

      const titleInput = document.createElement('input');
      titleInput.id = 'postTitle';
      document.body.appendChild(titleInput);

      const editor = document.createElement('textarea');
      editor.id = 'editor';
      document.body.appendChild(editor);
    });

    const testModuleContent = `
      import { initAutoBlog } from '/js/auto-blog.js';
      window.initAutoBlog = initAutoBlog;
    `;

    await page.addScriptTag({ content: testModuleContent, type: 'module' });
    await page.waitForFunction(() => typeof window.initAutoBlog === 'function');

    const result = await page.evaluate(async () => {
      try {
        window.initAutoBlog();
        document.getElementById('autoBlogBtn').click();

        await new Promise(r => setTimeout(r, 100));

        const titleValue = document.getElementById('postTitle').value;
        const editorValue = document.getElementById('editor').value;

        return { errorOccurred: false, titleValue, editorValue };
      } catch (err) {
        return { errorOccurred: true, errorMessage: err.message };
      }
    });

    expect(result.errorOccurred).toBe(false);
    expect(result.titleValue).toBe('Test Generated Content');
    expect(result.editorValue).toContain('Test Generated Content');
    expect(result.editorValue).toContain('http://example.com/image.png');
  });
});
