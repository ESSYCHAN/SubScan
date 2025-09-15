// utils/categoryMap.ts
export type CanonicalCategory =
  | 'housing' | 'utilities' | 'telecom' | 'transport' | 'insurance'
  | 'food' | 'entertainment' | 'software' | 'fitness' | 'news'
  | 'shopping' | 'finance' | 'savings' | 'other';

export const CATEGORY_ALIASES: Record<CanonicalCategory, RegExp[]> = {
  housing: [/rent|mortgage|landlord|agency/i],
  utilities: [/gas|electric|energy|water|sewer/i],
  telecom: [/broadband|virgin media|bt|o2|vodafone|three|ee/i],
  transport: [/fuel|petrol|diesel|uber\b|train|bus|parking|toll/i],
  insurance: [/insurance|insure|policy/i],
  food: [/deliveroo|uber eats|hello ?fresh|tesco|sainsburys|waitrose|aldi|asda|co-?op/i],
  entertainment: [/netflix|disney|prime video|now tv|cineworld/i],
  software: [/adobe|microsoft 365|office|google one|notion|zoom|figma|openai|chatgpt/i],
  fitness: [/gym|peloton|virgin active|puregym|nuffield/i],
  news: [/times|guardian|economist|ft|new york times/i],
  shopping: [/amazon(?!.*prime)|argos|ebay|john lewis|zara|h&m/i],
  finance: [/revolut|transferwise|wise|fee|interest/i],
  savings: [/isa|investment|pension/i],
  other: [/./], // fallback
};

export function mapCanonicalCategory(name: string, hint?: string): CanonicalCategory {
  const hay = `${name} ${hint||''}`.toLowerCase();
  for (const [cat, regs] of Object.entries(CATEGORY_ALIASES) as [CanonicalCategory,RegExp[]][]) {
    if (regs.some(rx => rx.test(hay))) return cat;
  }
  return 'other';
}
