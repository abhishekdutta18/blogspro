// utils.js
export function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}
