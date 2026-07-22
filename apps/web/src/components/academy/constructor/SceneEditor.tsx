'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, ChevronLeft, ChevronRight, Copy, Eye, Image as ImageIcon, Layers, Loader2, Pencil, Plus, Redo2, Trash2, Undo2,
} from 'lucide-react';
import {
  ACADEMY_SCENE_ELEMENT_TYPES,
  ACADEMY_SCENE_ELEMENT_TYPE_LABELS,
  ACADEMY_SCENE_LAYER_KINDS,
  createEmptyScene,
  addElement,
  addLayer,
  patchElementTransform,
  removeElement,
  removeLayer,
  reorderElement,
  updateElement,
  attachAsset,
  setSceneBackground,
  validateScene,
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

const IMAGE_TYPES = ['background', 'animated-background', 'foreground', 'image', 'character', 'npc', 'prop', 'video'];
const TEXT_TYPES = ['text', 'dialogue', 'button', 'card'];

/** Читает документ урока: массив сцен из `{scenes:[]}` или обёртка одиночной сцены. */
function documentFrom(raw: unknown, title: string): AcademyScene[] {
  if (raw && typeof raw === 'object') {
    const r = raw as { scenes?: unknown; layers?: unknown };
    if (Array.isArray(r.scenes) && r.scenes.length > 0) return r.scenes as AcademyScene[];
    if (Array.isArray(r.layers)) return [raw as AcademyScene];
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
        {/* Слои и элементы */}
        <div className="flex min-h-0 flex-col overflow-y-auto rounded-xl border border-border bg-card p-3">
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
                <span className="truncate text-xs font-medium text-muted-foreground">{layer.name}</span>
                <div className="flex items-center gap-1">
                  <select
                    onChange={(e) => { if (e.target.value) { apply(addElement(scene, layer.id, e.target.value as AcademySceneElement['type']).scene); e.target.value = ''; } }}
                    className="rounded border border-border bg-background px-1 text-[11px]"
                    value=""
                  >
                    <option value="">+ элемент</option>
                    {ACADEMY_SCENE_ELEMENT_TYPES.map((t) => <option key={t} value={t}>{ACADEMY_SCENE_ELEMENT_TYPE_LABELS[t]}</option>)}
                  </select>
                  {scene.layers.length > 1 && (
                    <button type="button" aria-label="Удалить слой" className="text-muted-foreground hover:text-destructive" onClick={() => apply(removeLayer(scene, layer.id))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 space-y-0.5">
                {layer.elements.map((el) => (
                  <button
                    key={el.id}
                    type="button"
                    onClick={() => setSelectedId(el.id)}
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
  const drag = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent, el: AcademySceneElement) => {
    e.stopPropagation();
    onSelect(el.id);
    onBeginDrag();
    drag.current = { id: el.id, startX: e.clientX, startY: e.clientY, ox: el.transform.x, oy: el.transform.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.startX) / scale;
    const dy = (e.clientY - drag.current.startY) / scale;
    onApply(patchElementTransform(scene, drag.current.id, { x: Math.round(drag.current.ox + dx), y: Math.round(drag.current.oy + dy) }));
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
        onClick={() => onSelect('')}
      >
        {layers.filter((l) => l.visible).map((layer) =>
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
            </div>
          )),
        )}
      </div>
    </div>
  );
}

function ElementVisual({ element }: { element: AcademySceneElement }) {
  if (IMAGE_TYPES.includes(element.type)) {
    if (element.asset?.fileUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={element.asset.fileUrl} alt={element.name} className="h-full w-full object-contain" draggable={false} />;
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-primary/40 bg-primary/5 text-center text-[11px] text-primary/70">
        <ImageIcon className="h-4 w-4" />
        {ACADEMY_SCENE_ELEMENT_TYPE_LABELS[element.type]}
      </div>
    );
  }
  if (TEXT_TYPES.includes(element.type)) {
    return (
      <div
        className={cn('flex h-full w-full items-center justify-center overflow-hidden px-1 text-center', (element.type === 'button' || element.type === 'card') && 'rounded-lg')}
        style={{
          color: element.style.fill ?? '#1f2937',
          fontSize: (element.style.fontSize ?? 24) * 0.7,
          fontWeight: Number(element.style.fontWeight ?? 600),
          background: element.type === 'button' ? 'hsl(24 94% 50%)' : element.type === 'card' ? '#ffffff' : 'transparent',
          border: element.type === 'card' ? '1px solid #e5e7eb' : undefined,
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
  element, onChange, onDelete, onReorder, onPickAsset,
}: {
  element: AcademySceneElement;
  onChange: (patch: Partial<AcademySceneElement>) => void;
  onDelete: () => void;
  onReorder: (dir: -1 | 1) => void;
  onPickAsset: () => void;
}) {
  const t = element.transform;
  const setT = (patch: Partial<AcademySceneElement['transform']>) => onChange({ transform: { ...t, ...patch } });
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
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={element.visible} onChange={(e) => onChange({ visible: e.target.checked })} /> Виден</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={element.studentInteractive} onChange={(e) => onChange({ studentInteractive: e.target.checked })} /> Доступен ученику</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={element.teacherVisible} onChange={(e) => onChange({ teacherVisible: e.target.checked })} /> Виден учителю</label>
      </div>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder(-1)}>Ниже</Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onReorder(1)}>Выше</Button>
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
  return (
    <div className="space-y-3">
      <span className="text-sm font-semibold">Сцена</span>
      <div className="space-y-1.5">
        <Label className="text-xs">Название сцены</Label>
        <Input value={scene.title} onChange={(e) => onChange({ ...scene, title: e.target.value })} className="h-8" />
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
