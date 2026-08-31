import {
  CATALOG_SECTIONS,
  CATALOG_SECTION_DEFS,
  CATEGORY_SECTIONS,
  OCCASION_DEFS,
  OCCASION_TAGS,
  catalogSectionDef,
  isCatalogSection,
  isCategorySection,
  isOccasionTag,
  occasionTitle,
  toCategorySection,
} from '../catalog/sections';

describe('catalog sections', () => {
  it('describes every tab of the storefront', () => {
    for (const code of CATALOG_SECTIONS) {
      const def = CATALOG_SECTION_DEFS.find((item) => item.code === code);
      expect(def).toBeDefined();
      expect(def?.title.length).toBeGreaterThan(0);
      expect(def?.heading.length).toBeGreaterThan(0);
    }
    expect(CATALOG_SECTION_DEFS).toHaveLength(CATALOG_SECTIONS.length);
  });

  it('keeps category sections a subset of catalog tabs', () => {
    // «Популярное» собирается из featured-услуг, «Альбомы» — заглушка,
    // поэтому привязать категорию можно не к каждой вкладке.
    for (const section of CATEGORY_SECTIONS) {
      expect(CATALOG_SECTIONS).toContain(section);
    }
    expect(CATEGORY_SECTIONS).not.toContain('popular' as never);
    expect(CATEGORY_SECTIONS).not.toContain('albums' as never);
  });

  it('falls back to the default section for unknown database values', () => {
    expect(toCategorySection('greetings')).toBe('greetings');
    expect(toCategorySection('popular')).toBe('services');
    expect(toCategorySection(undefined)).toBe('services');
    expect(toCategorySection('typo')).toBe('services');
  });

  it('validates tab and occasion codes', () => {
    expect(isCatalogSection('albums')).toBe(false);
    expect(isCatalogSection('nope')).toBe(false);
    expect(isCategorySection('services')).toBe(true);
    expect(isCategorySection('popular')).toBe(false);
    expect(isOccasionTag('NEW_YEAR')).toBe(true);
    expect(isOccasionTag('new_year')).toBe(false);
  });

  it('describes every occasion tag', () => {
    for (const tag of OCCASION_TAGS) {
      const def = OCCASION_DEFS.find((item) => item.code === tag);
      expect(def).toBeDefined();
      expect(def?.emoji.length).toBeGreaterThan(0);
      expect(occasionTitle(tag)).toBe(def?.title);
    }
    expect(OCCASION_DEFS).toHaveLength(OCCASION_TAGS.length);
  });

  it('returns the first tab for an unknown section code', () => {
    expect(catalogSectionDef('popular').code).toBe('popular');
    expect(catalogSectionDef('missing' as never).code).toBe(CATALOG_SECTION_DEFS[0].code);
  });
});
