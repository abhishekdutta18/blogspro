import { test, expect } from '@playwright/test';

// Before importing utils.js, mock the window object to avoid ReferenceError
// Playwright runs tests in Node.js context, not a browser context, when we import directly
const mockWindow = {
  Sentry: undefined,
  slugify: undefined
};

// Also mock document if needed by other functions in utils.js
const mockDocument = {
  getElementById: () => null,
  createElement: () => ({ style: {} }),
  body: { appendChild: () => {} }
};

test.describe('cleanEditorHTML', () => {
  let utils;

  test.beforeAll(async () => {
    // Dynamically set global before importing
    global.window = mockWindow;
    global.document = mockDocument;

    utils = await import('../js/utils.js');
  });

  test('returns empty string for falsy inputs', () => {
    expect(utils.cleanEditorHTML(null)).toBe('');
    expect(utils.cleanEditorHTML(undefined)).toBe('');
    expect(utils.cleanEditorHTML('')).toBe('');
  });

  test('removes script tags and their contents', () => {
    const input = '<div>Hello</div><script>alert("hack");</script><p>World</p>';
    const expected = '<div>Hello</div><p>World</p>';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('removes script tags with attributes', () => {
    const input = '<script src="evil.js"></script><p>Safe</p>';
    const expected = '<p>Safe</p>';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('removes multiple script tags', () => {
    const input = '<script>a()</script>Test<script>b()</script>';
    const expected = 'Test';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('removes empty paragraphs', () => {
    const input = '<p>Content</p><p></p><p>  </p><p>\n</p><p>More</p>';
    const expected = '<p>Content</p><p>More</p>';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('collapses multiple newlines into a single newline', () => {
    const input = 'Line 1\n\n\nLine 2\n    \nLine 3';
    const expected = 'Line 1\nLine 2\nLine 3';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('trims leading and trailing whitespace', () => {
    const input = '   <p>Trim me</p>   ';
    const expected = '<p>Trim me</p>';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('handles combination of operations', () => {
    const input = `<p>Start</p>\n<script>doEvil()</script>\n<p>  </p>\n\n<p>End</p>`;
    const expected = '<p>Start</p>\n<p>End</p>';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('leaves valid HTML structure intact', () => {
    const input = `
      <h1>Title</h1>
      <p>Intro</p>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
    `.trim();
    const expected = `
      <h1>Title</h1>
      <p>Intro</p>
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
    `.trim();
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });

  test('is case insensitive for script tags', () => {
    const input = '<SCRIPT>alert("xss")</SCRIPT><p>Safe</p>';
    const expected = '<p>Safe</p>';
    expect(utils.cleanEditorHTML(input)).toBe(expected);
  });
});
