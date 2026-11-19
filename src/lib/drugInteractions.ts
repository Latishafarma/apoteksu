export interface InteractionRuleRecord {
  id: number;
  drugAKeyword: string;
  drugBKeyword: string;
  severity: string;
  mechanism: string;
  clinicalEffect: string;
  managementAdvice: string;
  evidenceLevel: string;
  literature?: string;
}

export interface DetectedInteractionAlert {
  ruleId: number;
  severity: 'Major' | 'Moderate' | 'Minor';
  drugA: string;
  drugB: string;
  sourceContext: 'Resep Saat Ini' | 'Riwayat Terapi Pasien';
  mechanism: string;
  clinicalEffect: string;
  managementAdvice: string;
  evidenceLevel: string;
  literature?: string;
}

export interface CandidateDrugInput {
  name: string;
  genericName?: string;
}

export function detectDrugInteractions(
  activeItems: CandidateDrugInput[],
  patientHistoryItems: CandidateDrugInput[],
  rules: InteractionRuleRecord[]
): DetectedInteractionAlert[] {
  const alerts: DetectedInteractionAlert[] = [];
  const seenKey = new Set<string>();

  const matchesKeyword = (drug: CandidateDrugInput, keyword: string) => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return false;
    const haystack = `${drug.name} ${drug.genericName || ''}`.toLowerCase();
    return haystack.includes(kw);
  };

  // 1. Check intra-prescription / cart drug-drug pairs
  for (let i = 0; i < activeItems.length; i++) {
    for (let j = i + 1; j < activeItems.length; j++) {
      const itemA = activeItems[i];
      const itemB = activeItems[j];
      for (const rule of rules) {
        const directMatch =
          matchesKeyword(itemA, rule.drugAKeyword) && matchesKeyword(itemB, rule.drugBKeyword);
        const reverseMatch =
          matchesKeyword(itemA, rule.drugBKeyword) && matchesKeyword(itemB, rule.drugAKeyword);

        if (directMatch || reverseMatch) {
          const dedup = [rule.id, 'current', itemA.name, itemB.name].sort().join('::');
          if (!seenKey.has(dedup)) {
            seenKey.add(dedup);
            alerts.push({
              ruleId: rule.id,
              severity: normalizeSeverity(rule.severity),
              drugA: itemA.name,
              drugB: itemB.name,
              sourceContext: 'Resep Saat Ini',
              mechanism: rule.mechanism,
              clinicalEffect: rule.clinicalEffect,
              managementAdvice: rule.managementAdvice,
              evidenceLevel: rule.evidenceLevel,
              literature: rule.literature,
            });
          }
        }
      }
    }
  }

  // 2. Cross-reference active items against patient's ongoing therapy history
  for (const currentItem of activeItems) {
    for (const historyItem of patientHistoryItems) {
      if (currentItem.name.toLowerCase() === historyItem.name.toLowerCase()) {
        continue;
      }
      for (const rule of rules) {
        const directMatch =
          matchesKeyword(currentItem, rule.drugAKeyword) &&
          matchesKeyword(historyItem, rule.drugBKeyword);
        const reverseMatch =
          matchesKeyword(currentItem, rule.drugBKeyword) &&
          matchesKeyword(historyItem, rule.drugAKeyword);

        if (directMatch || reverseMatch) {
          const dedup = [rule.id, 'history', currentItem.name, historyItem.name].sort().join('::');
          if (!seenKey.has(dedup)) {
            seenKey.add(dedup);
            alerts.push({
              ruleId: rule.id,
              severity: normalizeSeverity(rule.severity),
              drugA: currentItem.name,
              drugB: `${historyItem.name} (Riwayat Terapi)`,
              sourceContext: 'Riwayat Terapi Pasien',
              mechanism: rule.mechanism,
              clinicalEffect: rule.clinicalEffect,
              managementAdvice: rule.managementAdvice,
              evidenceLevel: rule.evidenceLevel,
              literature: rule.literature,
            });
          }
        }
      }
    }
  }

  const rank: Record<'Major' | 'Moderate' | 'Minor', number> = {
    Major: 0,
    Moderate: 1,
    Minor: 2,
  };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function normalizeSeverity(val: string): 'Major' | 'Moderate' | 'Minor' {
  const lower = val.toLowerCase();
  if (lower === 'major') return 'Major';
  if (lower === 'minor') return 'Minor';
  return 'Moderate';
}
