// main.js
import './post-audit.js';

export function init() {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.dataset.ready = 'true';
  });
}

init();
