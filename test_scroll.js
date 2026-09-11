const fs = require('fs');

function optimizeScrollEvent(content) {
  return content.replace(
    /window\.addEventListener\('scroll', \s*(?:function\(\)|(\(\)\s*=>))\s*\{([\s\S]*?)\}\);/g,
    (match, arrowFunc, body) => {
      return `  let ticking = false;
  window.addEventListener('scroll', ${arrowFunc || 'function()'} {
    if (!ticking) {
      window.requestAnimationFrame(() => {
${body.replace(/^/gm, '      ')}
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });`;
    }
  );
}

const file = fs.readFileSync('./js/ui-utils.js', 'utf8');
console.log(optimizeScrollEvent(file));
