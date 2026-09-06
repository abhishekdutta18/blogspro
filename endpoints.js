// BlogsPro — Root Endpoints Proxy
// Re-exports all endpoints from js/endpoints.js to prevent 404s for any clients
// or cached scripts requesting /endpoints.js from root.

export * from './js/endpoints.js';
export { ENDPOINTS } from './js/endpoints.js';
