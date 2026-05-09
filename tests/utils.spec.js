import { test, expect } from '@playwright/test';

// Mock browser globals required by utils.js when running in Node context
if (typeof global.window === 'undefined') {
  global.window = {
    Sentry: undefined,
    slugify: undefined
  };
}
if (typeof global.document === 'undefined') {
  global.document = {
    createElement: () => ({ style: {} }),
    body: { appendChild: () => {} },
    getElementById: () => null
  };
}

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
});

test.describe('RateLimiter', () => {
  let RateLimiter;

  test.beforeAll(async () => {
    const utils = await import('../js/utils.js');
    RateLimiter = utils.RateLimiter;
  });

  test('canRequest allows first request', () => {
    const limiter = new RateLimiter(1000);
    expect(limiter.canRequest()).toBe(true);
    expect(limiter.isWaiting).toBe(false);
  });

  test('canRequest blocks subsequent requests within interval', () => {
    const limiter = new RateLimiter(1000);
    expect(limiter.canRequest()).toBe(true);
    expect(limiter.canRequest()).toBe(false);
    expect(limiter.isWaiting).toBe(true);
  });

  test('canRequest allows requests after interval using mock time', () => {
    const limiter = new RateLimiter(1000);
    const originalNow = Date.now;
    let currentTime = 10000;
    global.Date.now = () => currentTime;

    try {
      expect(limiter.canRequest()).toBe(true);
      currentTime = 10500;
      expect(limiter.canRequest()).toBe(false);
      currentTime = 11000;
      expect(limiter.canRequest()).toBe(true);
    } finally {
      global.Date.now = originalNow;
    }
  });
});

test.describe('cleanEditorHTML', () => {
  let cleanEditorHTML;

  test.beforeAll(async () => {
    const utils = await import('../js/utils.js');
    cleanEditorHTML = utils.cleanEditorHTML;
  });

  test('returns empty string for falsy inputs', () => {
    expect(cleanEditorHTML(null)).toBe('');
    expect(cleanEditorHTML(undefined)).toBe('');
    expect(cleanEditorHTML('')).toBe('');
  });

  test('removes script tags and their contents', () => {
    const input = '<div>Hello</div><script>alert("hack");</script><p>World</p>';
    expect(cleanEditorHTML(input)).toBe('<div>Hello</div><p>World</p>');
  });

  test('removes empty paragraphs', () => {
    const input = '<p>Content</p><p></p><p>  </p><p>More</p>';
    expect(cleanEditorHTML(input)).toBe('<p>Content</p><p>More</p>');
  });
});

test.describe('parseAIJson', () => {
  let parseAIJson;

  test.beforeAll(async () => {
    const utils = await import('../js/utils.js');
    parseAIJson = utils.parseAIJson;
  });

  test('parses a clean JSON string', () => {
    const input = '{\"key\": \"value\", \"number\": 42}';
    expect(parseAIJson(input)).toEqual({ key: 'value', number: 42 });
  });

  test('extracts and parses JSON embedded in text', () => {
    const input = 'Here is the response: {\"foo\": \"bar\"}\\nHope this helps!';
    expect(parseAIJson(input)).toEqual({ foo: 'bar' });
  });

  test('returns null for malformed JSON', () => {
    expect(parseAIJson('not json')).toBeNull();
    expect(parseAIJson('{ malformed }')).toBeNull();
  });
});

test.describe('validateImageUrl', () => {
  let validateImageUrl;

  test.beforeAll(async () => {
    const utils = await import('../js/utils.js');
    validateImageUrl = utils.validateImageUrl;
  });

  test('allows safe domains', () => {
    expect(validateImageUrl('https://cloudinary.com/image.jpg')).toBe('https://cloudinary.com/image.jpg');
    expect(validateImageUrl('https://images.unsplash.com/photo')).toBe('https://images.unsplash.com/photo');
  });

  test('returns null for unsafe domains', () => {
    expect(validateImageUrl('https://evil.com/image.jpg')).toBeNull();
  });

  test('allows data URLs for images', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(validateImageUrl(dataUrl)).toBe(dataUrl);
  });
});

test.describe('stripTags utility', () => {
  let stripTags;

  test.beforeAll(async () => {
    const utils = await import('../js/utils.js');
    stripTags = utils.stripTags;
  });

  test('strips basic HTML tags', () => {
    expect(stripTags('<p>test</p>')).toBe('test');
    expect(stripTags('<div>hello</div>')).toBe('hello');
  });

  test('handles null, undefined, and empty string', () => {
    expect(stripTags(null)).toBe('');
    expect(stripTags(undefined)).toBe('');
    expect(stripTags('')).toBe('');
  });
});
