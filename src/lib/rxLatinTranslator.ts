export const DEFAULT_PHARMACY_HEADER = {
  pharmacyName: 'APOTEK LATISHA FARMA',
  tagline: 'Clinical & Retail Pharmacy (Enterprise)',
  address: 'Jl. Kesehatan Raya No. 19, Jakarta Selatan',
  phone: '(021) 789-4410',
  apaName: 'Apt. Latisha Rahma, S.Farm',
  sipaNumber: '446/APT-LF/2026',
  siaNumber: '503/SIA-LF/2026',
};

export function toRomanNumeral(num: number): string {
  const n = Math.floor(num);
  if (!Number.isFinite(n) || n <= 0) return 'I';
  if (n > 3999) return String(n);
  const map: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rem = n;
  let result = '';
  for (const [val, sym] of map) {
    while (rem >= val) {
      result += sym;
      rem -= val;
    }
  }
  return result;
}

export function calculateAgeFromBirthDate(birthDateStr: string, refDateStr?: string): {
  years: number;
  months: number;
  label: string;
} | null {
  if (!birthDateStr) return null;
  const dob = new Date(`${birthDateStr}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const ref = refDateStr ? new Date(`${refDateStr}T00:00:00`) : new Date();
  if (Number.isNaN(ref.getTime())) return null;

  let years = ref.getFullYear() - dob.getFullYear();
  let months = ref.getMonth() - dob.getMonth();
  const days = ref.getDate() - dob.getDate();

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) {
    return { years: 0, months: 0, label: '0 Thn' };
  }
  const label = months > 0 ? `${years} Thn ${months} Bln` : `${years} Thn`;
  return { years, months, label };
}

export function calculateBirthDateFromAge(ageYears: number, currentBirthDate?: string): string {
  const cleanAge = Math.max(0, Math.min(130, Math.round(ageYears)));
  const today = new Date();
  const targetYear = today.getFullYear() - cleanAge;

  // Preserve month/day if a valid birthDate existed, otherwise default to today's month/day or 01-01
  if (currentBirthDate && /^\d{4}-\d{2}-\d{2}$/.test(currentBirthDate)) {
    const [, mm, dd] = currentBirthDate.split('-');
    return `${targetYear}-${mm}-${dd}`;
  }
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

function detectDosageFormAbbrev(text: string, fallbackForm = 'tab'): string {
  const t = text.toLowerCase();
  if (/\b(kapsul|capsule|caps|cap)\b/.test(t)) return 'caps';
  if (/\b(kaplet|capl)\b/.test(t)) return 'capl';
  if (/\b(tablet|tab)\b/.test(t)) return 'tab';
  if (/\b(sendok takar|cth|sirup|syrup|syr|suspensi|elixir)\b/.test(t)) return 'cth';
  if (/\b(sendok makan)\b/.test(t)) return 'C';
  if (/\b(tetes|drop|drops|gtt|tts)\b/.test(t)) return 'gtt';
  if (/\b(puyer|bungkus|serbuk|pulveres|pulv|sachet)\b/.test(t)) return 'pulv';
  if (/\b(salep|krim|cream|gel|ointment|unguentum|oles)\b/.test(t)) return 'u.e.';
  if (/\b(injeksi|ampul|vial|amp)\b/.test(t)) return 'amp';
  if (/\b(suppositoria|supp)\b/.test(t)) return 'supp';
  if (/\b(inhaler|semprot|puff|spray)\b/.test(t)) return 'puff';
  return fallbackForm;
}

export function translateSignaToLatin(
  indonesianSigna: string,
  dosageFormHint = 'tab'
): string {
  const raw = indonesianSigna.trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  const form = detectDosageFormAbbrev(`${lower} ${dosageFormHint}`, dosageFormHint || 'tab');

  // Parse frequency pattern like "3x1", "3 x 1", "3 kali sehari 1", "2x sehari 1"
  let freqPart = '';
  const nxmMatch = lower.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?|½|1\/2)/i);
  const kaliMatch = lower.match(/(\d+)\s*kali\s*(?:sehari)?\s*(\d+(?:[.,]\d+)?|½|1\/2)?/i);
  const tiapJamMatch = lower.match(/(?:tiap|setiap)\s*(\d+)\s*jam(?:\s*(\d+(?:[.,]\d+)?|½|1\/2))?/i);

  if (nxmMatch) {
    const times = nxmMatch[1];
    const dose = nxmMatch[2];
    freqPart =
      form === 'u.e.'
        ? `${times} dd ${form}`
        : `${times} dd ${dose} ${form}`;
  } else if (kaliMatch) {
    const times = kaliMatch[1];
    const dose = kaliMatch[2] || '1';
    freqPart =
      form === 'u.e.'
        ? `${times} dd ${form}`
        : `${times} dd ${dose} ${form}`;
  } else if (tiapJamMatch) {
    const hours = tiapJamMatch[1];
    const dose = tiapJamMatch[2] || '1';
    freqPart = `o.${hours}.h ${dose} ${form}`;
  } else if (/\b(oles|oleskan|pakai luar|obat luar)\b/.test(lower)) {
    freqPart = 'u.e.';
  } else if (/\b(kumur|berkumur)\b/.test(lower)) {
    freqPart = 'garg.';
  } else if (/\b(semprot|inhalasi)\b/.test(lower)) {
    freqPart = '1 dd 1 puff';
  }

  // Timing & route modifiers
  const modifiers: string[] = [];

  if (/\b(sesudah makan|setelah makan|habis makan|pc)\b/.test(lower)) {
    modifiers.push('PC');
  } else if (/\b(sebelum makan|ac)\b/.test(lower)) {
    modifiers.push('AC');
  } else if (/\b(saat makan|bersama makan|waktu makan|dc)\b/.test(lower)) {
    modifiers.push('DC');
  }

  if (/\bpagi\s*(dan|&|,)\s*malam\b/.test(lower)) {
    modifiers.push('mane et nocte');
  } else {
    if (/\bpagi\b/.test(lower)) modifiers.push('mane');
    if (/\bsiang\b/.test(lower)) modifiers.push('meridie');
    if (/\bsore\b/.test(lower)) modifiers.push('vespere');
    if (/\b(sebelum tidur)\b/.test(lower)) {
      modifiers.push('h.s.');
    } else if (/\bmalam\b/.test(lower)) {
      modifiers.push('nocte');
    }
  }

  if (/\b(mata kanan)\b/.test(lower)) modifiers.push('o.d.');
  else if (/\b(mata kiri)\b/.test(lower)) modifiers.push('o.s.');
  else if (/\b(kedua mata)\b/.test(lower)) modifiers.push('o.d.s.');

  if (/\b(telinga kanan)\b/.test(lower)) modifiers.push('a.d.');
  else if (/\b(telinga kiri)\b/.test(lower)) modifiers.push('a.s.');
  else if (/\b(kedua telinga)\b/.test(lower)) modifiers.push('a.d.s.');

  if (/\b(bila perlu|jika perlu|kalau perlu|jika demam|jika nyeri|jika pusing|jika mual|jika sesak|kp|prn)\b/.test(lower)) {
    modifiers.push('p.r.n.');
  }

  if (/\b(habiskan|sampai habis)\b/.test(lower)) {
    modifiers.push('ad finem');
  }

  if (/\b(dikocok dahulu|kocok dulu|kocok dahulu)\b/.test(lower)) {
    modifiers.push('agit.');
  }

  if (!freqPart && modifiers.length === 0) {
    return raw;
  }
  return [freqPart, ...modifiers].filter(Boolean).join(' ').trim();
}

export interface ParsedQuickRxLine {
  medicineName: string;
  quantity: number;
  quantityRoman: string;
  dosageForm: string;
  signaIndonesian: string;
  latinFormatted: string;
}

/**
 * Parses Indonesian quick input like:
 * "paracetamol 500mg No 10 / 3x1 sesudah makan"
 * or "Amoxicillin 500mg 15 kaplet / 3x1 sesudah makan habiskan"
 * into structured Rx components + canonical Latin notation:
 * "R/ paracetamol 500mg No X / 3 dd 1 tab PC"
 */
export function parseQuickIndonesianRx(input: string): ParsedQuickRxLine {
  const cleaned = input.trim().replace(/^R\/\s*/i, '');
  if (!cleaned) {
    return {
      medicineName: '',
      quantity: 10,
      quantityRoman: 'X',
      dosageForm: 'tab',
      signaIndonesian: '',
      latinFormatted: '',
    };
  }

  // Split medication part & signa part by "/", "|", or "S "
  let medSegment = cleaned;
  let signaSegment = '';

  const slashIdx = cleaned.indexOf('/');
  if (slashIdx >= 0) {
    medSegment = cleaned.slice(0, slashIdx).trim();
    signaSegment = cleaned.slice(slashIdx + 1).trim();
  } else {
    const pipeIdx = cleaned.indexOf('|');
    if (pipeIdx >= 0) {
      medSegment = cleaned.slice(0, pipeIdx).trim();
      signaSegment = cleaned.slice(pipeIdx + 1).trim();
    } else {
      const freqSplit = cleaned.match(/^(.+?)\s+(\d+\s*[x×]\s*\d+.*)$/i);
      if (freqSplit) {
        medSegment = freqSplit[1].trim();
        signaSegment = freqSplit[2].trim();
      }
    }
  }

  // Extract quantity from "No 10", "No. 10", "no.15", or trailing number if followed by form
  let quantity = 10;
  let medicineName = medSegment;

  const noMatch = medSegment.match(/\b(?:no\.?|num\.?|jumlah)\s*(\d+)\b/i);
  if (noMatch) {
    quantity = Math.max(1, Number(noMatch[1]) || 1);
    medicineName = medSegment
      .replace(noMatch[0], '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  } else {
    const trailingQty = medSegment.match(/^(.+?)\s+(\d+)\s*(tab|tablet|caps|kapsul|kaplet|botol|fls|tube|sachet|bungkus|amp)?$/i);
    if (trailingQty && trailingQty[1] && !/mg|mcg|ml|gr|g|%/i.test(trailingQty[2])) {
      quantity = Math.max(1, Number(trailingQty[2]) || 1);
      medicineName = trailingQty[1].trim();
    }
  }

  const dosageForm = detectDosageFormAbbrev(`${medSegment} ${signaSegment}`, 'tab');
  const quantityRoman = toRomanNumeral(quantity);
  const latinSigna = signaSegment ? translateSignaToLatin(signaSegment, dosageForm) : '';

  const latinFormatted = formatPrescriptionLineLatin({
    medicineName,
    quantity,
    dosageForm,
    signaIndonesian: signaSegment,
    explicitLatinSigna: latinSigna,
  });

  return {
    medicineName,
    quantity,
    quantityRoman,
    dosageForm,
    signaIndonesian: signaSegment,
    latinFormatted,
  };
}

export function formatPrescriptionLineLatin(params: {
  medicineName: string;
  quantity: number;
  dosageForm?: string;
  signaIndonesian?: string;
  explicitLatinSigna?: string;
}): string {
  const name = params.medicineName.trim();
  if (!name) return '';
  const roman = toRomanNumeral(params.quantity || 1);
  const signa =
    params.explicitLatinSigna?.trim() ||
    translateSignaToLatin(params.signaIndonesian || '', params.dosageForm || 'tab');

  if (signa) {
    return `R/ ${name} No ${roman} / ${signa}`;
  }
  return `R/ ${name} No ${roman}`;
}
