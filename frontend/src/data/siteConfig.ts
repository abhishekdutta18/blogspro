export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  url: string;
  author: {
    name: string;
    title: string;
    bio: string;
    avatar: string;
  };
  categories: Array<{ id: string; name: string; description: string }>;
  nav: Array<{ label: string; href: string; external?: boolean }>;
}

export const siteConfig: SiteConfig = {
  name: 'BlogsPro',
  tagline: 'Fintech · Compliance · Strategy',
  description: 'Sharp analysis on financial technology, regulatory compliance, and market growth strategy for institutional practitioners and operators.',
  url: 'https://blogspro.in',
  author: {
    name: 'Abhishek Dutta',
    title: 'Principal Strategic Researcher & Editor',
    bio: 'Fintech practitioner, researcher, and systems architect specializing in payment switch architectures, regulatory frameworks (RBI/SEBI), and sovereign institutional intelligence.',
    avatar: '/logo.svg'
  },
  categories: [
    { id: 'all', name: 'All Research', description: 'Comprehensive strategic intelligence archive' },
    { id: 'fintech', name: 'Fintech', description: 'Payment rails, core banking, embedded finance' },
    { id: 'compliance', name: 'Compliance & Regulation', description: 'RBI mandates, SEBI circulars, KYC/AML frameworks' },
    { id: 'strategy', name: 'Market Strategy', description: 'Cross-asset allocation, macro shifts, institutional alpha' },
    { id: 'banking', name: 'Banking Technology', description: 'ISO 20022/8583, RTGS, settlement architectures' }
  ],
  nav: [
    { label: 'Briefings', href: '/briefings.html' },
    { label: 'Research', href: '/#research' },
    { label: 'India macro', href: '/#policy' },
    { label: 'Markets', href: '/#markets' },
    { label: 'About', href: '/about.html' }
  ]
};
