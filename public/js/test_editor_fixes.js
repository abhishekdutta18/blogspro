// Mock browser globals since we're in Node
global.window = {};
global.DOMPurify = {
  sanitize: (html, options) => {
    console.log('DOMPurify.sanitize called with tags:', options.ALLOWED_TAGS);
    return html; 
  }
};

import { sanitize } from './utils.js';

function testSanitize() {
  const html = '<table><tr><td style="color:red;">Test</td></tr></table>';
  const result = sanitize(html);
  console.log('Sanitize result:', result);
}

testSanitize();
