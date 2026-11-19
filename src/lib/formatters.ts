import type { Medicine } from '../types/pharmacy';

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

export function formatDateID(isoDate: string): string {
  if (!isoDate) return '-';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

export function formatMultiUnitStock(med: Pick<Medicine, 'stockBase' | 'pcsPerStrip' | 'stripsPerBox' | 'unitBox' | 'unitStrip' | 'unitBase'>): string {
  const pcsPerStrip = Math.max(1, med.pcsPerStrip || 1);
  const stripsPerBox = Math.max(1, med.stripsPerBox || 1);
  const pcsPerBox = pcsPerStrip * stripsPerBox;

  const boxes = Math.floor(med.stockBase / pcsPerBox);
  const remAfterBox = med.stockBase % pcsPerBox;
  const strips = Math.floor(remAfterBox / pcsPerStrip);
  const pcs = remAfterBox % pcsPerStrip;

  const parts: string[] = [];
  if (pcsPerBox > 1 && boxes > 0) parts.push(`${boxes} ${med.unitBox}`);
  if (pcsPerStrip > 1 && strips > 0) parts.push(`${strips} ${med.unitStrip}`);
  if (pcs > 0 || parts.length === 0) parts.push(`${pcs} ${med.unitBase}`);
  return parts.join(' · ');
}

export function getBoxMultiplier(
  med: Pick<Medicine, 'pcsPerStrip' | 'stripsPerBox'>
): number {
  const pcsPerStrip = Math.max(1, med.pcsPerStrip || 1);
  const stripsPerBox = Math.max(1, med.stripsPerBox || 1);
  return pcsPerStrip * stripsPerBox;
}

export function getBaseHpp(
  med: Pick<Medicine, 'hpp' | 'pcsPerStrip' | 'stripsPerBox'>
): number {
  return Math.max(1, Math.round((med.hpp || 0) / getBoxMultiplier(med)));
}

export function getUnitHpp(
  med: Pick<Medicine, 'hpp' | 'pcsPerStrip' | 'stripsPerBox'>,
  unitType: 'Box' | 'Strip' | 'Pcs'
): number {
  if (unitType === 'Box') return Math.round(med.hpp || 0);
  if (unitType === 'Strip') {
    return Math.round((med.hpp || 0) / Math.max(1, med.stripsPerBox || 1));
  }
  return getBaseHpp(med);
}

export function getUnitMultiplier(med: Medicine, unitType: 'Box' | 'Strip' | 'Pcs'): number {
  const pcsPerStrip = Math.max(1, med.pcsPerStrip || 1);
  const stripsPerBox = Math.max(1, med.stripsPerBox || 1);
  if (unitType === 'Box') return pcsPerStrip * stripsPerBox;
  if (unitType === 'Strip') return pcsPerStrip;
  return 1;
}

export function getTierUnitPrice(
  med: Medicine,
  tier: 'reguler' | 'klinik' | 'mitra',
  unitType: 'Box' | 'Strip' | 'Pcs'
): number {
  if (tier === 'mitra') {
    // med.priceMitra is stored per Satuan Besar (Box)
    if (unitType === 'Box') return Math.round(med.priceMitra);
    if (unitType === 'Strip') {
      return Math.round(med.priceMitra / Math.max(1, med.stripsPerBox || 1));
    }
    return Math.round(med.priceMitra / getBoxMultiplier(med));
  }
  const basePrice = tier === 'klinik' ? med.priceKlinik : med.priceReguler;
  return Math.round(basePrice * getUnitMultiplier(med, unitType));
}
