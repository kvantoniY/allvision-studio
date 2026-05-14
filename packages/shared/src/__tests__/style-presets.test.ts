import { buildStylePresetPrompt } from '../style-presets';

describe('buildStylePresetPrompt', () => {
  it('combines preset text and user prompt with normalized whitespace', () => {
    expect(buildStylePresetPrompt('  cinematic portrait.  ', '  red cat with glasses  ')).toBe(
      'cinematic portrait. red cat with glasses',
    );
  });

  it('uses only the user prompt when no preset is selected', () => {
    expect(buildStylePresetPrompt(null, '  cozy room  ')).toBe('cozy room');
  });
});
