import { test, expect } from '@playwright/test';

test.describe('uploadToStorage error paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('handles network error (xhr.onerror)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const mockXhr = {
          open: () => {},
          upload: {},
          send: function() {
            setTimeout(() => this.onerror(), 10);
          }
        };
        return mockXhr;
      };

      try {
        const { uploadToStorage } = await import('./js/images-upload.js');
        await uploadToStorage(new File([""], "test.png"));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cloudinary: network error');
  });

  test('handles timeout error (xhr.ontimeout)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const mockXhr = {
          open: () => {},
          upload: {},
          send: function() {
            setTimeout(() => this.ontimeout(), 10);
          }
        };
        return mockXhr;
      };

      try {
        const { uploadToStorage } = await import('./js/images-upload.js');
        await uploadToStorage(new File([""], "test.png"));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cloudinary: upload timeout');
  });

  test('handles non-200 HTTP status', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const mockXhr = {
          open: () => {},
          upload: {},
          send: function() {
            this.status = 400;
            this.responseText = JSON.stringify({ error: { message: "Bad Request" } });
            setTimeout(() => this.onload(), 10);
          }
        };
        return mockXhr;
      };

      try {
        const { uploadToStorage } = await import('./js/images-upload.js');
        await uploadToStorage(new File([""], "test.png"));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cloudinary: Bad Request');
  });

  test('handles non-200 HTTP status with unparseable response', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const mockXhr = {
          open: () => {},
          upload: {},
          send: function() {
            this.status = 500;
            this.responseText = "Internal Server Error";
            setTimeout(() => this.onload(), 10);
          }
        };
        return mockXhr;
      };

      try {
        const { uploadToStorage } = await import('./js/images-upload.js');
        await uploadToStorage(new File([""], "test.png"));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cloudinary: HTTP 500');
  });

  test('handles 200 HTTP status with missing secure_url', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const mockXhr = {
          open: () => {},
          upload: {},
          send: function() {
            this.status = 200;
            this.responseText = JSON.stringify({ url: "http://example.com/image.png" });
            setTimeout(() => this.onload(), 10);
          }
        };
        return mockXhr;
      };

      try {
        const { uploadToStorage } = await import('./js/images-upload.js');
        await uploadToStorage(new File([""], "test.png"));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cloudinary: no URL');
  });

  test('handles 200 HTTP status with unparseable JSON', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const originalXHR = window.XMLHttpRequest;
      window.XMLHttpRequest = function() {
        const mockXhr = {
          open: () => {},
          upload: {},
          send: function() {
            this.status = 200;
            this.responseText = "NOT JSON";
            setTimeout(() => this.onload(), 10);
          }
        };
        return mockXhr;
      };

      try {
        const { uploadToStorage } = await import('./js/images-upload.js');
        await uploadToStorage(new File([""], "test.png"));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        window.XMLHttpRequest = originalXHR;
      }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Cloudinary: invalid response');
  });
});
