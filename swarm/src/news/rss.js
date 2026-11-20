/**
 * rss.js — a small RSS 2.0 item parser. It reads only title, link, description and
 * pubDate, which is all the swarm needs, so it avoids an XML dependency on the VPS.
 * Feed content is untrusted: everything comes out as plain, length-capped text.
 */

const MAX_TITLE = 300;
const MAX_SUMMARY = 500;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Strips CDATA, tags and entities, then collapses whitespace. */
export function toPlainText(raw, maxLength) {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const text = decodeEntities(unwrapped.replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ');
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

/** Parses an RSS date; appends `defaultTz` when the feed omits a zone. Returns ms or NaN. */
export function parseDate(raw, defaultTz) {
  const text = raw.trim();
  if (!text) return NaN;
  const hasZone = /([+-]\d{4}|GMT|UTC|Z|[ECMP][SD]T)$/i.test(text);
  return Date.parse(hasZone || !defaultTz ? text : `${text} ${defaultTz}`);
}

const isHttpUrl = value => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/**
 * @param {string} xml
 * @param {{defaultTz?: string}} [options]
 * @returns {{title: string, url: string, summary: string, publishedAt: number}[]}
 */
export function parseRssItems(xml, { defaultTz } = {}) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return blocks
    .map(block => ({
      title: toPlainText(tag(block, 'title'), MAX_TITLE),
      url: toPlainText(tag(block, 'link'), 2000),
      summary: toPlainText(tag(block, 'description'), MAX_SUMMARY),
      publishedAt: parseDate(toPlainText(tag(block, 'pubDate'), 100), defaultTz)
    }))
    .filter(item => item.title && isHttpUrl(item.url));
}
