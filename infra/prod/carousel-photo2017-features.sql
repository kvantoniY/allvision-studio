-- ВАЖНО: применять ТОЛЬКО после деплоя кода (checkbox-поле, conditional `when`-шаг,
-- per-slide photo в carousel). До деплоя кода эти изменения работать не будут.
-- Все апдейты идемпотентны (guard'ы по наличию поля/шага).

-- 1) single-photo-2017: галочка "Анимировать фото" + условный шаг Kling 3.0.
UPDATE "Service" SET
  "userInputForm" = "userInputForm" || '[{
    "id": "animate",
    "type": "checkbox",
    "label": "Анимировать фото (оживить)",
    "required": false,
    "defaultChecked": false,
    "priceCoinsUnchecked": 39,
    "priceCoinsChecked": 99,
    "hint": "Сначала создадим фото, затем Kling 3.0 мягко оживит его: камера медленно пролетает как в клипе, фон, ветер и свет двигаются, а вы просто смотрите в кадр. Результат — короткое видео."
  }]'::jsonb,
  "pipelineConfig" = "pipelineConfig" || '[{
    "id": "step_2",
    "blockSlug": "image-to-video",
    "input": "{{step_1.output}}",
    "when": { "field": "animate", "value": "true" },
    "params": {
      "model": { "standard": "kling-3-pro", "pro": "kling-3-pro" },
      "duration": 5,
      "aspect_ratio": "{{user.aspect}}",
      "prompt": "Bring this 2017 photo to life as a short, cinematic B-roll clip, like an establishing shot in a music video. The camera slowly drifts and glides past the scene with a smooth, steady slow dolly / parallax move, as if a videographer is filming a gentle fly-by. The person or people stay still and simply look calmly straight into the camera — almost no movement, only subtle micro-motion: slight natural blinking and faint breathing. Do NOT make them dance, gesture, walk, turn away or change pose or expression. The environment comes alive instead: wind gently moves their hair and clothes, trees, grass and bushes sway softly, the crimson-pink sunset clouds drift slowly, and the warm dusk light shimmers. Keep every face stable, sharp and exactly recognizable in every frame — no morphing, no identity drift, no face replacement, no warping of eyes, mouth or hands. Preserve the original composition, clothing, colours and the warm sunset lighting. Photorealistic, natural film-like motion, smooth, calm and steady."
    }
  }]'::jsonb
WHERE slug = 'single-photo-2017'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("userInputForm") f WHERE f->>'id' = 'animate'
  );

-- 2) group-photo-2017: то же, цены 49 / 119.
UPDATE "Service" SET
  "userInputForm" = "userInputForm" || '[{
    "id": "animate",
    "type": "checkbox",
    "label": "Анимировать фото (оживить)",
    "required": false,
    "defaultChecked": false,
    "priceCoinsUnchecked": 49,
    "priceCoinsChecked": 119,
    "hint": "Сначала создадим групповое фото, затем Kling 3.0 мягко оживит его: камера медленно пролетает как в клипе, фон, ветер и свет двигаются, а вы просто смотрите в кадр. Результат — короткое видео."
  }]'::jsonb,
  "pipelineConfig" = "pipelineConfig" || '[{
    "id": "step_2",
    "blockSlug": "image-to-video",
    "input": "{{step_1.output}}",
    "when": { "field": "animate", "value": "true" },
    "params": {
      "model": { "standard": "kling-3-pro", "pro": "kling-3-pro" },
      "duration": 5,
      "aspect_ratio": "{{user.aspect}}",
      "prompt": "Bring this 2017 photo to life as a short, cinematic B-roll clip, like an establishing shot in a music video. The camera slowly drifts and glides past the scene with a smooth, steady slow dolly / parallax move, as if a videographer is filming a gentle fly-by. The person or people stay still and simply look calmly straight into the camera — almost no movement, only subtle micro-motion: slight natural blinking and faint breathing. Do NOT make them dance, gesture, walk, turn away or change pose or expression. The environment comes alive instead: wind gently moves their hair and clothes, trees, grass and bushes sway softly, the crimson-pink sunset clouds drift slowly, and the warm dusk light shimmers. Keep every face stable, sharp and exactly recognizable in every frame — no morphing, no identity drift, no face replacement, no warping of eyes, mouth or hands. Preserve the original composition, clothing, colours and the warm sunset lighting. Photorealistic, natural film-like motion, smooth, calm and steady."
    }
  }]'::jsonb
WHERE slug = 'group-photo-2017'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements("userInputForm") f WHERE f->>'id' = 'animate'
  );

-- 3) carousel-post: фото становится необязательным (per-slide галочки + текст-онли слайды).
UPDATE "Service" SET
  "userInputForm" = jsonb_set(
    jsonb_set(
      jsonb_set("userInputForm", '{0,required}', 'false'::jsonb),
      '{0,label}', '"Ваше фото (необязательно)"'::jsonb
    ),
    '{0,hint}', '"Можно не добавлять — тогда слайды будут только с текстом и дизайном. Если добавите, у каждого слайда появится галочка «добавить моё фото»."'::jsonb
  )
WHERE slug = 'carousel-post' AND "userInputForm"->0->>'id' = 'photo';

UPDATE "Service" SET
  "userInputForm" = jsonb_set(
    "userInputForm", '{1,hint}',
    '"Выберите число слайдов и впишите текст каждого. У каждого слайда есть галочка «добавить моё фото» (если вы загрузили фото). Цена считается за слайд. Короткий текст читается лучше."'::jsonb
  )
WHERE slug = 'carousel-post' AND "userInputForm"->1->>'id' = 'slides';
