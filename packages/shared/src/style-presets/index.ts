export function buildStylePresetPrompt(presetPrompt: string | null | undefined, userPrompt: string) {
  const preset = presetPrompt?.replace(/\s+/g, ' ').trim();
  const prompt = userPrompt.replace(/\s+/g, ' ').trim();
  if (!preset) return prompt;
  if (!prompt) return preset;
  return `${preset} ${prompt}`;
}
