import {
  CHARACTER_PROFILE_DEFAULT_MODEL,
  CHARACTER_REF_KINDS,
  CHARACTER_REF_LABELS,
  CHARACTER_REF_PROMPTS,
} from '../academy/character';
import { getBlockCatalogItem } from '../blocks';

describe('academy character profile constants', () => {
  it('every ref kind has a label and a prompt', () => {
    for (const kind of CHARACTER_REF_KINDS) {
      expect(CHARACTER_REF_LABELS[kind]).toBeTruthy();
      expect(CHARACTER_REF_PROMPTS[kind].length).toBeGreaterThan(100);
    }
  });

  it('prompts enforce identity preservation and cinematic (non-flat-cartoon) style', () => {
    for (const kind of CHARACTER_REF_KINDS) {
      const prompt = CHARACTER_REF_PROMPTS[kind];
      expect(prompt).toContain('same child');
      expect(prompt).toContain('cinematic');
    }
  });

  it('default model exists among image-edit catalog models', () => {
    const block = getBlockCatalogItem('image-edit');
    expect(block).toBeTruthy();
    const models = (block?.supportedModels ?? []).map((m) => m.slug);
    expect(models).toContain(CHARACTER_PROFILE_DEFAULT_MODEL);
  });
});
