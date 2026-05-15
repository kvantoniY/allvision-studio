'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { PublicScenarioTemplate } from '@allvision/shared';
import { ArrowLeft, ArrowRight, CheckCircle2, Settings2, Sparkles, Users } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { TEMPLATE_CATEGORY_LABEL } from '@/components/studio/v3-labels';
import { toast } from '@/hooks/use-toast';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useListCharactersQuery } from '@/store/api/characters-api';
import { useCreateEpisodeMutation } from '@/store/api/episodes-api';
import { useListScenesQuery } from '@/store/api/scenes-api';
import { useListPublicScenarioTemplatesQuery } from '@/store/api/public-scenario-templates-api';
import { cn } from '@/lib/utils';

import { TokenIcon } from '@/components/ui/token-icon';
type StepKey = 'template' | 'characters' | 'scene' | 'settings' | 'confirm';

const styles = ['realistic', 'cinematic', 'cartoon', 'vintage'];
const ratios = ['9:16', '16:9', '1:1'];

function categoryLabel(category: string) {
  return TEMPLATE_CATEGORY_LABEL[category] ?? category;
}

function TemplateOption({ template, selected, onSelect }: {
  template: PublicScenarioTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'overflow-hidden rounded-lg border bg-slate-950 text-left transition hover:border-violet-500',
        selected ? 'border-violet-400 ring-2 ring-violet-500/30' : 'border-slate-800',
      )}
    >
      <div className="aspect-video bg-slate-900">
        {template.previewImage ? (
          <img src={template.previewImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-slate-600">
            <Sparkles className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="bg-slate-800 text-slate-200">{categoryLabel(template.category)}</Badge>
          <Badge className="bg-violet-600 text-white">{template.priceTokens} токенов</Badge>
        </div>
        <div className="font-semibold text-white">{template.title}</div>
        <p className="line-clamp-2 text-sm leading-6 text-slate-400">{template.shortDesc}</p>
      </div>
    </button>
  );
}

export default function NewEpisodePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const templateIdFromUrl = searchParams.get('templateId');
  const { data: templatesData, isLoading: isTemplatesLoading } = useListPublicScenarioTemplatesQuery();
  const { data: charactersData } = useListCharactersQuery({ status: 'READY' });
  const { data: scenesData } = useListScenesQuery();
  const { data: meData } = useGetMeQuery();
  const [createEpisode, createState] = useCreateEpisodeMutation();

  const templates = useMemo(() => templatesData?.templates ?? [], [templatesData?.templates]);
  const characters = charactersData?.items ?? [];
  const scenes = scenesData?.items ?? [];
  const balance = meData?.user?.tokenBalance ?? 0;

  const [initialized, setInitialized] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(templateIdFromUrl);
  const [roleAssignments, setRoleAssignments] = useState<Record<number, string>>({});
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [style, setStyle] = useState('cinematic');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customScenario, setCustomScenario] = useState('');

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates],
  );
  const selectedTemplateDefaultId = selectedTemplate?.id;
  const selectedTemplateDefaultDuration = selectedTemplate?.recommendedDuration ?? 10;
  const selectedTemplateDefaultStyle = selectedTemplate?.defaultStyle ?? 'cinematic';

  const steps = useMemo<StepKey[]>(
    () => ['template', 'characters', ...(selectedTemplate?.needsScene ? ['scene' as const] : []), 'settings', 'confirm'],
    [selectedTemplate?.needsScene],
  );
  const currentStep = steps[stepIndex] ?? steps[0];

  useEffect(() => {
    if (initialized || isTemplatesLoading) return;
    if (templateIdFromUrl && templates.some((template) => template.id === templateIdFromUrl)) {
      setSelectedTemplateId(templateIdFromUrl);
      setStepIndex(1);
    }
    setInitialized(true);
  }, [initialized, isTemplatesLoading, templateIdFromUrl, templates]);

  useEffect(() => {
    if (!selectedTemplateDefaultId) return;
    setDurationSeconds(selectedTemplateDefaultDuration);
    setStyle(selectedTemplateDefaultStyle);
    setRoleAssignments({});
    setSelectedSceneId(null);
  }, [selectedTemplateDefaultId, selectedTemplateDefaultDuration, selectedTemplateDefaultStyle]);

  useEffect(() => {
    if (stepIndex >= steps.length) setStepIndex(steps.length - 1);
  }, [stepIndex, steps.length]);

  const requiredRolesReady = useMemo(() => {
    if (!selectedTemplate) return false;
    return selectedTemplate.characterRoles.every((role, index) => !role.required || Boolean(roleAssignments[index]));
  }, [roleAssignments, selectedTemplate]);

  const selectedCharacterIds = useMemo(
    () => selectedTemplate?.characterRoles.map((_, index) => roleAssignments[index]).filter(Boolean) ?? [],
    [roleAssignments, selectedTemplate],
  );

  const validateCurrentStep = () => {
    if (currentStep === 'template' && !selectedTemplate) {
      toast({ title: 'Выберите сценарий', variant: 'destructive' });
      return false;
    }
    if (currentStep === 'characters' && !requiredRolesReady) {
      toast({ title: 'Заполните обязательные роли', variant: 'destructive' });
      return false;
    }
    if (currentStep === 'scene' && selectedTemplate?.needsScene && !selectedSceneId) {
      toast({ title: 'Выберите сцену', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateCurrentStep()) return;
    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  const submit = async () => {
    if (!selectedTemplate || !requiredRolesReady) return;
    if (selectedTemplate.needsScene && !selectedSceneId) return;
    if (balance < selectedTemplate.priceTokens) {
      toast({ title: 'Недостаточно токенов', variant: 'destructive' });
      return;
    }

    try {
      const result = await createEpisode({
        templateId: selectedTemplate.id,
        characterIds: selectedCharacterIds,
        sceneId: selectedTemplate.needsScene ? selectedSceneId ?? undefined : undefined,
        durationSeconds,
        style,
        aspectRatio,
        customScenario: customScenario.trim() || undefined,
      }).unwrap();
      toast({ title: 'Эпизод создан. Генерация запущена' });
      router.push(`/dashboard/episodes/${result.episode.id}?status=processing`);
    } catch (error) {
      const code = (error as { data?: { error?: { code?: string } } })?.data?.error?.code;
      toast({
        title: code === 'INSUFFICIENT_TOKENS' ? 'Недостаточно токенов' : 'Не удалось создать эпизод',
        variant: 'destructive',
      });
    }
  };

  if (isTemplatesLoading && templates.length === 0) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-[520px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/episodes">
          <ArrowLeft className="h-4 w-4" />
          К эпизодам
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Создать эпизод</h1>
          <p className="mt-1 text-slate-400">Шаг {stepIndex + 1} из {steps.length}</p>
        </div>
        <div className="flex gap-2">
          {steps.map((step, index) => (
            <span
              key={step}
              className={cn('h-2.5 w-10 rounded-full', index <= stepIndex ? 'bg-violet-400' : 'bg-slate-800')}
            />
          ))}
        </div>
      </div>

      {selectedTemplate && currentStep !== 'template' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div>
            <div className="text-sm text-slate-400">Выбранный сценарий</div>
            <div className="font-semibold">{selectedTemplate.title}</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setStepIndex(0)}>
            Сменить
          </Button>
        </div>
      )}

      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-6 p-6">
          {currentStep === 'template' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Выбор сценария</h2>
                <p className="mt-1 text-sm text-slate-400">Начните с готового шаблона. Featured сценарии показаны первыми.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <TemplateOption
                    key={template.id}
                    template={template}
                    selected={selectedTemplateId === template.id}
                    onSelect={() => setSelectedTemplateId(template.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {currentStep === 'characters' && selectedTemplate && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-violet-500/10 text-violet-300">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">Выберите героев для сценария «{selectedTemplate.title}»</h2>
                  <p className="text-sm text-slate-400">Доступны только персонажи со статусом READY.</p>
                </div>
              </div>

              {characters.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-8 text-center">
                  <p className="text-slate-400">У вас ещё нет готовых персонажей.</p>
                  <Button asChild className="mt-4">
                    <Link href="/dashboard/characters/new">Создать персонажа</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {selectedTemplate.characterRoles.map((role, roleIndex) => {
                    const selectedForRole = roleAssignments[roleIndex];
                    return (
                      <div key={`${role.role}-${roleIndex}`} className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{role.label}</h3>
                          <Badge className={role.required ? 'bg-violet-600 text-white' : 'bg-slate-700 text-white'}>
                            {role.required ? 'Обязательно' : 'Опционально'}
                          </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {characters.map((character) => {
                            const image = character.referenceImages[character.primaryImageId] ?? character.referenceImages[0];
                            const usedElsewhere = Object.entries(roleAssignments).some(
                              ([index, characterId]) => Number(index) !== roleIndex && characterId === character.id,
                            );
                            const disabled = usedElsewhere && selectedForRole !== character.id;
                            return (
                              <button
                                key={character.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => setRoleAssignments((current) => ({ ...current, [roleIndex]: character.id }))}
                                className={cn(
                                  'overflow-hidden rounded-md border bg-slate-950 text-left transition',
                                  selectedForRole === character.id ? 'border-violet-400 ring-2 ring-violet-500/30' : 'border-slate-800 hover:border-violet-500/60',
                                  disabled && 'cursor-not-allowed opacity-40',
                                )}
                              >
                                <div className="aspect-square bg-slate-900">
                                  {image && <img src={image} alt="" className="h-full w-full object-cover" />}
                                </div>
                                <div className="p-3 text-sm font-medium">{character.name}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {currentStep === 'scene' && selectedTemplate?.needsScene && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">Выберите сцену</h2>
                <p className="mt-1 text-sm text-slate-400">Этот сценарий использует вашу локацию или атмосферу.</p>
              </div>
              {scenes.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-8 text-center">
                  <p className="text-slate-400">У вас ещё нет сцен.</p>
                  <Button asChild className="mt-4">
                    <Link href="/dashboard/scenes/new">Создать сцену</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {scenes.map((scene) => {
                    const image = scene.referenceImages[0];
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => setSelectedSceneId(scene.id)}
                        className={cn(
                          'overflow-hidden rounded-md border bg-slate-950 text-left transition',
                          selectedSceneId === scene.id ? 'border-violet-400 ring-2 ring-violet-500/30' : 'border-slate-800 hover:border-violet-500/60',
                        )}
                      >
                        <div className="aspect-video bg-slate-900">
                          {image && <img src={image} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="space-y-1 p-4">
                          <div className="font-semibold">{scene.name}</div>
                          <p className="line-clamp-2 text-sm text-slate-400">{scene.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {currentStep === 'settings' && selectedTemplate && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-800 text-slate-200">
                  <Settings2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">Параметры</h2>
                  <p className="text-sm text-slate-400">Дополнительные настройки можно оставить как есть.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((current) => !current)}
                className="rounded-md border border-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                {showAdvanced ? 'Скрыть настройки' : 'Открыть настройки'}
              </button>

              {showAdvanced && (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="duration">Длительность, сек</Label>
                    <Input
                      id="duration"
                      type="number"
                      min={3}
                      max={30}
                      value={durationSeconds}
                      onChange={(event) => setDurationSeconds(Number(event.target.value))}
                    />
                    <p className="text-xs text-slate-500">Рекомендуемая: {selectedTemplate.recommendedDuration} сек</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="style">Стиль</Label>
                    <select
                      id="style"
                      value={style}
                      onChange={(event) => setStyle(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                    >
                      {styles.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <Label>Формат</Label>
                    <div className="flex flex-wrap gap-2">
                      {ratios.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setAspectRatio(item)}
                          className={cn(
                            'rounded-md border px-4 py-2 text-sm',
                            aspectRatio === item ? 'border-violet-400 bg-violet-500/10' : 'border-slate-800 bg-slate-950',
                          )}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor="customScenario">Изменить сценарий</Label>
                    <Textarea
                      id="customScenario"
                      value={customScenario}
                      onChange={(event) => setCustomScenario(event.target.value.slice(0, 500))}
                      rows={5}
                      placeholder="Для опытных: свой текст сценария до 500 символов"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 'confirm' && selectedTemplate && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Подтверждение</h2>
                <p className="mt-1 text-sm text-slate-400">Проверьте детали перед запуском генерации.</p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">Сценарий</div>
                  <div className="mt-1 font-semibold">{selectedTemplate.title}</div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
                  <div className="text-sm text-slate-400">Параметры</div>
                  <div className="mt-1 font-semibold">{durationSeconds} сек, {style}, {aspectRatio}</div>
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm text-slate-400">Цена</div>
                <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-white">
                  <TokenIcon className="h-5 w-5 text-amber-400" />
                  {selectedTemplate.priceTokens} токенов
                </div>
                <div className="mt-2 text-sm text-slate-400">Ваш баланс: {balance} токенов</div>
              </div>
              {balance < selectedTemplate.priceTokens && (
                <Alert variant="destructive" className="border-red-500/40 bg-red-500/10">
                  <AlertTitle>Недостаточно токенов</AlertTitle>
                  <AlertDescription>Пополните баланс, чтобы создать эпизод.</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-6 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={stepIndex === 0 || createState.isLoading}
            >
              Назад
            </Button>
            {currentStep !== 'confirm' ? (
              <Button type="button" onClick={next} disabled={createState.isLoading}>
                Далее
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : balance < (selectedTemplate?.priceTokens ?? 0) ? (
              <Button asChild>
                <Link href="/pricing">Пополнить</Link>
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={createState.isLoading || !selectedTemplate}>
                <CheckCircle2 className="h-4 w-4" />
                Создать эпизод за {selectedTemplate?.priceTokens ?? 0} токенов
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
