import { parseSourceSelectDescription, parseSourceValue } from '../utils/source-selector';

describe('source selector parsing', () => {
  it('parses supported source value formats', () => {
    expect(parseSourceValue('{{user.photo}}')).toEqual({ kind: 'user', raw: '{{user.photo}}', id: 'photo' });
    expect(parseSourceValue('{{ step_1.output }}')).toEqual({ kind: 'step', raw: '{{ step_1.output }}', id: 'step_1' });
    expect(parseSourceValue('asset:abc-123')).toEqual({ kind: 'asset', raw: 'asset:abc-123', id: 'abc-123' });
    expect(parseSourceValue('https://cdn.test/file.mp4')).toEqual({ kind: 'plain', raw: 'https://cdn.test/file.mp4' });
    expect(parseSourceValue('')).toEqual({ kind: 'empty', raw: '' });
  });

  it('parses source-select descriptions with label and help text', () => {
    expect(parseSourceSelectDescription('source-select:video|Видео-референс|Выберите ролик с движением')).toEqual({
      mediaKind: 'video',
      label: 'Видео-референс',
      description: 'Выберите ролик с движением',
    });
    expect(parseSourceSelectDescription('Обычное описание')).toBeNull();
  });
});
