import { test, expect } from '@playwright/test';

// Mock browser globals required by utils.js
if (typeof global.window === 'undefined') {
  global.window = global;
}
if (typeof global.document === 'undefined') {
  global.document = { createElement: () => ({}) };
}

test.describe('RateLimiter', () => {
  let RateLimiter;

  test.beforeAll(async () => {
    const utils = await import('../js/utils.js');
    RateLimiter = utils.RateLimiter;
  });

  test.afterEach(() => {
    // Restore Date.now if it was mocked
    if (global.Date.now.mockRestore) {
      global.Date.now.mockRestore();
    }
  });

  test('canRequest allows first request', () => {
    const limiter = new RateLimiter(1000);
    expect(limiter.canRequest()).toBe(true);
    expect(limiter.isWaiting).toBe(false);
  });

  test('canRequest blocks subsequent requests within interval', () => {
    const limiter = new RateLimiter(1000);

    // First request should pass
    expect(limiter.canRequest()).toBe(true);

    // Second request immediately after should fail
    expect(limiter.canRequest()).toBe(false);
    expect(limiter.isWaiting).toBe(true);
  });

  test('canRequest allows requests after interval using mock time', () => {
    const limiter = new RateLimiter(1000);

    // We need to mock Date.now() to test time jumps without waiting
    const originalNow = Date.now;
    let currentTime = 10000;
    global.Date.now = () => currentTime;

    try {
      // First request at t=10000
      expect(limiter.canRequest()).toBe(true);

      // Request at t=10500 (within interval) should fail
      currentTime = 10500;
      expect(limiter.canRequest()).toBe(false);

      // Request at t=11000 (after 1000ms interval) should pass
      currentTime = 11000;
      expect(limiter.canRequest()).toBe(true);
      expect(limiter.isWaiting).toBe(false);
    } finally {
      global.Date.now = originalNow;
    }
  });

  test('getWaitTime calculates correct remaining time', () => {
    const limiter = new RateLimiter(1000);

    const originalNow = Date.now;
    let currentTime = 10000;
    global.Date.now = () => currentTime;

    try {
      // Make a request
      limiter.canRequest(); // t=10000

      // Advance 400ms
      currentTime = 10400;

      // Wait time should be 1000 - 400 = 600
      expect(limiter.getWaitTime()).toBe(600);

      // Advance past interval
      currentTime = 11500;

      // Wait time shouldn't be negative
      expect(limiter.getWaitTime()).toBe(0);
    } finally {
      global.Date.now = originalNow;
    }
  });

  test('reset clears internal state', () => {
    const limiter = new RateLimiter(1000);

    const originalNow = Date.now;
    let currentTime = 10000;
    global.Date.now = () => currentTime;

    try {
      // Make a request to set state
      limiter.canRequest();

      // Reset immediately
      limiter.reset();

      expect(limiter.lastRequestTime).toBe(0);
      expect(limiter.isWaiting).toBe(false);

      // Should be able to request again immediately
      expect(limiter.canRequest()).toBe(true);
    } finally {
      global.Date.now = originalNow;
    }
  });
});
