import { test, expect } from '@playwright/test';

test.describe('parseAIJson', () => {
  let utils;

  test.beforeAll(async () => {
    // Mock global objects that utils.js might expect
    global.window = global.window || {};
    global.document = global.document || {};

    // Dynamically import the module so the globals are present when it executes
    utils = await import('../js/utils.js');
  });

  test('returns null for empty, null, or undefined input', () => {
    expect(utils.parseAIJson(null)).toBeNull();
    expect(utils.parseAIJson(undefined)).toBeNull();
    expect(utils.parseAIJson('')).toBeNull();
  });

  test('returns null when no braces are present', () => {
    expect(utils.parseAIJson('Just some text without json')).toBeNull();
  });

  test('returns null when braces are in wrong order', () => {
    expect(utils.parseAIJson('} {')).toBeNull();
  });

  test('returns null when only one brace is present', () => {
    expect(utils.parseAIJson('{')).toBeNull();
    expect(utils.parseAIJson('}')).toBeNull();
  });

  test('parses a clean JSON string', () => {
    const input = '{"key": "value", "number": 42}';
    expect(utils.parseAIJson(input)).toEqual({ key: 'value', number: 42 });
  });

  test('extracts and parses JSON embedded in text', () => {
    const input = 'Here is the response: {"foo": "bar"}\nHope this helps!';
    expect(utils.parseAIJson(input)).toEqual({ foo: 'bar' });
  });

  test('handles nested braces correctly', () => {
    const input = 'Prefix {"outer": {"inner": "value"}} Suffix';
    expect(utils.parseAIJson(input)).toEqual({ outer: { inner: 'value' } });
  });

  test('returns null for malformed JSON inside braces', () => {
    const input = 'Prefix { "unquoted_key": value, } Suffix';
    expect(utils.parseAIJson(input)).toBeNull();
  });

  test('returns null if start brace and end brace are same index', () => {
    expect(utils.parseAIJson('{')).toBeNull();
  });

  test('handles empty JSON object string', () => {
    expect(utils.parseAIJson('{}')).toEqual({});
  });
});
