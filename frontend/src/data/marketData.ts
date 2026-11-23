export interface MacroEvent {
  country: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  date: string;
  actual: string;
  forecast: string;
  previous: string;
  analystView: string;
}

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

export const macroRadar = {
  policyRegime: 'Balanced / Accommodative Neutral',
  rbiProbability: {
    hold: 64,
    cut: 26,
    hike: 10
  },
  inrStress: '+0.8% (Depreciation Bias)',
  sectorSensitivity: [
    { sector: 'Banks & NBFCs', sensitivity: 2.0, trend: 'Rates Sensitive' },
    { sector: 'IT Services', sensitivity: 1.8, trend: 'Currency Direct' },
    { sector: 'Automotive', sensitivity: 1.4, trend: 'Credit Expansion' },
    { sector: 'Metals & Mining', sensitivity: 1.6, trend: 'Global Growth' },
    { sector: 'FMCG / Staples', sensitivity: 0.9, trend: 'Defensive Value' }
  ],
  rbiStance: 'Reserve Bank of India maintains neutral liquidity operations while closely tracking food inflation and global policy divergence.',
  sebiStance: 'Securities and Exchange Board of India continues market surveillance across derivative open-interest concentration and clearing margins.'
};

export const highImpactEvents: MacroEvent[] = [
  {
    country: 'IND',
    impact: 'HIGH',
    title: 'India CPI Inflation y/y',
    date: 'Dec 12, 2026',
    actual: '4.70%',
    forecast: '5.10%',
    previous: '5.40%',
    analystView: 'Softening headline print expands RBI room for monetary ease while preserving front-end bond yield stability.'
  },
  {
    country: 'IND',
    impact: 'HIGH',
    title: 'RBI Monetary Policy Committee Rate',
    date: 'Dec 08, 2026',
    actual: '6.50%',
    forecast: '6.50%',
    previous: '6.50%',
    analystView: 'MPC vote split remains the focal transmission signal for short-end sovereign yields and bank margin repricing.'
  },
  {
    country: 'USD',
    impact: 'HIGH',
    title: 'FOMC Federal Funds Rate Decision',
    date: 'Dec 18, 2026',
    actual: '5.25%',
    forecast: '5.25%',
    previous: '5.50%',
    analystView: 'Dollar curve realignment hinges on dot-plot dispersion and balance-sheet runoff pacing.'
  },
  {
    country: 'IND',
    impact: 'HIGH',
    title: 'India Industrial Production (IIP) y/y',
    date: 'Dec 12, 2026',
    actual: '5.50%',
    forecast: '4.20%',
    previous: '3.90%',
    analystView: 'Capital goods resurgence signals sustained private sector capex recovery across core manufacturing verticals.'
  },
  {
    country: 'EUR',
    impact: 'HIGH',
    title: 'ECB Main Refinancing Rate',
    date: 'Dec 14, 2026',
    actual: '4.25%',
    forecast: '4.25%',
    previous: '4.50%',
    analystView: 'Disinflation trajectory supports quarterly easing steps while Eurozone services momentum stabilizes.'
  },
  {
    country: 'IND',
    impact: 'MEDIUM',
    title: 'India Services PMI (HSBC)',
    date: 'Dec 05, 2026',
    actual: '58.4',
    forecast: '57.2',
    previous: '57.0',
    analystView: 'Strong domestic demand and external order intake keep services expansion robust well above 50 threshold.'
  }
];

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
