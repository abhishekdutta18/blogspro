export interface MarketAsset {
  symbol: string;
  name: string;
  price: string;
  change: string;
  isPositive: boolean;
  category: 'indices' | 'stocks' | 'bonds' | 'forex' | 'commodities' | 'crypto';
  high: string;
  low: string;
  open: string;
}

export const marketAssets: MarketAsset[] = [
  // Indices
  { symbol: 'NSE:NIFTY', name: 'NIFTY 50', price: '25,144.30', change: '+0.42%', isPositive: true, category: 'indices', high: '25,246.35', low: '25,054.40', open: '25,209.85' },
  { symbol: 'BSE:SENSEX', name: 'SENSEX', price: '81,592.45', change: '+0.38%', isPositive: true, category: 'indices', high: '81,879.50', low: '81,288.75', open: '81,592.45' },
  { symbol: 'NSE:BANKNIFTY', name: 'BANK NIFTY', price: '61,034.10', change: '+0.65%', isPositive: true, category: 'indices', high: '61,300.55', low: '60,780.55', open: '61,300.55' },
  { symbol: 'SPX', name: 'S&P 500', price: '7,561.67', change: '-0.40%', isPositive: false, category: 'indices', high: '7,621.78', low: '7,499.40', open: '7,561.67' },
  { symbol: 'IXIC', name: 'Nasdaq Composite', price: '25,136.27', change: '-0.91%', isPositive: false, category: 'indices', high: '25,423.09', low: '24,872.41', open: '25,136.27' },
  { symbol: 'NI225', name: 'Nikkei 225', price: '61,142.35', change: '+0.53%', isPositive: true, category: 'indices', high: '61,902.50', low: '61,082.23', open: '61,142.35' },
  
  // Forex
  { symbol: 'USDINR', name: 'USD / INR', price: '86.42', change: '+0.08%', isPositive: true, category: 'forex', high: '86.58', low: '86.28', open: '86.35' },
  { symbol: 'EURINR', name: 'EUR / INR', price: '93.88', change: '-0.11%', isPositive: false, category: 'forex', high: '94.15', low: '93.72', open: '94.00' },
  { symbol: 'GBPINR', name: 'GBP / INR', price: '110.42', change: '-0.09%', isPositive: false, category: 'forex', high: '110.68', low: '110.24', open: '110.52' },
  { symbol: 'EURUSD', name: 'EUR / USD', price: '1.0921', change: '+0.14%', isPositive: true, category: 'forex', high: '1.0945', low: '1.0880', open: '1.0895' },
  { symbol: 'DXY', name: 'US Dollar Index', price: '103.84', change: '-0.12%', isPositive: false, category: 'forex', high: '104.10', low: '103.72', open: '103.98' },
  
  // Commodities
  { symbol: 'GOLD', name: 'Gold (Oz)', price: '$3,883.90', change: '+0.19%', isPositive: true, category: 'commodities', high: '$3,892.40', low: '$3,865.10', open: '$3,876.50' },
  { symbol: 'USOIL', name: 'WTI Crude Oil', price: '$88.91', change: '+0.25%', isPositive: true, category: 'commodities', high: '$89.45', low: '$87.80', open: '$88.69' },
  { symbol: 'COPPER', name: 'Copper', price: '$6.09', change: '-1.71%', isPositive: false, category: 'commodities', high: '$6.24', low: '$6.05', open: '$6.09' },
  
  // Bonds / Yields
  { symbol: 'US10Y', name: 'US 10-Year Yield', price: '4.42%', change: '+0.03%', isPositive: true, category: 'bonds', high: '4.45%', low: '4.39%', open: '4.41%' },
  
  // Crypto
  { symbol: 'BTCUSDT', name: 'Bitcoin (BTC)', price: '$65,220', change: '-4.90%', isPositive: false, category: 'crypto', high: '$68,540', low: '$64,800', open: '$68,426' },
  { symbol: 'ETHUSDT', name: 'Ethereum (ETH)', price: '$1,820.46', change: '-5.41%', isPositive: false, category: 'crypto', high: '$1,930.00', low: '$1,805.20', open: '$1,924.50' }
];

/**
 * Date the figures in this file were captured. These are static snapshot values,
 * not live prices — the UI must say so.
 */
export const marketsAsOf = '2026-11-14';
