// Unit conversions and formatting. The only place these live — see CONTRACTS.md.

const DEFAULT_LOCALE = "nl-NL";

/** Half-up rounding to `decimals` places, immune to binary floating-point drift. */
function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * factor + Number.EPSILON * factor)) / factor;
}

export function percentToLitres(percent: number, tankLitres: number): number {
  return (percent / 100) * tankLitres;
}

export function litresToPercent(litres: number, tankLitres: number): number {
  return (litres / tankLitres) * 100;
}

export function litresForDistance(distanceM: number, consumptionLPer100Km: number): number {
  return (distanceM / 1000 / 100) * consumptionLPer100Km;
}

export function metresToKm(m: number): number {
  return m / 1000;
}

/** 2 dp, half-up. */
export function roundMoney(euros: number): number {
  return roundHalfUp(euros, 2);
}

/** 3 dp, half-up. */
export function roundPrice(euros: number): number {
  return roundHalfUp(euros, 3);
}

// Built from the plain decimal formatter rather than `style: "currency"` — ICU inserts
// a non-breaking space after the symbol in some environments, which the spec forbids.
export function formatMoney(euros: number, locale: string = DEFAULT_LOCALE): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(euros));
  return `€${formatted}`;
}

export function formatLitres(l: number, locale: string = DEFAULT_LOCALE): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(roundHalfUp(l, 1));
  return `${formatted} L`;
}

export function formatPricePerLitre(p: number, locale: string = DEFAULT_LOCALE): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(roundPrice(p));
  return `€${formatted}`;
}
