/**
 * helpers.mjs — fake fetch responses shared by the tests. No network is ever touched.
 */

export const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

export const completion = text => jsonResponse(200, { choices: [{ message: { content: text } }] });

export const provider = (name, extra = {}) => ({ name, baseUrl: `https://${name}.test/v1`, model: `${name}-model`, apiKey: 'test-key', ...extra });

/**
 * A fetch stub that answers by host: handlers[host] is a function returning a Response
 * (or throwing). Calls are recorded in `calls`.
 */
export function fakeFetch(handlers) {
  const calls = [];
  const impl = async (url, init) => {
    const host = new URL(url).host;
    calls.push({ host, url, init });
    const handler = handlers[host];
    if (!handler) throw new Error(`unexpected fetch to ${host}`);
    return handler(url, init, calls.length);
  };
  return { impl, calls };
}
