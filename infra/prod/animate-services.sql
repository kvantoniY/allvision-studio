-- Правки ТРЁХ существующих услуг (только эти, остальное не трогаем):
--   1) revive-old-photo: "Оживить старое фото" -> "Оживить фото" = только оживление, без реставрации.
--   2) restore: реставрация по умолчанию + опц. галочка "+ оживить фото" (доп. коины).
--   3) photo-enhance: улучшение по умолчанию + опц. галочка "+ оживить фото" (доп. коины).
-- Галочка (priceCoinsChecked) и условный шаг (when) уже поддержаны кодом. Идемпотентно (guard'ы).

-- ============ 1) revive-old-photo -> "Оживить фото" (animate only) ============
UPDATE "Service" SET
  title = $q$Оживить фото$q$,
  "shortDesc" = $q$Загрузите фото — оживим его в короткое видео с естественным движением$q$,
  description = $q$Загрузите любое фото — нейросеть оживит его: лёгкое движение, мимика, плавный наезд камеры, как живой кадр. Лица и композиция сохраняются. Без реставрации — просто оживление вашего снимка.$q$,
  "pipelineConfig" = $j$[
    {
      "id": "step_1",
      "blockSlug": "image-to-video",
      "input": "{{user.photo}}",
      "params": {
        "model": { "standard": "kling-3-pro", "pro": "kling-3-pro" },
        "duration": "{{user.duration}}",
        "resolution": "720p",
        "aspect_ratio": "{{user.aspect}}",
        "prompt": "Gently bring this photo to life with subtle, believable motion only: soft natural blinking, faint breathing, a slight head turn and a gentle warm smile, plus a slow cinematic camera push-in. Keep every face stable, sharp and exactly recognizable - no morphing, no identity drift, no face replacement, no distortion of eyes, mouth or hands. Preserve the original composition, clothing, colours and lighting. Photorealistic, natural film-like motion, soft warm light."
      }
    },
    {
      "id": "step_2",
      "blockSlug": "video-compose",
      "input": "{{step_1.output}}",
      "params": {
        "title": "Allvision",
        "watermark": false,
        "audio_loop": true,
        "audio_source": "",
        "audio_volume": 0.5,
        "audio_fade_in_sec": 2,
        "audio_fade_out_sec": 2,
        "keep_original_audio": false
      }
    }
  ]$j$::jsonb
WHERE slug = $q$revive-old-photo$q$;

-- ============ 2) restore: реставрация + опц. "+ оживить фото" ============
UPDATE "Service" SET
  "userInputForm" = "userInputForm" || $j$[{
    "id": "animate",
    "type": "checkbox",
    "label": "+ Оживить фото (короткое видео)",
    "required": false,
    "defaultChecked": false,
    "priceCoinsChecked": 91,
    "hint": "Дополнительно оживим отреставрированное фото: лёгкое движение, мимика, плавный наезд камеры. За доплату (видео-генерация)."
  }]$j$::jsonb,
  "pipelineConfig" = "pipelineConfig" || $j$[{
    "id": "step_2",
    "blockSlug": "image-to-video",
    "input": "{{step_1.output}}",
    "when": { "field": "animate", "value": "true" },
    "params": {
      "model": { "standard": "kling-3-pro", "pro": "kling-3-pro" },
      "duration": 5,
      "resolution": "720p",
      "aspect_ratio": "auto",
      "prompt": "Gently bring this photo to life with subtle, believable motion only: soft natural blinking, faint breathing, a slight head turn and a gentle warm smile, plus a slow cinematic camera push-in. Keep every face stable, sharp and exactly recognizable - no morphing, no identity drift, no face replacement, no distortion of eyes, mouth or hands. Preserve the original composition, clothing, colours and lighting. Photorealistic, natural film-like motion, soft warm light."
    }
  }]$j$::jsonb
WHERE slug = $q$restore$q$
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("userInputForm") f WHERE f->>'id' = 'animate');

-- ============ 3) photo-enhance: улучшение + опц. "+ оживить фото" ============
UPDATE "Service" SET
  "userInputForm" = "userInputForm" || $j$[{
    "id": "animate",
    "type": "checkbox",
    "label": "+ Оживить фото (короткое видео)",
    "required": false,
    "defaultChecked": false,
    "priceCoinsChecked": 109,
    "hint": "Дополнительно оживим улучшенное фото: лёгкое движение, мимика, плавный наезд камеры. За доплату (видео-генерация)."
  }]$j$::jsonb,
  "pipelineConfig" = "pipelineConfig" || $j$[{
    "id": "step_2",
    "blockSlug": "image-to-video",
    "input": "{{step_1.output}}",
    "when": { "field": "animate", "value": "true" },
    "params": {
      "model": { "standard": "kling-3-pro", "pro": "kling-3-pro" },
      "duration": 5,
      "resolution": "720p",
      "aspect_ratio": "{{user.aspect}}",
      "prompt": "Gently bring this photo to life with subtle, believable motion only: soft natural blinking, faint breathing, a slight head turn and a gentle warm smile, plus a slow cinematic camera push-in. Keep every face stable, sharp and exactly recognizable - no morphing, no identity drift, no face replacement, no distortion of eyes, mouth or hands. Preserve the original composition, clothing, colours and lighting. Photorealistic, natural film-like motion, soft warm light."
    }
  }]$j$::jsonb
WHERE slug = $q$photo-enhance$q$
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements("userInputForm") f WHERE f->>'id' = 'animate');
