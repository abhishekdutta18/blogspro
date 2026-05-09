import { test, expect } from '@playwright/test';

test.describe('utils.js sanitize function', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('fallback: removes script tags', async ({ page }) => {
    const sanitized = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      const originalDOMPurify = window.DOMPurify;
      delete window.DOMPurify;
      const result = sanitize('<script>alert("xss")</script><p>Safe</p>');
      window.DOMPurify = originalDOMPurify;
      return result;
    });
    expect(sanitized).toBe('<p>Safe</p>');
  });

  test('fallback: removes other dangerous tags', async ({ page }) => {
    const sanitized = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      delete window.DOMPurify;
      return sanitize('<style>body{color:red}</style><iframe></iframe><object></object><embed><form></form><div>Safe</div>');
    });
    expect(sanitized).toBe('<div>Safe</div>');
  });

  test('fallback: removes event handlers', async ({ page }) => {
    const sanitized = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      delete window.DOMPurify;
      return sanitize('<div onclick="alert(1)" onmouseover="evil()" class="safe">Content</div>');
    });
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onmouseover');
    expect(sanitized).toContain('class="safe"');
    expect(sanitized).toContain('Content');
  });

  test('fallback: blocks javascript/data/vbscript URLs', async ({ page }) => {
    const results = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      delete window.DOMPurify;
      return {
        simple: sanitize('<a href="javascript:alert(1)">Link</a>'),
        obfuscated: sanitize('<a href="  \n  javascript:alert(1)">Link</a>'),
        data: sanitize('<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">'),
        vbscript: sanitize('<a href="vbscript:msgbox(1)">Link</a>')
      };
    });
    expect(results.simple).toContain('href="#"');
    expect(results.obfuscated).toContain('href="#"');
    expect(results.data).toContain('src="#"');
    expect(results.vbscript).toContain('href="#"');
  });

  test('fallback: handles empty or null input', async ({ page }) => {
    const sanitized = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      delete window.DOMPurify;
      return {
        empty: sanitize(''),
        nullInput: sanitize(null),
        undefinedInput: sanitize(undefined)
      };
    });
    expect(sanitized.empty).toBe('');
    expect(sanitized.nullInput).toBe('');
    expect(sanitized.undefinedInput).toBe('');
  });

  test('DOMPurify: uses DOMPurify if available', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      window.DOMPurify = {
        sanitize: (html, config) => {
          return `PURIFIED:${html}`;
        }
      };
      return sanitize('<p>Input</p>');
    });
    expect(result).toBe('PURIFIED:<p>Input</p>');
  });

  test('DOMPurify: passes correct configuration', async ({ page }) => {
    const config = await page.evaluate(async () => {
      const { sanitize } = await import('/js/utils.js');
      let capturedConfig = null;
      window.DOMPurify = {
        sanitize: (html, cfg) => {
          capturedConfig = cfg;
          return html;
        }
      };
      sanitize('<p>Test</p>');
      return capturedConfig;
    });
    expect(config).toBeDefined();
    expect(config.ALLOWED_TAGS).toContain('p');
    expect(config.ALLOWED_TAGS).toContain('svg');
    expect(config.ALLOWED_ATTR).toContain('href');
    expect(config.ALLOWED_ATTR).toContain('viewBox');
  });
});
