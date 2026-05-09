import { test, expect } from '@playwright/test';
import { validateImageUrl } from '../js/utils.js';

test.describe('validateImageUrl', () => {
  test('returns null for empty urls', () => {
    expect(validateImageUrl('')).toBeNull();
    expect(validateImageUrl(null)).toBeNull();
    expect(validateImageUrl(undefined)).toBeNull();
  });

  test('returns null for non-https protocols', () => {
    expect(validateImageUrl('http://cloudinary.com/image.jpg')).toBeNull();
    expect(validateImageUrl('ftp://cloudinary.com/image.jpg')).toBeNull();
  });

  test('returns null for invalid urls', () => {
    expect(validateImageUrl('not-a-url')).toBeNull();
  });

  test('allows safe domains', () => {
    expect(validateImageUrl('https://cloudinary.com/image.jpg')).toBe('https://cloudinary.com/image.jpg');
    expect(validateImageUrl('https://subdomain.cloudinary.com/image.jpg')).toBe('https://subdomain.cloudinary.com/image.jpg');
    expect(validateImageUrl('https://images.unsplash.com/photo')).toBe('https://images.unsplash.com/photo');
    expect(validateImageUrl('https://firebasestorage.googleapis.com/v0/b/project/o/image.jpg')).toBe('https://firebasestorage.googleapis.com/v0/b/project/o/image.jpg');
  });

  test('returns null for unsafe domains', () => {
    expect(validateImageUrl('https://evil.com/image.jpg')).toBeNull();
    expect(validateImageUrl('https://notcloudinary.com.evil.com/image.jpg')).toBeNull();
  });

  test('allows data URLs for images', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    expect(validateImageUrl(dataUrl)).toBe(dataUrl);
  });

  test('returns null for non-image data URLs', () => {
    const dataUrl = 'data:text/html;base64,PGh0bWw+PC9odG1sPg==';
    expect(validateImageUrl(dataUrl)).toBeNull();
  });
});
