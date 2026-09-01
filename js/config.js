// Quality tiers: picked once at boot from device hints, can be overridden via ?q=low|mid|high
const params = new URLSearchParams(location.search);
const forced = params.get('q');
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
const cores = navigator.hardwareConcurrency || 4;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let tier = 'high';
if (isMobile || cores <= 4) tier = 'mid';
if (isMobile && (cores <= 4 || innerWidth < 500)) tier = 'low';
if (forced && ['low', 'mid', 'high'].includes(forced)) tier = forced;

const TIERS = {
  low:  { pixelRatio: 1,   rain: 2500,  splashes: 300,  reflector: 0,    shadows: false, bloom: true,  gridN: 18, vehiclesPerLane: 3 },
  mid:  { pixelRatio: 1.25, rain: 7000, splashes: 700,  reflector: 512,  shadows: true,  bloom: true,  gridN: 18, vehiclesPerLane: 4 },
  high: { pixelRatio: 1.5, rain: 14000, splashes: 1200, reflector: 1024, shadows: true,  bloom: true,  gridN: 18, vehiclesPerLane: 6 },
};

export const Q = { tier, isMobile, reducedMotion, ...TIERS[tier] };

// World layout constants shared by city / camera / traffic
export const WORLD = {
  cell: 16,          // block + street pitch
  street: 5,         // street width
  boulevard: 21,     // width of the central north-south boulevard (kept free of buildings)
};
