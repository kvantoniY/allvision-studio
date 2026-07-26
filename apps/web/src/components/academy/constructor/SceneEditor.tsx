'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, Copy, Eye, Image as ImageIcon, Layers, Loader2, Pencil, Plus, Redo2, Trash2, Undo2, Volume2, Zap,
} from 'lucide-react';
import {
  ACADEMY_SCENE_ELEMENT_TYPE_LABELS,
  ACADEMY_SCENE_ACTION_TYPES,
  ACADEMY_SCENE_LAYER_KINDS,
  createEmptyScene,
  addElement,
  addLayer,
  addRule,
  removeRule,
  updateRule,
  patchElementTransform,
  pruneDanglingRefs,
  withSceneDefaults,
  removeElement,
  removeLayer,
  reorderElement,
  updateElement,
  attachAsset,
  setSceneBackground,
  validateScene,
  elementFillColor,
  elementTextColor,
  elementObjectFit,
  elementBorderRadius,
  type AcademyScene,
  type AcademySceneElement,
} from '@allvision/shared';
import { AcademyScenePlayer } from '@/components/academy/scene-player';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetTemplateQuery, usePublishTemplateMutation, useUpdateTemplateMutation } from '@/store/api/academy-lesson-templates-api';
import { AssetPickerDialog } from './AssetPickerDialog';
import { BackgroundGenerator } from './BackgroundGenerator';
import { RulesEditor } from './RulesEditor';
import { ElementPalette } from './ElementPalette';

const IMAGE_TYPES = ['background', 'animated-background', 'foreground', 'image', 'character', 'npc', 'prop', 'video'];

// Ручки изменения размера выбранного элемента на холсте.
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_POS: Record<ResizeHandle, string> = {
  nw: '-left-1.5 -top-1.5', n: 'left-1/2 -top-1.5 -translate-x-1/2', ne: '-right-1.5 -top-1.5',
  e: '-right-1.5 top-1/2 -translate-y-1/2', se: '-right-1.5 -bottom-1.5',
  s: 'left-1/2 -bottom-1.5 -translate-x-1/2', sw: '-left-1.5 -bottom-1.5',
  w: '-left-1.5 top-1/2 -translate-y-1/2',
};
const ELEMENT_ACTION_LABELS: Record<string, string> = {
  'show-element': 'Показать элемент', 'hide-element': 'Скрыть элемент', 'toggle-element': 'Переключить элемент',
  'play-sound': 'Проиграть звук', 'set-pose': 'Сменить позу', 'play-animation': 'Анимация',
  'add-score': 'Добавить очки', 'show-hint': 'Показать подсказку', 'set-state': 'Сменить состояние сцены',
  'set-variable': 'Задать переменную', 'allow-transition': 'Разрешить переход',
  'next-scene': 'Следующая сцена', 'emit-event': 'Отправить событие',
};

const HANDLE_CURSOR: Record<ResizeHandle, string> = {
  nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
  se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize',
};
const TEXT_TYPES = ['text', 'dialogue', 'button', 'card'];

/**
 * Читает документ урока: массив сцен из `{scenes:[]}` или обёртка одиночной сцены.
 * Сразу подчищает битые ссылки правил — в старых черновиках остались правила на
 * удалённые элементы, из-за которых публикация падала неустранимой ошибкой.
 */
function documentFrom(raw: unknown, title: string): AcademyScene[] {
  if (raw && typeof raw === 'object') {
    const r = raw as { scenes?: unknown; layers?: unknown };
    // withSceneDefaults — заполняет visible/transform у «сырых» сцен (импорт JSON), иначе
    // слои без visible скрываются и холст пустой. pruneDanglingRefs чистит битые правила.
    if (Array.isArray(r.scenes) && r.scenes.length > 0) return (r.scenes as AcademyScene[]).map((s) => pruneDanglingRefs(withSceneDefaults(s)));
    if (Array.isArray(r.layers)) return [pruneDanglingRefs(withSceneDefaults(raw))];
  }
  return [createEmptyScene({ title })];
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-md border border-border bg-background px-2 text-sm"
      />
    </label>
  );
}

/** Только hex-цвета типа #rrggbb можно показать в нативном color-инпуте. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Цветовое поле: свотч (нативный color) + текст (любой CSS-цвет), с кнопкой сброса. */
function ColorField({ label, value, fallback, onChange }: { label: string; value?: string; fallback: string; onChange: (v: string | undefined) => void }) {
  const swatch = value && HEX_RE.test(value) ? value : fallback;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <input type="color" value={swatch} onChange={(e) => onChange(e.target.value)} className="h-8 w-9 shrink-0 cursor-pointer rounded border border-border bg-background p-0.5" aria-label={label} />
        <input
          value={value ?? ''}
          placeholder={fallback}
          onChange={(e) => onChange(e.target.value.trim() || undefined)}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
        />
      </div>
    </label>
  );
}

export function SceneEditor({ templateId, onBack }: { templateId: string; onBack: () => void }) {
  const { data, isLoading } = useGetTemplateQuery(templateId);
  const [updateTemplate] = useUpdateTemplateMutation();
  const [publishTemplate] = usePublishTemplateMutation();

  const [scenes, setScenes] = useState<AcademyScene[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [title, setTitle] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewRole, setPreviewRole] = useState<'student' | 'teacher'>('student');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bgGenOpen, setBgGenOpen] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [past, setPast] = useState<AcademyScene[][]>([]);
  const [future, setFuture] = useState<AcademyScene[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Инициализация из шаблона (один раз на загрузку).
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || loadedFor.current === templateId) return;
    loadedFor.current = templateId;
    setScenes(documentFrom(data.template.scene, data.template.title));
    setActiveIndex(0);
    setTitle(data.template.title);
  }, [data, templateId]);

  const scene = scenes ? scenes[activeIndex] ?? scenes[0] ?? null : null;

  const pushUndo = useCallback((snapshot: AcademyScene[]) => {
    setPast((p) => [...p.slice(-49), snapshot]);
    setFuture([]);
  }, []);

  // Правка активной сцены (с записью в undo).
  const apply = useCallback((nextScene: AcademyScene) => {
    setScenes((cur) => {
      if (!cur) return cur;
      pushUndo(cur);
      const next = cur.slice();
      next[activeIndex] = nextScene;
      return next;
    });
    setDirty(true);
  }, [activeIndex, pushUndo]);

  // Правка активной сцены БЕЗ undo — для драга на канвасе (снимок делается один раз в начале).
  const applyNoUndo = useCallback((nextScene: AcademyScene) => {
    setScenes((cur) => {
      if (!cur) return cur;
      const next = cur.slice();
      next[activeIndex] = nextScene;
      return next;
    });
    setDirty(true);
  }, [activeIndex]);

  const snapshotForDrag = useCallback(() => { setScenes((cur) => { if (cur) pushUndo(cur); return cur; }); }, [pushUndo]);

  const undo = () => {
    setPast((p) => {
      if (p.length === 0 || !scenes) return p;
      setFuture((f) => [scenes, ...f].slice(0, 50));
      const prev = p[p.length - 1];
      setScenes(prev);
      setActiveIndex((i) => Math.min(i, prev.length - 1));
      setDirty(true);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (f.length === 0 || !scenes) return f;
      setPast((p) => [...p, scenes]);
      const nx = f[0];
      setScenes(nx);
      setActiveIndex((i) => Math.min(i, nx.length - 1));
      setDirty(true);
      return f.slice(1);
    });
  };

  // Операции со сценами урока.
  const addScene = () => {
    if (!scenes) return;
    pushUndo(scenes);
    setScenes([...scenes, createEmptyScene({ title: `Сцена ${scenes.length + 1}` })]);
    setActiveIndex(scenes.length);
    setSelectedId(null);
    setDirty(true);
  };
  const duplicateScene = () => {
    if (!scenes || !scene) return;
    pushUndo(scenes);
    const copy: AcademyScene = JSON.parse(JSON.stringify(scene));
    copy.id = `${copy.id}-copy-${Date.now().toString(36)}`.slice(0, 110);
    copy.title = `${copy.title} (копия)`.slice(0, 200);
    const next = [...scenes];
    next.splice(activeIndex + 1, 0, copy);
    setScenes(next);
    setActiveIndex(activeIndex + 1);
    setDirty(true);
  };
  const deleteScene = () => {
    if (!scenes || scenes.length <= 1) return;
    if (!window.confirm('Удалить эту сцену урока?')) return;
    pushUndo(scenes);
    setScenes(scenes.filter((_, i) => i !== activeIndex));
    setActiveIndex(Math.max(0, activeIndex - 1));
    setSelectedId(null);
    setDirty(true);
  };
  const moveScene = (dir: -1 | 1) => {
    if (!scenes) return;
    const target = activeIndex + dir;
    if (target < 0 || target >= scenes.length) return;
    pushUndo(scenes);
    const next = [...scenes];
    [next[activeIndex], next[target]] = [next[target], next[activeIndex]];
    setScenes(next);
    setActiveIndex(target);
    setDirty(true);
  };

  // Автосохранение документа урока (debounce 1.5с).
  useEffect(() => {
    if (!dirty || !scenes) return undefined;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        await updateTemplate({ id: templateId, body: { title, scene: { scenes } } }).unwrap();
        setDirty(false);
      } catch {
        // молча — попробуем на следующем изменении
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [dirty, scenes, title, templateId, updateTemplate]);

  const selected = useMemo(
    () => scene?.layers.flatMap((l) => l.elements).find((e) => e.id === selectedId) ?? null,
    [scene, selectedId],
  );
  const selectedLayerId = useMemo(
    () => scene?.layers.find((l) => l.elements.some((e) => e.id === selectedId))?.id ?? null,
    [scene, selectedId],
  );
  // Слой, в который палитра добавляет новые элементы (слой выбранного элемента, иначе первый).
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const targetLayerId = activeLayerId && scene?.layers.some((l) => l.id === activeLayerId)
    ? activeLayerId
    : (selectedLayerId ?? scene?.layers[0]?.id ?? null);

  const validateDoc = (): { ok: boolean; issue?: string } => {
    if (!scenes) return { ok: false };
    for (let i = 0; i < scenes.length; i += 1) {
      const r = validateScene(scenes[i]);
      if (!r.ok) return { ok: false, issue: `Сцена ${i + 1}: ${r.issues[0] ?? 'невалидна'}` };
    }
    return { ok: true };
  };

  const runValidate = () => {
    const result = validateDoc();
    if (result.ok) toast({ title: `Урок валиден ✓ (${scenes?.length ?? 0} сцен)` });
    else toast({ title: 'Есть проблемы', description: result.issue, variant: 'destructive' });
  };

  const publish = async () => {
    if (!scenes) return;
    const result = validateDoc();
    if (!result.ok) { toast({ title: 'Нельзя опубликовать', description: result.issue, variant: 'destructive' }); return; }
    try {
      await updateTemplate({ id: templateId, body: { title, scene: { scenes } } }).unwrap();
      setDirty(false);
      const res = await publishTemplate(templateId).unwrap();
      toast({ title: `Опубликована версия ${res.version.version}`, description: 'Экземпляры на прошлых версиях не изменятся.' });
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось опубликовать', description: msg, variant: 'destructive' });
    }
  };

  if (isLoading || !scenes || !scene) {
    return <div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-[calc(100dvh-2rem)] flex-col gap-3">
      {/* Топбар */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <Input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="h-8 w-56 font-medium" />
        <span className="text-xs text-muted-foreground">
          {saving ? 'Сохранение…' : dirty ? 'Изменения не сохранены' : 'Сохранено'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={undo} disabled={past.length === 0}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={future.length === 0}><Redo2 className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={runValidate}><Check className="mr-1 h-4 w-4" /> Проверить</Button>
          <Button variant={preview ? 'default' : 'outline'} size="sm" onClick={() => setPreview((v) => !v)}><Eye className="mr-1 h-4 w-4" /> Предпросмотр</Button>
          <Button size="sm" onClick={publish}>Опубликовать</Button>
        </div>
      </div>

      {/* Лента сцен урока (сцена за сценой) */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-card px-2 py-2">
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">Сцены:</span>
        {scenes.map((s, i) => (
          <button
            key={s.id + i}
            type="button"
            onClick={() => { setActiveIndex(i); setSelectedId(null); setPreview(false); }}
            className={cn(
              'shrink-0 rounded-lg border px-3 py-1.5 text-xs',
              i === activeIndex ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-primary/40',
            )}
            title={s.title}
          >
            <span className="font-semibold">{i + 1}.</span> {s.title.length > 18 ? `${s.title.slice(0, 18)}…` : s.title}
          </button>
        ))}
        <div className="ml-1 flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => moveScene(-1)} disabled={activeIndex <= 0} aria-label="Левее"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => moveScene(1)} disabled={activeIndex >= scenes.length - 1} aria-label="Правее"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={duplicateScene} aria-label="Дублировать сцену"><Copy className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={deleteScene} disabled={scenes.length <= 1} aria-label="Удалить сцену"><Trash2 className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={addScene}><Plus className="mr-1 h-4 w-4" /> Сцена</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
        {/* Палитра элементов + слои */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-3">
          <div>
            <p className="mb-1.5 text-sm font-semibold">Добавить элемент</p>
            <p className="mb-2 text-[11px] text-muted-foreground">
              В слой: <span className="font-medium text-foreground">{scene.layers.find((l) => l.id === targetLayerId)?.name ?? '—'}</span>
            </p>
            <ElementPalette onAdd={(type) => {
              if (!targetLayerId) return;
              const res = addElement(scene, targetLayerId, type);
              apply(res.scene);
              setSelectedId(res.elementId);
            }} />
          </div>

          <div className="border-t border-border pt-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold"><Layers className="h-4 w-4" /> Слои</span>
              <select
                onChange={(e) => { if (e.target.value) { apply(addLayer(scene, e.target.value as typeof ACADEMY_SCENE_LAYER_KINDS[number]).scene); e.target.value = ''; } }}
                className="rounded-md border border-border bg-background px-1 py-1 text-xs"
                value=""
              >
                <option value="">+ слой</option>
                {ACADEMY_SCENE_LAYER_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {scene.layers.map((layer) => (
              <div key={layer.id} className="mb-2">
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveLayerId(layer.id)}
                    className={cn('flex-1 truncate rounded px-1.5 py-0.5 text-left text-xs font-medium', layer.id === targetLayerId ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted')}
                    title="Сделать активным слоем для добавления"
                  >
                    {layer.name}
                  </button>
                  {scene.layers.length > 1 && (
                    <button type="button" aria-label="Удалить слой" className="text-muted-foreground hover:text-destructive" onClick={() => apply(removeLayer(scene, layer.id))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="mt-1 space-y-0.5">
                  {layer.elements.map((el) => (
                    <button
                      key={el.id}
                      type="button"
                      onClick={() => { setSelectedId(el.id); setActiveLayerId(layer.id); }}
                      className={cn('flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs', el.id === selectedId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
                    >
                      <span className="truncate">{el.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{ACADEMY_SCENE_ELEMENT_TYPE_LABELS[el.type]}</span>
                    </button>
                  ))}
                  {layer.elements.length === 0 && <p className="px-2 text-[11px] text-muted-foreground">пусто</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Канвас / предпросмотр */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-muted/40">
          {preview ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Роль:</span>
                {(['student', 'teacher'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setPreviewRole(r)} className={cn('rounded-full border px-2.5 py-1 text-xs', previewRole === r ? 'border-primary bg-accent text-accent-foreground' : 'border-border')}>
                    {r === 'student' ? 'Ученик' : 'Учитель'}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                <AcademyScenePlayer scene={scene} role={previewRole} className="h-full" />
              </div>
            </div>
          ) : (
            <EditCanvas scene={scene} selectedId={selectedId} onSelect={setSelectedId} onApply={applyNoUndo} onBeginDrag={snapshotForDrag} />
          )}
        </div>

        {/* Инспектор */}
        <div className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-border bg-card p-3">
          {selected ? (
            <ElementInspector
              key={selected.id}
              element={selected}
              scene={scene}
              onSceneChange={apply}
              onChange={(patch) => apply(updateElement(scene, selected.id, patch))}
              onDelete={() => { apply(removeElement(scene, selected.id)); setSelectedId(null); }}
              onReorder={(dir) => selectedLayerId && apply(reorderElement(scene, selectedLayerId, selected.id, dir))}
              onPickAsset={() => setPickerOpen(true)}
            />
          ) : (
            <SceneInspector scene={scene} onChange={apply} onGenerateBg={() => setBgGenOpen(true)} onPickBg={() => setBgPickerOpen(true)} />
          )}
        </div>
      </div>

      {/* Правила */}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-3">
        <RulesEditor scene={scene} onChange={apply} />
      </div>

      {pickerOpen && selected && (
        <AssetPickerDialog onClose={() => setPickerOpen(false)} onPick={(drag) => apply(attachAsset(scene, selected.id, drag))} />
      )}
      {bgGenOpen && (
        <BackgroundGenerator onClose={() => setBgGenOpen(false)} onGenerated={(drag) => apply(setSceneBackground(scene, drag))} />
      )}
      {bgPickerOpen && (
        <AssetPickerDialog onClose={() => setBgPickerOpen(false)} onPick={(drag) => apply(setSceneBackground(scene, drag))} />
      )}
    </div>
  );
}

// === Канвас редактирования (DOM, drag-to-move) ===
function EditCanvas({
  scene, selectedId, onSelect, onApply, onBeginDrag,
}: {
  scene: AcademyScene;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onApply: (scene: AcademyScene) => void;
  onBeginDrag: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = width / scene.viewport.width;
  type DragState = {
    id: string;
    mode: 'move' | 'resize';
    handle?: ResizeHandle;
    startX: number;
    startY: number;
    ox: number; oy: number; ow: number; oh: number;
  };
  const drag = useRef<DragState | null>(null);

  const onPointerDown = (e: React.PointerEvent, el: AcademySceneElement) => {
    e.stopPropagation();
    onSelect(el.id);
    onBeginDrag();
    drag.current = {
      id: el.id, mode: 'move',
      startX: e.clientX, startY: e.clientY,
      ox: el.transform.x, oy: el.transform.y, ow: el.transform.width, oh: el.transform.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onResizeDown = (e: React.PointerEvent, el: AcademySceneElement, handle: ResizeHandle) => {
    e.stopPropagation();
    onSelect(el.id);
    onBeginDrag();
    drag.current = {
      id: el.id, mode: 'resize', handle,
      startX: e.clientX, startY: e.clientY,
      ox: el.transform.x, oy: el.transform.y, ow: el.transform.width, oh: el.transform.height,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;

    if (d.mode === 'move') {
      onApply(patchElementTransform(scene, d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) }));
      return;
    }
    const h = d.handle!;
    const MIN = 16;
    let { ox: x, oy: y, ow: w, oh: hgt } = d;
    if (h.includes('e')) w = Math.max(MIN, d.ow + dx);
    if (h.includes('s')) hgt = Math.max(MIN, d.oh + dy);
    if (h.includes('w')) { const nw = Math.max(MIN, d.ow - dx); x = d.ox + (d.ow - nw); w = nw; }
    if (h.includes('n')) { const nh = Math.max(MIN, d.oh - dy); y = d.oy + (d.oh - nh); hgt = nh; }
    onApply(patchElementTransform(scene, d.id, {
      x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(hgt),
    }));
  };
  const onPointerUp = () => { drag.current = null; };

  const layers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      <div
        ref={ref}
        className="relative w-full max-w-3xl overflow-hidden rounded-lg shadow"
        style={{ aspectRatio: `${scene.viewport.width} / ${scene.viewport.height}`, backgroundColor: scene.viewport.backgroundColor }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        // Снимаем выделение ТОЛЬКО по клику в пустое место холста: иначе клик по элементу
        // всплывал сюда и тут же сбрасывал только что выбранный элемент.
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(''); }}
      >
        {layers.filter((l) => l.visible !== false).map((layer) =>
          layer.elements.map((el) => (
            <div
              key={el.id}
              onPointerDown={(e) => onPointerDown(e, el)}
              className={cn('absolute cursor-move select-none', el.id === selectedId && 'outline outline-2 outline-primary', !el.visible && 'opacity-40')}
              style={{
                left: el.transform.x * scale,
                top: el.transform.y * scale,
                width: el.transform.width * scale,
                height: el.transform.height * scale,
                transform: `rotate(${el.transform.rotation}deg)`,
                opacity: el.transform.opacity,
              }}
            >
              <ElementVisual element={el} />
              {el.id === selectedId && !el.locked && RESIZE_HANDLES.map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => onResizeDown(e, el, h)}
                  className={cn(
                    'absolute z-10 h-2.5 w-2.5 rounded-full border border-white bg-primary shadow',
                    HANDLE_POS[h],
                  )}
                  style={{ cursor: HANDLE_CURSOR[h] }}
                />
              ))}
            </div>
          )),
        )}
      </div>
    </div>
  );
}

/** URL материала: в dev добавляем origin API, чтобы /api/... грузился с бэкенда. */
function assetUrl(src: string): string {
  const api = process.env.NEXT_PUBLIC_API_URL;
  if (api && src.startsWith('/api/')) return `${api.replace(/\/+$/, '')}${src}`;
  return src;
}

function ElementVisual({ element }: { element: AcademySceneElement }) {
  // Реальная картинка, если материал уже привязан — вписываем так же, как в уроке (Pixi).
  if (IMAGE_TYPES.includes(element.type) && element.asset?.fileUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={assetUrl(element.asset.fileUrl)} alt={element.name} className="h-full w-full" style={{ objectFit: elementObjectFit(element) }} draggable={false} />;
  }

  // Персонаж ученика: абстрактный силуэт (реальный ребёнок подставится при подготовке урока).
  if (element.type === 'character') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-1">
        <svg viewBox="0 0 40 64" className="h-full w-auto max-h-full text-primary/45" fill="currentColor" preserveAspectRatio="xMidYMid meet">
          <circle cx="20" cy="12" r="9" />
          <path d="M20 23c-9 0-15 6-15 14v20a3 3 0 003 3h24a3 3 0 003-3V37c0-8-6-14-15-14z" />
        </svg>
        <span className="mt-0.5 shrink-0 text-[9px] font-medium text-primary/70">Персонаж ученика</span>
      </div>
    );
  }

  // NPC — силуэт другого оттенка.
  if (element.type === 'npc') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-400/60 bg-slate-400/10 p-1">
        <svg viewBox="0 0 40 64" className="h-full w-auto max-h-full text-slate-500/50" fill="currentColor" preserveAspectRatio="xMidYMid meet">
          <circle cx="20" cy="12" r="9" />
          <path d="M20 23c-9 0-15 6-15 14v20a3 3 0 003 3h24a3 3 0 003-3V37c0-8-6-14-15-14z" />
        </svg>
        <span className="mt-0.5 shrink-0 text-[9px] font-medium text-slate-600">NPC</span>
      </div>
    );
  }

  // Поле ввода — выглядит и позиционируется как настоящий инпут в уроке.
  if (element.type === 'input') {
    return (
      <div
        className="flex h-full w-full items-center overflow-hidden"
        style={{
          background: element.style.fill ?? '#ffffff',
          border: `2px solid ${element.style.stroke ?? '#d6d3d1'}`,
          borderRadius: elementBorderRadius(element),
          padding: `0 ${element.style.padding ?? 12}px`,
          justifyContent: element.style.textAlign === 'center' ? 'center' : element.style.textAlign === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        <span className="truncate opacity-60" style={{ color: elementTextColor(element), fontSize: Math.max(9, (element.style.fontSize ?? 22) * 0.7) }}>
          {element.content.placeholder ?? 'Ответ…'}
        </span>
      </div>
    );
  }

  if (element.type === 'timer') {
    const sec = Math.round((element.content.durationMs ?? 5000) / 1000);
    return (
      <div className="flex h-full w-full items-center justify-center gap-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
        <Clock className="h-[38%] w-auto" />
        <span className="font-semibold" style={{ fontSize: Math.max(9, (element.transform.height * 0.28)) }}>{sec}s</span>
      </div>
    );
  }

  if (element.type === 'progress' || element.type === 'indicator') {
    return (
      <div className="flex h-full w-full items-center rounded-full border border-slate-300 bg-slate-100 p-[3px]">
        <div className="h-full w-1/2 rounded-full bg-primary/70" />
      </div>
    );
  }

  if (element.type === 'hotspot' || element.type === 'collision') {
    return <div className="h-full w-full rounded-lg border-2 border-dashed border-sky-400/70 bg-sky-400/10" />;
  }

  if (element.type === 'platform') {
    return <div className="h-full w-full rounded-md border-b-4 border-emerald-700/60 bg-emerald-500/50" />;
  }

  if (element.type === 'audio') {
    return (
      <div className="flex h-full w-full items-center justify-center gap-1 rounded-lg border border-violet-300 bg-violet-50 text-violet-600">
        <Volume2 className="h-[45%] w-auto" />
      </div>
    );
  }

  if (element.type === 'particles') {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-dashed border-fuchsia-300 bg-fuchsia-50/60">
        {[[20, 30], [55, 20], [75, 60], [35, 70], [60, 45]].map(([l, t], i) => (
          <span key={i} className="absolute rounded-full bg-fuchsia-400/70" style={{ left: `${l}%`, top: `${t}%`, width: 5, height: 5 }} />
        ))}
      </div>
    );
  }

  // Незаполненные картиночные типы (фон, предмет, видео…) — заглушка с подписью.
  if (IMAGE_TYPES.includes(element.type)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-primary/40 bg-primary/5 text-center text-[11px] text-primary/70">
        <ImageIcon className="h-4 w-4" />
        {ACADEMY_SCENE_ELEMENT_TYPE_LABELS[element.type]}
      </div>
    );
  }
  if (TEXT_TYPES.includes(element.type)) {
    const hasBg = element.type === 'button' || element.type === 'card' || element.type === 'dialogue';
    const align = element.style.textAlign ?? 'center';
    return (
      <div
        className="flex h-full w-full items-center overflow-hidden"
        style={{
          color: elementTextColor(element),
          fontSize: (element.style.fontSize ?? 24) * 0.7,
          fontWeight: Number(element.style.fontWeight ?? 600),
          fontFamily: element.style.fontFamily,
          background: hasBg ? elementFillColor(element) : 'transparent',
          border: element.style.stroke ? `${element.style.strokeWidth ?? 2}px solid ${element.style.stroke}` : undefined,
          borderRadius: elementBorderRadius(element),
          padding: `0 ${element.style.padding ?? 12}px`,
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          textAlign: align,
        }}
      >
        {element.content.text ?? element.name}
      </div>
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center rounded border border-primary/30 bg-primary/10 text-center text-[10px] text-primary/70">
      {ACADEMY_SCENE_ELEMENT_TYPE_LABELS[element.type]}
    </div>
  );
}

// === Инспектор элемента ===
function ElementInspector({
  element, scene, onSceneChange, onChange, onDelete, onReorder, onPickAsset,
}: {
  element: AcademySceneElement;
  scene: AcademyScene;
  onSceneChange: (scene: AcademyScene) => void;
  onChange: (patch: Partial<AcademySceneElement>) => void;
  onDelete: () => void;
  onReorder: (dir: -1 | 1) => void;
  onPickAsset: () => void;
}) {
  const t = element.transform;
  const setT = (patch: Partial<AcademySceneElement['transform']>) => onChange({ transform: { ...t, ...patch } });
  const setStyle = (patch: Partial<AcademySceneElement['style']>) => onChange({ style: { ...element.style, ...patch } });
  const setContent = (patch: Partial<AcademySceneElement['content']>) => onChange({ content: { ...element.content, ...patch } });

  // Правила, привязанные именно к этому элементу.
  const ownRules = scene.rules.filter((r) => r.event.sourceElementId === element.id);
  const otherElements = scene.layers.flatMap((l) => l.elements).filter((e) => e.id !== element.id);
  const inputElements = scene.layers.flatMap((l) => l.elements).filter((e) => e.type === 'input');
  const [withSound, setWithSound] = useState(true);

  const addClickRule = () => {
    const created = addRule(scene);
    onSceneChange(updateRule(created.scene, created.ruleId, {
      name: `Клик: ${element.name}`,
      event: { type: 'element-click', sourceElementId: element.id },
      actions: [{ type: 'add-score', value: 10 }],
    }));
  };

  // Кнопка проверяет поле ввода: два правила «клик → верно / неверно».
  // Добавляет два встроенных тона (верно/неверно) и возвращает их id — звук без загрузки файлов.
  const ensureTones = (sceneIn: AcademyScene): { scene: AcademyScene; okId: string; noId: string } => {
    const layerId = sceneIn.layers[0]?.id;
    const existingOk = sceneIn.layers.flatMap((l) => l.elements).find((e) => e.type === 'audio' && e.content.sourceUrl === 'tone:success');
    const existingNo = sceneIn.layers.flatMap((l) => l.elements).find((e) => e.type === 'audio' && e.content.sourceUrl === 'tone:wrong');
    let s = sceneIn;
    let okId = existingOk?.id ?? '';
    let noId = existingNo?.id ?? '';
    if (!okId && layerId) {
      const a = addElement(s, layerId, 'audio');
      s = updateElement(a.scene, a.elementId, { name: 'Звук: верно', content: { sourceUrl: 'tone:success', volume: 1 } });
      okId = a.elementId;
    }
    if (!noId && layerId) {
      const b = addElement(s, layerId, 'audio');
      s = updateElement(b.scene, b.elementId, { name: 'Звук: неверно', content: { sourceUrl: 'tone:wrong', volume: 1 } });
      noId = b.elementId;
    }
    return { scene: s, okId, noId };
  };

  const addCheckRules = (inputId: string, withSound: boolean) => {
    onChange({ interactive: true, studentInteractive: true });
    const base = withSound ? ensureTones(scene) : { scene, okId: '', noId: '' };
    const a = addRule(base.scene);
    const s1 = updateRule(a.scene, a.ruleId, {
      name: `Проверка: верно (${element.name})`,
      event: { type: 'element-click', sourceElementId: element.id },
      conditions: [{ type: 'input-correct', elementId: inputId }],
      actions: [{ type: 'add-score', value: 10 }, { type: 'show-hint', value: 'Верно!' }, ...(base.okId ? [{ type: 'play-sound' as const, elementId: base.okId }] : [])],
    });
    const b = addRule(s1);
    const s2 = updateRule(b.scene, b.ruleId, {
      name: `Проверка: неверно (${element.name})`,
      event: { type: 'element-click', sourceElementId: element.id },
      conditions: [{ type: 'input-incorrect', elementId: inputId }],
      actions: [{ type: 'show-hint', value: 'Попробуй ещё раз' }, ...(base.noId ? [{ type: 'play-sound' as const, elementId: base.noId }] : [])],
    });
    onSceneChange(s2);
  };

  // Реакция сцены на выбор варианта ответа (любой правильной/неправильной кнопки).
  const addAnswerReactionRules = (withSound: boolean) => {
    const base = withSound ? ensureTones(scene) : { scene, okId: '', noId: '' };
    const a = addRule(base.scene);
    const s1 = updateRule(a.scene, a.ruleId, {
      name: 'Верный ответ',
      event: { type: 'answer-correct' },
      actions: [{ type: 'add-score', value: 10 }, { type: 'show-hint', value: 'Верно!' }, ...(base.okId ? [{ type: 'play-sound' as const, elementId: base.okId }] : [])],
    });
    const b = addRule(s1);
    const s2 = updateRule(b.scene, b.ruleId, {
      name: 'Неверный ответ',
      event: { type: 'answer-incorrect' },
      actions: [{ type: 'show-hint', value: 'Неверно, попробуй ещё' }, ...(base.noId ? [{ type: 'play-sound' as const, elementId: base.noId }] : [])],
    });
    onSceneChange(s2);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold"><Pencil className="h-4 w-4" /> Элемент</span>
        <button type="button" aria-label="Удалить" className="text-muted-foreground hover:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Название</Label>
        <Input value={element.name} onChange={(e) => onChange({ name: e.target.value })} className="h-8" />
      </div>
      <p className="text-xs text-muted-foreground">Тип: {ACADEMY_SCENE_ELEMENT_TYPE_LABELS[element.type]}</p>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={t.x} onChange={(v) => setT({ x: v })} />
        <NumberField label="Y" value={t.y} onChange={(v) => setT({ y: v })} />
        <NumberField label="Ширина" value={t.width} onChange={(v) => setT({ width: Math.max(1, v) })} />
        <NumberField label="Высота" value={t.height} onChange={(v) => setT({ height: Math.max(1, v) })} />
        <NumberField label="Поворот°" value={t.rotation} onChange={(v) => setT({ rotation: v })} />
        <NumberField label="Прозрачн." value={t.opacity} step={0.1} onChange={(v) => setT({ opacity: Math.min(1, Math.max(0, v)) })} />
      </div>
      {IMAGE_TYPES.includes(element.type) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Материал</Label>
          <Button variant="outline" size="sm" className="w-full" onClick={onPickAsset}>
            <ImageIcon className="mr-1.5 h-4 w-4" /> {element.asset ? 'Заменить материал' : 'Выбрать материал'}
          </Button>
          {element.asset && <p className="truncate text-[11px] text-muted-foreground">{element.asset.kind}</p>}
        </div>
      )}
      {TEXT_TYPES.includes(element.type) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Текст</Label>
          <Input value={element.content.text ?? ''} onChange={(e) => onChange({ content: { ...element.content, text: e.target.value } })} className="h-8" />
        </div>
      )}

      {/* Стиль элемента — совпадает с уроком (WYSIWYG) */}
      {(TEXT_TYPES.includes(element.type) || element.type === 'input') && (
        <div className="space-y-2 rounded-lg border border-border p-2.5">
          <Label className="text-xs font-medium">Оформление</Label>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Цвет текста" value={element.style.textColor} fallback={elementTextColor(element)} onChange={(v) => setStyle({ textColor: v })} />
            {(element.type === 'button' || element.type === 'card' || element.type === 'dialogue' || element.type === 'input') && (
              <ColorField label="Фон" value={element.style.fill} fallback={elementFillColor(element)} onChange={(v) => setStyle({ fill: v })} />
            )}
            <ColorField label="Рамка" value={element.style.stroke} fallback="#d6d3d1" onChange={(v) => setStyle({ stroke: v })} />
            <NumberField label="Размер шрифта" value={element.style.fontSize ?? 24} onChange={(v) => setStyle({ fontSize: Math.max(6, v) })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Насыщенность</span>
              <select value={element.style.fontWeight ?? '600'} onChange={(e) => setStyle({ fontWeight: e.target.value as NonNullable<AcademySceneElement['style']['fontWeight']> })} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
                <option value="400">Обычный</option>
                <option value="500">Средний</option>
                <option value="600">Полужирный</option>
                <option value="700">Жирный</option>
                <option value="800">Очень жирный</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Выравнивание</span>
              <select value={element.style.textAlign ?? 'center'} onChange={(e) => setStyle({ textAlign: e.target.value as 'left' | 'center' | 'right' })} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
                <option value="left">Слева</option>
                <option value="center">По центру</option>
                <option value="right">Справа</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {IMAGE_TYPES.includes(element.type) && (
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Как вписывать картинку</span>
          <select value={element.style.objectFit ?? elementObjectFit(element)} onChange={(e) => setStyle({ objectFit: e.target.value as 'cover' | 'contain' | 'fill' })} className="h-8 rounded-md border border-border bg-background px-2 text-sm">
            <option value="cover">Заполнить (с обрезкой)</option>
            <option value="contain">Целиком (с полями)</option>
            <option value="fill">Растянуть</option>
          </select>
        </label>
      )}

      {/* Поле ввода: правильный ответ и проверка */}
      {element.type === 'input' && (
        <div className="space-y-2 rounded-lg border border-border p-2.5">
          <Label className="text-xs font-medium">Ответ ученика</Label>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Подсказка в поле</span>
            <Input value={element.content.placeholder ?? ''} onChange={(e) => setContent({ placeholder: e.target.value })} placeholder="Например: Введите ответ" className="h-8" />
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Правильный ответ</span>
            <Input value={String(element.content.correctAnswer ?? '')} onChange={(e) => setContent({ correctAnswer: e.target.value })} placeholder="Например: apple" className="h-8" />
          </div>
          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Другие принимаемые ответы (через запятую)</span>
            <Input
              value={(element.content.acceptedValues ?? []).map(String).join(', ')}
              onChange={(e) => setContent({ acceptedValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="яблоко, apples"
              className="h-8"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Сравнение без учёта регистра и пробелов. Проверку запускает кнопка (см. её настройки).</p>
        </div>
      )}

      {/* Кнопка: проверка поля ввода или вариант ответа */}
      {element.type === 'button' && (
        <div className="space-y-2 rounded-lg border border-border p-2.5">
          <Label className="flex items-center gap-1.5 text-xs font-medium"><Zap className="h-3.5 w-3.5 text-primary" /> Роль кнопки</Label>

          <div className="space-y-1.5">
            <span className="text-[11px] text-muted-foreground">Проверять поле ввода</span>
            <label className="flex items-center gap-1.5 text-[11px]">
              <input type="checkbox" checked={withSound} onChange={(e) => setWithSound(e.target.checked)} /> со звуком (тон верно/неверно)
            </label>
            <select
              value=""
              onChange={(e) => { if (e.target.value) addCheckRules(e.target.value, withSound); }}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">+ добавить проверку поля…</option>
              {inputElements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
            </select>
            {inputElements.length === 0 && <p className="text-[11px] text-muted-foreground">Сначала добавьте элемент «Поле ввода».</p>}
          </div>

          <div className="border-t border-border pt-2">
            <span className="text-[11px] text-muted-foreground">Вариант ответа (выбор правильной кнопки)</span>
            <div className="mt-1 flex gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ interactive: true, studentInteractive: true, content: { ...element.content, correctAnswer: true } })}
                className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs', element.content.correctAnswer === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border')}
              >
                ✓ Правильный
              </button>
              <button
                type="button"
                onClick={() => onChange({ interactive: true, studentInteractive: true, content: { ...element.content, correctAnswer: false } })}
                className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs', element.content.correctAnswer === false ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-border')}
              >
                ✗ Неправильный
              </button>
            </div>
            {element.content.correctAnswer !== undefined && (
              <button type="button" onClick={() => { const c = { ...element.content }; delete c.correctAnswer; onChange({ content: c }); }} className="mt-1 text-[11px] text-muted-foreground hover:underline">
                убрать роль варианта
              </button>
            )}
            <p className="mt-1 text-[11px] text-muted-foreground">Отметьте варианты; реакцию на верный/неверный ответ добавьте кнопкой ниже.</p>
            <label className="mt-1 flex items-center gap-1.5 text-[11px]">
              <input type="checkbox" checked={withSound} onChange={(e) => setWithSound(e.target.checked)} /> со звуком (тон верно/неверно)
            </label>
            <Button variant="outline" size="sm" className="mt-1 h-7 w-full text-xs" onClick={() => addAnswerReactionRules(withSound)}>
              + реакция на верный/неверный ответ
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={element.visible} onChange={(e) => onChange({ visible: e.target.checked })} /> Виден</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={element.studentInteractive} onChange={(e) => onChange({ studentInteractive: e.target.checked })} /> Доступен ученику</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={element.teacherVisible} onChange={(e) => onChange({ teacherVisible: e.target.checked })} /> Виден учителю</label>
      </div>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder(-1)}>Ниже</Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder(1)}>Выше</Button>
      </div>

      {/* События именно этого элемента */}
      <div className="space-y-2 rounded-lg border border-border p-2.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-xs font-medium"><Zap className="h-3.5 w-3.5 text-primary" /> Что происходит при клике</Label>
          <Button variant="outline" size="sm" className="h-7 px-2" onClick={addClickRule}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {ownRules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Нет действий. Нажмите «+», чтобы ученик, кликнув по элементу, получал очки, открывал объект и т.д.</p>
        ) : (
          <div className="space-y-2">
            {ownRules.map((rule) => (
              <div key={rule.id} className="rounded-md border border-border bg-muted/40 p-2">
                <div className="mb-1 flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{rule.name}</span>
                  <button
                    type="button"
                    aria-label="Удалить действие"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onSceneChange(removeRule(scene, rule.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {rule.actions.map((action, idx) => (
                  <div key={idx} className="mb-1 flex flex-wrap items-center gap-1">
                    <select
                      value={action.type}
                      onChange={(e) => onSceneChange(updateRule(scene, rule.id, {
                        actions: rule.actions.map((a, i) => (i === idx ? { ...a, type: e.target.value as typeof a.type } : a)),
                      }))}
                      className="rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                    >
                      {ACADEMY_SCENE_ACTION_TYPES.map((tp) => <option key={tp} value={tp}>{ELEMENT_ACTION_LABELS[tp] ?? tp}</option>)}
                    </select>
                    {['show-element', 'hide-element', 'toggle-element', 'play-sound', 'set-pose', 'play-animation'].includes(action.type) && (
                      <select
                        value={action.elementId ?? ''}
                        onChange={(e) => onSceneChange(updateRule(scene, rule.id, {
                          actions: rule.actions.map((a, i) => (i === idx ? { ...a, elementId: e.target.value || undefined } : a)),
                        }))}
                        className="rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                      >
                        <option value="">— элемент —</option>
                        {otherElements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
                        <option value={element.id}>(этот элемент)</option>
                      </select>
                    )}
                    {action.type === 'add-score' && (
                      <input
                        type="number"
                        value={typeof action.value === 'number' ? action.value : 10}
                        onChange={(e) => onSceneChange(updateRule(scene, rule.id, {
                          actions: rule.actions.map((a, i) => (i === idx ? { ...a, value: Number(e.target.value) } : a)),
                        }))}
                        className="h-6 w-14 rounded border border-border bg-background px-1 text-[11px]"
                      />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => onSceneChange(updateRule(scene, rule.id, { actions: [...rule.actions, { type: 'add-score', value: 10 }] }))}
                >
                  + действие
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Сложные правила (условия, таймеры, клавиши) — в панели «Правила» внизу.</p>
      </div>
    </div>
  );
}

// === Инспектор сцены ===
function SceneInspector({ scene, onChange, onGenerateBg, onPickBg }: {
  scene: AcademyScene;
  onChange: (scene: AcademyScene) => void;
  onGenerateBg: () => void;
  onPickBg: () => void;
}) {
  const hasBackground = scene.layers.some((l) => l.elements.some((e) => e.type === 'background' && e.asset));
  const gen = (scene as { generation?: { mode?: string; prompt?: string } }).generation ?? { mode: 'layered' };
  const fullAi = gen.mode === 'full-ai';
  const lab = (scene as { lab?: { tokens: number; videoAllowed: boolean } }).lab;
  const isLab = Boolean(lab);
  return (
    <div className="space-y-3">
      <span className="text-sm font-semibold">Сцена</span>
      <div className="space-y-1.5">
        <Label className="text-xs">Название сцены</Label>
        <Input value={scene.title} onChange={(e) => onChange({ ...scene, title: e.target.value })} className="h-8" />
      </div>

      {/* Сцена-лаборатория: вместо интерактивной сцены — нейролаборатория */}
      <div className="space-y-1.5 rounded-lg border border-violet-300 bg-violet-50/60 p-2.5">
        <label className="flex items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={isLab}
            onChange={(e) => {
              const next = { ...scene } as AcademyScene & { lab?: { tokens: number; videoAllowed: boolean } };
              if (e.target.checked) next.lab = { tokens: 20, videoAllowed: true };
              else delete next.lab;
              onChange(next);
            }}
          />
          Сцена-лаборатория (нейролаборатория вместо сцены)
        </label>
        {isLab && lab && (
          <div className="space-y-1.5 pl-5">
            <label className="flex items-center gap-2 text-[11px]">
              Токенов ребёнку на урок:
              <input
                type="number" min={0} max={1000} value={lab.tokens}
                onChange={(e) => onChange({ ...scene, lab: { ...lab, tokens: Math.max(0, Number(e.target.value)) } } as AcademyScene)}
                className="h-7 w-20 rounded border border-border bg-background px-2 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={lab.videoAllowed} onChange={(e) => onChange({ ...scene, lab: { ...lab, videoAllowed: e.target.checked } } as AcademyScene)} />
              разрешить видео-модели
            </label>
            <p className="text-[11px] text-muted-foreground">Токены начисляются один раз при старте урока, тратятся только в уроке, кошелёк семьи не трогается.</p>
          </div>
        )}
      </div>

      {/* Режим генерации сцены (A6.6) */}
      <div className="space-y-1.5 rounded-lg border border-primary/30 bg-accent/40 p-2.5">
        <Label className="text-xs font-medium">Режим сцены</Label>
        <div className="flex gap-1">
          <button type="button" onClick={() => onChange({ ...scene, generation: { mode: 'layered', prompt: gen.prompt } } as AcademyScene)}
            className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs', !fullAi ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
            Послойная
          </button>
          <button type="button" onClick={() => onChange({ ...scene, generation: { mode: 'full-ai', prompt: gen.prompt } } as AcademyScene)}
            className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs', fullAi ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
            Цельная AI-сцена
          </button>
        </div>
        {fullAi && (
          <>
            <Textarea
              value={gen.prompt ?? ''}
              onChange={(e) => onChange({ ...scene, generation: { mode: 'full-ai', prompt: e.target.value } } as AcademyScene)}
              rows={3}
              placeholder="Опиши сцену целиком: где ребёнок, что делает, окружение, стиль…"
            />
            <p className="text-[11px] text-muted-foreground">В шаблоне — абстрактный вид. При подготовке урока для ученика вся иллюстрация сгенерируется по его референсу.</p>
          </>
        )}
      </div>

      {!fullAi && (
        <div className="space-y-1.5 rounded-lg border border-border p-2.5">
          <Label className="text-xs font-medium">Фон-иллюстрация {hasBackground && <span className="text-primary">✓</span>}</Label>
          <Button variant="default" size="sm" className="w-full" onClick={onGenerateBg}>
            <ImageIcon className="mr-1.5 h-4 w-4" /> Сгенерировать по промпту
          </Button>
          <Button variant="outline" size="sm" className="w-full" onClick={onPickBg}>Выбрать из библиотеки</Button>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Цвет фона (если нет иллюстрации)</Label>
        <input type="color" value={scene.viewport.backgroundColor} onChange={(e) => onChange({ ...scene, viewport: { ...scene.viewport, backgroundColor: e.target.value } })} className="h-8 w-full rounded border border-border" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Образовательная цель</Label>
        <Input
          value={scene.metadata?.educationalGoal ?? ''}
          onChange={(e) => onChange({ ...scene, metadata: { ...scene.metadata, tags: scene.metadata?.tags ?? [], educationalGoal: e.target.value } })}
          className="h-8"
        />
      </div>
      <p className="rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
        Выберите элемент слева, чтобы редактировать его свойства. Двигайте элементы мышью на холсте.
      </p>
    </div>
  );
}
