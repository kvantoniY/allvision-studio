import {
  addElement,
  addLayer,
  addRule,
  attachAsset,
  createEmptyScene,
  patchElementTransform,
  removeElement,
  reorderElement,
  setSceneBackground,
  uniqueSceneId,
  updateRule,
  validateScene,
} from '../academy/scene-editing';
import { parseAcademyScene } from '../academy/scene-format';

describe('scene-editing helpers', () => {
  it('createEmptyScene produces a strictly valid scene', () => {
    const scene = createEmptyScene({ title: 'Тест' });
    expect(() => parseAcademyScene(scene)).not.toThrow();
    expect(scene.layers.length).toBeGreaterThan(0);
    expect(scene.states[0].id).toBe(scene.initialState);
  });

  it('uniqueSceneId avoids collisions', () => {
    const id = uniqueSceneId('button', ['button-1', 'button-2']);
    expect(id).toBe('button-3');
  });

  it('addElement adds a valid text element with unique id', () => {
    const scene = createEmptyScene();
    const { scene: next, elementId } = addElement(scene, 'ui', 'text');
    const el = next.layers.flatMap((l) => l.elements).find((e) => e.id === elementId);
    expect(el?.type).toBe('text');
    expect(el?.content.text).toBeTruthy(); // дефолтный текст → сцена валидна
    expect(() => parseAcademyScene(next)).not.toThrow();
  });

  it('patchElementTransform moves an element (drag on canvas)', () => {
    const scene = createEmptyScene();
    const { scene: withEl, elementId } = addElement(scene, 'world', 'text');
    const moved = patchElementTransform(withEl, elementId, { x: 500, y: 300 });
    const el = moved.layers.flatMap((l) => l.elements).find((e) => e.id === elementId);
    expect(el?.transform.x).toBe(500);
    expect(el?.transform.y).toBe(300);
  });

  it('attachAsset copies drag data into the element asset ref', () => {
    const scene = createEmptyScene();
    const { scene: withEl, elementId } = addElement(scene, 'background', 'image');
    const attached = attachAsset(withEl, elementId, {
      type: 'academy-asset',
      assetId: 'a1',
      scope: 'shared',
      kind: 'academy-background',
      fileUrl: '/static/x.jpg',
      mimeType: 'image/jpeg',
    });
    const el = attached.layers.flatMap((l) => l.elements).find((e) => e.id === elementId);
    expect(el?.asset?.assetId).toBe('a1');
    // image-элемент с ассетом теперь проходит строгую валидацию
    expect(() => parseAcademyScene(attached)).not.toThrow();
  });

  it('removeElement also drops rules bound to it', () => {
    let scene = createEmptyScene();
    const added = addElement(scene, 'ui', 'button');
    scene = added.scene;
    const ruleAdded = addRule(scene);
    scene = updateRule(ruleAdded.scene, ruleAdded.ruleId, {
      event: { type: 'element-click', sourceElementId: added.elementId },
    });
    expect(scene.rules).toHaveLength(1);
    scene = removeElement(scene, added.elementId);
    expect(scene.rules).toHaveLength(0);
  });

  it('reorderElement swaps z-order within a layer', () => {
    let scene = createEmptyScene();
    const a = addElement(scene, 'ui', 'button');
    scene = a.scene;
    const b = addElement(scene, 'ui', 'card');
    scene = b.scene;
    const uiLayer = () => scene.layers.find((l) => l.id === 'ui')!;
    expect(uiLayer().elements[0].id).toBe(a.elementId);
    scene = reorderElement(scene, 'ui', a.elementId, 1);
    expect(uiLayer().elements[0].id).toBe(b.elementId);
  });

  it('validateScene reports human-readable issues', () => {
    const broken = { ...createEmptyScene(), initialState: 'missing' };
    const result = validateScene(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(' ')).toContain('Начальное состояние');
  });

  it('setSceneBackground creates a full-viewport background element with the asset', () => {
    const scene = createEmptyScene();
    const next = setSceneBackground(scene, {
      type: 'academy-asset', assetId: 'bg1', scope: 'teacher', kind: 'academy-background',
      fileUrl: '/static/bg.jpg', mimeType: 'image/jpeg',
    });
    const bg = next.layers.flatMap((l) => l.elements).find((e) => e.type === 'background');
    expect(bg?.asset?.assetId).toBe('bg1');
    expect(bg?.transform.width).toBe(scene.viewport.width);
    // повторный вызов заменяет ассет того же фон-элемента, не плодит новый
    const again = setSceneBackground(next, {
      type: 'academy-asset', assetId: 'bg2', scope: 'teacher', kind: 'academy-background',
      fileUrl: '/static/bg2.jpg', mimeType: 'image/jpeg',
    });
    const bgs = again.layers.flatMap((l) => l.elements).filter((e) => e.type === 'background');
    expect(bgs).toHaveLength(1);
    expect(bgs[0].asset?.assetId).toBe('bg2');
  });

  it('addLayer keeps the scene valid', () => {
    const scene = createEmptyScene();
    const { scene: next } = addLayer(scene, 'overlay');
    expect(() => parseAcademyScene(next)).not.toThrow();
  });
});
