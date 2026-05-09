import { test, expect } from '@playwright/test';

// In order to test utils.js in node context, we need to mock window since it uses window.slugify
test.describe('stripTags utility', () => {
  let stripTags;

  test.beforeAll(async () => {
    // Mock globals required by utils.js
    global.window = {};
    global.document = {
      createElement: () => ({ style: {} }),
      body: { appendChild: () => {} },
      getElementById: () => null
    };

    const utils = await import('../js/utils.js');
    stripTags = utils.stripTags;
  });

  test('strips basic HTML tags', () => {
    expect(stripTags('<p>test</p>')).toBe('test');
    expect(stripTags('<div>hello</div>')).toBe('hello');
    expect(stripTags('<span>world</span>')).toBe('world');
  });

  test('handles null, undefined, and empty string', () => {
    expect(stripTags(null)).toBe('');
    expect(stripTags(undefined)).toBe('');
    expect(stripTags('')).toBe('');
    expect(stripTags('   ')).toBe('');
  });

  test('strips nested HTML tags', () => {
    expect(stripTags('<div><p><strong>test</strong></p></div>')).toBe('test');
    expect(stripTags('<ul><li>Item 1</li><li>Item 2</li></ul>')).toBe('Item 1Item 2');
  });

  test('strips tags with attributes', () => {
    expect(stripTags('<a href="https://example.com" class="link">link text</a>')).toBe('link text');
    expect(stripTags('<img src="image.jpg" alt="an image" />')).toBe('');
    expect(stripTags('<div data-test="true" style="color: red;">styled</div>')).toBe('styled');
  });

  test('preserves text outside and between tags', () => {
    expect(stripTags('Before <p>Inside</p> After')).toBe('Before Inside After');
    expect(stripTags('Hello <b>world</b>! How are <i>you</i>?')).toBe('Hello world! How are you?');
  });

  test('handles malformed and unclosed tags', () => {
    // Current implementation uses regex /<[^>]*>/g
    expect(stripTags('<p>test')).toBe('test');
    expect(stripTags('test</p>')).toBe('test');
    expect(stripTags('<div class="unclosed>content</div>')).toBe('content'); // <div class="unclosed> gets stripped
  });

  test('handles tags with multiline attributes', () => {
    const html = `<div
      class="test"
      data-id="123"
    >
      content
    </div>`;
    expect(stripTags(html)).toBe('content');
  });

  test('trims whitespace but preserves internal spacing', () => {
    expect(stripTags('  <p>  test  </p>  ')).toBe('test');
    expect(stripTags('\n\n<p>test\nwith\nnewlines</p>\n\n')).toBe('test\nwith\nnewlines');
    expect(stripTags('  multiple   spaces  ')).toBe('multiple   spaces');
  });

  test('handles script and style tags (edge case: keeps content)', () => {
    // Note: stripTags only removes tags, not content of script/style tags.
    // If the behavior needs to change, the test will fail and catch it.
    expect(stripTags('<script>alert("test");</script>')).toBe('alert("test");');
    expect(stripTags('<style>body { color: red; }</style>')).toBe('body { color: red; }');
  });
});
