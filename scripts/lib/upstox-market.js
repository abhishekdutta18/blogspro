/**
 * upstox-market.js
 * Read-only Upstox market data client using the official SDK.
 * Intentionally exposes only MarketQuoteV3Api, HistoryV3Api, and
 * MarketHolidaysAndTimingsApi — no order, portfolio, or user APIs.
 */

const UpstoxClient = require('upstox-js-sdk');

/**
 * @param {string} accessToken - Upstox OAuth2 access token
 * @returns {{ quotes: object, history: object, marketInfo: object }}
 */
function createMarketClient(accessToken) {
  const client = new UpstoxClient.ApiClient();
  client.authentications['OAUTH2'].accessToken = accessToken;

  return {
    quotes:     new UpstoxClient.MarketQuoteV3Api(client),
    history:    new UpstoxClient.HistoryV3Api(client),
    marketInfo: new UpstoxClient.MarketHolidaysAndTimingsApi(client),
  };
}

/**
 * Get Last Traded Price for one or more instruments.
 * @param {object} quotesApi
 * @param {string} instrumentKeys  e.g. "NSE_INDEX|Nifty 50,NSE_EQ|RELIANCE"
 */
function getLtp(quotesApi, instrumentKeys) {
  return new Promise((resolve, reject) => {
    quotesApi.getLtp(instrumentKeys, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * Get OHLC data for one or more instruments.
 * @param {object} quotesApi
 * @param {string} instrumentKeys
 * @param {string} interval  '1d' | '1w' | '1month'
 */
function getOhlc(quotesApi, instrumentKeys, interval = '1d') {
  return new Promise((resolve, reject) => {
    quotesApi.getMarketQuoteOHLC(instrumentKeys, interval, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * Get historical candle data.
 * @param {object} historyApi
 * @param {string} instrumentKey  e.g. "NSE_INDEX|Nifty 50"
 * @param {string} interval       '1minute' | '30minute' | 'day' | 'week' | 'month'
 * @param {string} toDate         'YYYY-MM-DD'
 * @param {string} fromDate       'YYYY-MM-DD'
 */
function getHistoricalCandles(historyApi, instrumentKey, interval, toDate, fromDate) {
  return new Promise((resolve, reject) => {
    historyApi.getHistoricalCandleData(instrumentKey, interval, toDate, fromDate, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * Get intraday candle data.
 * @param {object} historyApi
 * @param {string} instrumentKey
 * @param {string} interval  '1minute' | '30minute'
 */
function getIntradayCandles(historyApi, instrumentKey, interval = '30minute') {
  return new Promise((resolve, reject) => {
    historyApi.getIntraDayCandleData(instrumentKey, interval, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * Get current market status for an exchange.
 * @param {object} marketInfoApi
 * @param {string} exchange  'NSE' | 'BSE' | 'MCX'
 */
function getMarketStatus(marketInfoApi, exchange = 'NSE') {
  return new Promise((resolve, reject) => {
    marketInfoApi.getMarketStatus(exchange, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

/**
 * Get market holidays.
 * @param {object} marketInfoApi
 * @param {string} type  'trading' | 'settlement'
 */
function getHolidays(marketInfoApi, type = 'trading') {
  return new Promise((resolve, reject) => {
    marketInfoApi.getHolidays(type, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
}

module.exports = {
  createMarketClient,
  getLtp,
  getOhlc,
  getHistoricalCandles,
  getIntradayCandles,
  getMarketStatus,
  getHolidays,
};
