import {
  Baby,
  BookOpen,
  Cake,
  Clapperboard,
  Flame,
  Gift,
  Heart,
  LayoutGrid,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PublicService } from '@allvision/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export const iconMap: Record<string, LucideIcon> = {
  Heart,
  Sparkles,
  Clapperboard,
  Baby,
  Gift,
  Flame,
  Cake,
  BookOpen,
  LayoutGrid,
};

export function iconForCategory(iconName: string | null | undefined): LucideIcon {
  if (iconName && iconMap[iconName]) return iconMap[iconName];
  return LayoutGrid;
}

export function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

export function previewFrom(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]) ?? '/mock_preview.png';
}

export function servicePriceCoins(service: PublicService) {
  return service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function bigrams(value: string): string[] {
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) grams.push(value.slice(i, i + 2));
  return grams;
}

// Коэффициент Сёренсена–Дайса по биграммам: 1 — идентичны, 0 — нет общего.
// Ловит опечатки и близкие по написанию слова ("похожие").
function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  const counts = new Map<string, number>();
  for (const gram of aGrams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  let intersection = 0;
  for (const gram of bGrams) {
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      intersection += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * intersection) / (aGrams.length + bGrams.length);
}

// Релевантность услуги поисковому запросу: точные вхождения важнее,
// плюс fuzzy-совпадение по словам для опечаток и похожих формулировок.
export function scoreService(service: PublicService, categoryLabel: string, query: string): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const title = normalizeText(service.title);
  const haystack = normalizeText([service.title, service.shortDesc, service.description ?? '', categoryLabel].join(' '));
  const words = new Set(haystack.split(' ').filter((word) => word.length >= 2));

  let score = 0;
  if (title.includes(q)) score += 120;
  else if (haystack.includes(q)) score += 60;

  const queryTokens = q.split(' ').filter((token) => token.length >= 2);
  for (const token of queryTokens) {
    if (title.includes(token)) {
      score += 24;
      continue;
    }
    if (haystack.includes(token)) {
      score += 12;
      continue;
    }
    let best = 0;
    for (const word of words) {
      const sim = diceSimilarity(token, word);
      if (sim > best) best = sim;
    }
    if (best >= 0.6) score += best * 14;
    else if (best >= 0.42) score += best * 5;
  }
  return score;
}

export const SEARCH_SCORE_THRESHOLD = 6;
