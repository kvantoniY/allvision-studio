'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  ACADEMY_SCENE_ACTION_TYPES,
  ACADEMY_SCENE_CONDITION_TYPES,
  ACADEMY_SCENE_EVENT_TYPES,
  addRule,
  removeRule,
  updateRule,
  type AcademyScene,
  type AcademySceneAction,
  type AcademySceneRule,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const EVENT_LABELS: Record<string, string> = {
  'scene-start': 'Старт сцены', 'element-click': 'Клик по элементу', 'key-press': 'Нажата клавиша',
  'drag-start': 'Начало перетаскивания', 'drag-end': 'Конец перетаскивания', drop: 'Брошено',
  'answer-correct': 'Верный ответ', 'answer-incorrect': 'Неверный ответ', 'timer-finished': 'Таймер истёк',
  'teacher-action': 'Действие учителя', 'video-ended': 'Видео закончилось', 'ai-result': 'Результат AI',
  'code-result': 'Результат кода', custom: 'Своё событие',
};
const CONDITION_LABELS: Record<string, string> = {
  always: 'Всегда', 'state-is': 'Состояние = ', 'state-is-not': 'Состояние ≠ ',
  'variable-equals': 'Переменная =', 'variable-not-equals': 'Переменная ≠', 'variable-greater-than': 'Переменная >',
  'variable-less-than': 'Переменная <', 'score-at-least': 'Очки ≥', 'score-below': 'Очки <',
  'element-visible': 'Элемент виден', 'element-hidden': 'Элемент скрыт', 'role-is': 'Роль =', 'answer-is-correct': 'Ответ верный',
};
const ACTION_LABELS: Record<string, string> = {
  'show-element': 'Показать элемент', 'hide-element': 'Скрыть элемент', 'toggle-element': 'Переключить элемент',
  'play-sound': 'Проиграть звук', 'set-pose': 'Сменить позу', 'play-animation': 'Анимация',
  'add-score': 'Добавить очки', 'show-hint': 'Показать подсказку', 'set-state': 'Сменить состояние сцены',
  'set-variable': 'Задать переменную', 'allow-transition': 'Разрешить переход', 'next-scene': 'Следующая сцена', 'emit-event': 'Отправить событие',
};

function sel(value: string, onChange: (v: string) => void, options: readonly string[], labels: Record<string, string>) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
      {options.map((o) => <option key={o} value={o}>{labels[o] ?? o}</option>)}
    </select>
  );
}

export function RulesEditor({
  scene,
  onChange,
}: {
  scene: AcademyScene;
  onChange: (scene: AcademyScene) => void;
}) {
  const elements = scene.layers.flatMap((l) => l.elements);
  const patchRule = (id: string, patch: Partial<AcademySceneRule>) => onChange(updateRule(scene, id, patch));

  const setAction = (rule: AcademySceneRule, idx: number, patch: Partial<AcademySceneAction>) => {
    const actions = rule.actions.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    patchRule(rule.id, { actions });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Правила: событие → условие → действие</h3>
        <Button size="sm" variant="outline" onClick={() => onChange(addRule(scene).scene)}>
          <Plus className="mr-1 h-4 w-4" /> Правило
        </Button>
      </div>
      {scene.rules.length === 0 && <p className="text-sm text-muted-foreground">Пока нет правил. Например: клик по цифре → добавить очки → показать подсказку.</p>}
      <div className="space-y-2">
        {scene.rules.map((rule) => (
          <div key={rule.id} className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2">
              <input type="checkbox" checked={rule.enabled} onChange={(e) => patchRule(rule.id, { enabled: e.target.checked })} />
              <Input value={rule.name} onChange={(e) => patchRule(rule.id, { name: e.target.value })} className="h-8 flex-1" />
              <button type="button" aria-label="Удалить правило" className="text-muted-foreground hover:text-destructive" onClick={() => onChange(removeRule(scene, rule.id))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {/* Событие */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Когда:</span>
              {sel(rule.event.type, (v) => patchRule(rule.id, { event: { ...rule.event, type: v as typeof rule.event.type } }), ACADEMY_SCENE_EVENT_TYPES, EVENT_LABELS)}
              {['element-click', 'drag-start', 'drag-end', 'drop'].includes(rule.event.type) && (
                <select
                  value={rule.event.sourceElementId ?? ''}
                  onChange={(e) => patchRule(rule.id, { event: { ...rule.event, sourceElementId: e.target.value || undefined } })}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">— элемент —</option>
                  {elements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
                </select>
              )}
              {rule.event.type === 'key-press' && (
                <Input
                  value={rule.event.key ?? ''}
                  onChange={(e) => patchRule(rule.id, { event: { ...rule.event, key: e.target.value } })}
                  placeholder="клавиша"
                  className="h-7 w-24"
                />
              )}
            </div>
            {/* Действия */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Тогда:</span>
              {rule.actions.map((action, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                  {sel(action.type, (v) => setAction(rule, idx, { type: v as AcademySceneAction['type'] }), ACADEMY_SCENE_ACTION_TYPES, ACTION_LABELS)}
                  {['show-element', 'hide-element', 'toggle-element', 'play-sound', 'set-pose', 'play-animation'].includes(action.type) && (
                    <select value={action.elementId ?? ''} onChange={(e) => setAction(rule, idx, { elementId: e.target.value || undefined })} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                      <option value="">— элемент —</option>
                      {elements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
                    </select>
                  )}
                  {action.type === 'add-score' && (
                    <Input type="number" value={typeof action.value === 'number' ? action.value : 10} onChange={(e) => setAction(rule, idx, { value: Number(e.target.value) })} className="h-7 w-20" />
                  )}
                  {['set-pose', 'play-animation', 'show-hint'].includes(action.type) && (
                    <Input value={typeof action.value === 'string' ? action.value : ''} onChange={(e) => setAction(rule, idx, { value: e.target.value })} placeholder="значение" className="h-7 w-32" />
                  )}
                  {action.type === 'set-state' && (
                    <select value={action.stateId ?? ''} onChange={(e) => setAction(rule, idx, { stateId: e.target.value || undefined })} className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                      <option value="">— состояние —</option>
                      {scene.states.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {rule.actions.length > 1 && (
                    <button type="button" aria-label="Убрать действие" className="text-muted-foreground hover:text-destructive" onClick={() => patchRule(rule.id, { actions: rule.actions.filter((_, i) => i !== idx) })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => patchRule(rule.id, { actions: [...rule.actions, { type: 'add-score', value: 10 } as AcademySceneAction] })}
              >
                + действие
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
