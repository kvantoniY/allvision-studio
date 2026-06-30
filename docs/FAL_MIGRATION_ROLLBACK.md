# Миграция на fal.ai — точка отката и реестр PiAPI

Этот документ — страховка на время перехода с PiAPI на fal.ai. Здесь зафиксировано:
текущее рабочее состояние PiAPI, полный реестр моделей и **как мгновенно откатиться**, если
fal-ветка поведёт себя плохо в проде.

## Точка отката (git)

- Тег: `pre-fal-migration-20260630` — последнее состояние, где провайдер только PiAPI.
- Откат кода целиком: `git checkout pre-fal-migration-20260630` (или деплой этого тега).

## Стратегия миграции (почему откат быстрый)

Переход **аддитивный**, ничего из PiAPI не удаляется:

- Добавлен режим `PROVIDER_MODE=fal` рядом с существующими `mock` / `piapi`.
- `PiAPIProvider` и весь его код **остаются на месте** и продолжают работать при `PROVIDER_MODE=piapi`.
- `PIAPI_API_KEY` и прочие PiAPI/прокси env в `shared/.env` на проде **НЕ удаляются** — они нужны
  для (а) мгновенного отката и (б) гибридного режима, где нишевые блоки остаются на PiAPI.

### Мгновенный откат в проде (без передеплоя)

1. На ВМ: `nano /opt/allvision-studio/shared/.env`
2. Поменять `PROVIDER_MODE=fal` обратно на `PROVIDER_MODE=piapi`
3. Перезапустить воркер: `docker compose -f infra/prod/docker-compose.prod.yml restart worker`
4. Готово — снова 100% PiAPI. Новые задачи идут через PiAPI, fal больше не вызывается.

> Важно: пока идёт миграция, **не удаляйте `PIAPI_API_KEY` из `shared/.env`**. Это и есть
> «запомненный ключ для отката»: секрет остаётся там же, где был, и сразу подхватывается при
> возврате `PROVIDER_MODE=piapi`. Дублировать секрет в git/доках намеренно НЕ делаем.

## Реестр PiAPI-моделей (как было до fal)

Источник истины — `apps/worker/src/providers/piapi-provider.ts`. Снимок на момент тега:

### image-edit (`imageEdit`)
| slug | PiAPI model | task_type | вход-картинки | ~цена USD |
|---|---|---|---|---|
| `nano-banana` | `gemini` | `nano-banana-2` | да (до 14) | 0.06 (1K) / 0.08 (2K) / 0.12 (4K) |
| `flux-schnell` | `Qubico/flux1-schnell` | `txt2img` | нет | 0.003 |
| `flux-dev` | `Qubico/flux1-dev` | `txt2img` | нет | 0.025 |
| `seedream-5-lite` | `seedream` | `seedream-5-lite` | да (до 6) | 0.028 |
| `gpt-image-2` | OpenAI-совм. `/v1/images/generations\|edits` (через прокси `PIAPI_PROXY_URL`) | — | да (до 10) | ~0.10 |

### image-to-video (`imageToVideo`)
| slug | mode | ~цена/5с USD |
|---|---|---|
| `kling-std` | std | 0.20 |
| `kling-pro` | pro | 0.33 |
| `kling-3-std` | std (v3.0) | 0.50 |
| `kling-3-pro` | pro (v3.0) | 0.50 |
| `hailuo-2.3`, `hailuo-2.3-fast` | — | по реестру |
| `veo-3.1-i2v`, `veo-3.1-fast-i2v` | — | по реестру |
| `seedance-2-first-last`, `seedance-2-fast-first-last` | — | по реестру |
| `wan-2.6-i2v` | — | по реестру |

### text-to-video (`textToVideo`)
`seedance-2`, `seedance-2-fast`, `seedance-2-less-restriction`, `seedance-2-fast-less-restriction`,
`seedance-2-omni`, `seedance-2-fast-omni`, `hailuo-2.3(-fast)(-text)`, `kling-3-omni`,
`veo-3.1`, `veo-3.1-fast`, `wan-2.6`, `sora-2`, `sora-2-pro`.

### Нишевые блоки (остаются на PiAPI в гибридном режиме)
| блок | PiAPI model / task_type | примечание |
|---|---|---|
| `face-swap-video` | `Qubico/video-toolkit` / `face-swap` | ~0.004/кадр |
| `motion-transfer` | `kling` / `motion_control` | kling-motion-2.6/3.0 std/pro |
| `video-effect` | `kling` / `effects`, `Qubico/ai-hugs` / `effects` | kling-effects, ai-hugs |
| `talking-avatar` | OmniHuman 1.5 / Kling lip-sync | ~0.13/с аудио |
| `video-watermark-remove` | `remove-watermark` | ~0.008/с |
| `video-upscale` | `video-upscale-2x` | ~0.0003/кадр |

### Mock-only блоки (провайдер не вызывается)
`image-restore`, `image-upscale`.

## Реестр env (PiAPI — не удалять до конца миграции)

В `shared/.env` на проде сейчас (значения секретов — на ВМ, не здесь):

- `PROVIDER_MODE` — `piapi` (станет `fal` при переключении)
- `PIAPI_API_KEY`
- `PIAPI_BASE_URL` (по умолчанию `https://api.piapi.ai`)
- `PIAPI_PROXY_URL` (зарубежный прокси для gpt-image edits, P10.2)
- `PIAPI_DAILY_CAP_USD`, `PIAPI_BALANCE_MIN_USD`
- `PIAPI_GPT_IMAGE_TIMEOUT_MS`, `PIAPI_GPT_IMAGE_EDIT_RETRIES`, `PIAPI_SYNC_PENDING_FAIL_AFTER_MS`
- `STORAGE_PUBLISHER` (`local`), `PUBLIC_API_URL`

## Новые env для fal (добавляются, не заменяют PiAPI)

- `FAL_KEY` — ключ fal.ai (формат `key_id:key_secret`)
- (опц.) `FAL_PROXY_URL` — если потребуется прокси для доступа к fal с РФ-ВМ
