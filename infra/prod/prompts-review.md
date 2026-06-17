# Разбор промптов всех активных услуг

Формат каждого блока: **1) Старый промпт → 2) Что не так → 3) Новый промпт**.
Применять выборочно вручную в `/admin/services`. Изменения только текстовые, код/модели не трогаем.

---

## Сквозные проблемы (касаются многих услуг)

1. **Якоря `@image_1` / `@image_2` работают только у Kling/Seedance Omni и видео-моделей, НО НЕ у `gpt-image-2`.**
   gpt-image (OpenAI-совместимый edit) получает референсы как multipart-картинки без позиционных якорей. Поэтому в gpt-image-услугах писать `@image_1 is the mother` бесполезно — модель это не понимает. Нужно человеческим языком: «the first reference image is …, the second reference image is …». Затронуто: **future-child** (там стоят `@image_1/@image_2`).

2. **gpt-image-2 слабо привязывает референс к роли/позиции и любит смешивать лица.** Для мульти-персонных gpt-image услуг обязательны: явное число людей = числу референсов + «каждый референс = один отдельный человек» + запрет blend/duplicate. (Уже внедрено в group-photo-2017; то же нужно проверить в road-camera-couple, group-photo-2017-copy-copy.)

3. **В промпте реставрации в самом конце дописана строка про колоризацию**, которая ПЕРЕБИВАЕТ более ранний пункт «keep black-and-white unless colorization requested» → услуга всегда красит ч/б. Для «Реставрация фото» это может быть нежелательно (для «Оживить старое фото» — ок).

4. **Слишком длинные промпты размывают вес инструкций.** gpt-image лучше слушает компактные структурированные промпты, чем «простыни». Где можно — ужал.

5. **Generic trend-промпты недокручены.** `toxis-dance`, `toxis-dance-copy`, `face-in-trend-pro` — это одна слабая строчка, тогда как `toxis-dance-copy-2` — детальный хороший промпт с защитой личности. Подтянуть слабые к уровню copy-2.

6. **«Улучшение видео через Kling 3.0» — генеративная модель, а не апскейлер.** Обещание «сохрани всё точь-в-точь и улучши» физически противоречиво: omni перерисует кадр. Ожидание ≠ результат — стоит либо пересформулировать ожидания, либо не позиционировать как реставрацию.

---

## 1. restore — «Реставрация фото» (image-edit / gpt-image-2)

**1) Старый:** длинный промпт реставрации (удаление царапин/пыли, сохранение личности, full-frame, без рук/альбома/бликов…), а В КОНЦЕ дописано: *«Colorize the photo carefully and realistically… Do not oversaturate.»*

**2) Что не так:**
- Финальная строка про колоризацию **всегда** включает покраску, отменяя пункт «keep B&W unless requested». Если услуга позиционируется как чистая реставрация (без авто-покраски) — это баг ожиданий. Если покраска задумана — тогда уберите противоречащий пункт про «keep black-and-white».
- Очень длинно; ключевые правила (full-frame, сохранить личность, убрать physical-photo артефакты) тонут.
- `negative_prompt` пустой — можно усилить.

**3) Новый (вариант «реставрация без принудительной покраски»):**
```
GPT Image 2 edit. Use the uploaded image as the only reference. Restore it into a clean, full-frame digital photograph — edge to edge, not a photo of a photo.

If the upload is a printed photo held in a hand, on a table, in an album, under glass or shot at an angle (visible paper borders, fingers, glare, desk, tilt), do NOT keep any of that: extract only the actual image content, straighten and perspective-correct it, and rebuild it as the original digital photo full-screen.

Preserve every person's real identity exactly: face shape, eyes, nose, lips, jawline, hairstyle, age, skin tone, expression, posture, clothing and the relationships between people. Do not beautify, modernise, re-age, change ethnicity or swap faces. With multiple people, keep each one separate — no merging, duplicating, removing or adding people.

Repair realistically: remove dust, scratches, cracks, folds, stains, fingerprints, blur, fading, yellowing, scan and compression artifacts, uneven exposure; recover lost detail conservatively; restore natural skin, hair and fabric texture; balance contrast and color while keeping the original era and lighting direction. Reconstruct damaged facial areas conservatively from surrounding features — never invent a new face. Upscale naturally if low-res.

Keep the original tonality: if the photo is black-and-white, KEEP it black-and-white (do not colorize). Output a documentary, believable, professionally restored archival photo — no plastic skin, no beauty filter, no painterly or cartoon look, no fake HDR, no glamour retouch, no added objects or background, no text, logos or watermark.
```
> Если покраска нужна — добавьте в конец: `Colorize naturally and historically plausibly: realistic skin tones, muted period-correct clothing colors, no oversaturation.` и уберите строку «KEEP it black-and-white».

---

## 2. revive-old-photo — «Оживить старое фото» (image-edit → image-to-video → video-compose)

**Шаг 1 (image-edit):** промпт идентичен `restore` (та же простыня + финальная колоризация).

**2) Что не так:** здесь колоризация уместна (потом анимируем), но дублирование текста с `restore` и длина — те же. Можно взять новый промпт из п.1 + явно оставить колоризацию (т.к. оживший цветной кадр выглядит лучше).

**3) Новый (шаг 1):** промпт из п.1 НО с колоризацией: убрать строку «KEEP it black-and-white», добавить в конце:
```
Colorize the result naturally and historically plausibly: realistic skin tones, muted period-correct clothing and environment colors, no oversaturation. The output must be a clean, full-frame, colorized restoration ready to be gently animated.
```

**Шаг 2 (image-to-video / kling-3-pro):**
**1) Старый:** `Subject moves naturally, slight head turn, gentle smile, slow cinematic camera push-in, soft warm light, photorealistic`
**2) Что не так:** ок для базовой оживки, но не защищает личность в движении и не ограничивает «оживление» (kling может перерисовать лицо/добавить дрейф). Нет запрета морфинга.
**3) Новый:**
```
Gently bring the restored photo to life with subtle, believable motion only: soft natural blinking, faint breathing, a slight head turn and a gentle warm smile, plus a slow cinematic push-in. Keep every face stable, sharp and exactly recognizable — no morphing, no identity drift, no face replacement, no distortion of eyes, mouth or hands. Preserve the original composition, clothing and background. Soft warm light, photorealistic, natural film-like motion.
```

---

## 3. old-age-portrait — «Я в старости» (image-edit / gpt-image-2)

**1) Старый:** «Transform the person… into 75-85 y.o. while preserving exact identity… add wrinkles, grey hair… no caricature… photorealistic portrait, natural light…»

**2) Что не так:** в целом хороший. Мелочи: не сказано «использовать загруженное фото как единственный референс»; нет явного «один человек, без лишних людей» (есть «no extra people» — ок); можно добавить сохранение фирменной улыбки/взгляда сильнее и фон. gpt-image может «омолодить обратно» или сделать generic-деда.

**3) Новый:**
```
GPT Image 2 edit. Use the uploaded photo as the only identity reference. Show the SAME person, naturally aged to about 75-85 years old, and still instantly recognizable: keep the exact face geometry, eye shape, nose, mouth, eyebrows, characteristic smile and gaze, gender, ethnicity and hairstyle logic. Age believably — natural wrinkles and folds, softer skin elasticity, subtle age spots, thinning grey or silver hair, a more mature facial structure — but no caricature, no horror, no zombie look. Do not turn them into a different or generic elderly person, do not beautify into a model, do not add other people, text or watermark. Photorealistic portrait, soft natural everyday light, neutral simple background, realistic aged skin texture with pores — no plastic smoothing, no AI gloss, no heavy makeup, no studio glamour. It should look like an authentic future photo of this exact person.
```

---

## 4. future-child — «Будущий ребёнок» (image-edit / gpt-image-2, 2 референса)

**1) Старый:** «…based on the two parent reference photos: **@image_1 is the mother and @image_2 is the father**… blend traits… age exactly {{user.child_age}}… gender {{user.child_gender}}…»

**2) Что не так (важно):**
- **`@image_1`/`@image_2` НЕ работают в gpt-image-2.** Модель не понимает якоря — она просто видит две картинки. Нужно plain-язык: «the first reference image is the mother, the second is the father» (и даже так gpt-image не гарантирует порядок — но это лучший доступный вариант).
- В остальном логика хорошая.

**3) Новый:**
```
GPT Image 2 edit. You are given two reference photos of parents: the FIRST reference image is the mother, the SECOND reference image is the father. Create ONE photorealistic portrait of their plausible {{user.child_age}}-year-old {{user.child_gender}} child as a creative visualization. The child must look biologically believable as the child of BOTH parents, blending recognizable traits from each: face shape, eyes, eyebrows, nose, lips, skin tone, hair color and texture, and natural expression. Make the child exactly {{user.child_age}} years old and exactly {{user.child_gender}}. Do not reproduce either parent as an adult, do not make an adult-looking face on a child, do not clone one parent, do not add extra people, text or watermark. Natural realistic child skin texture, clear eyes, believable child proportions, soft warm everyday light, clean neutral background, high realism — no plastic smoothing, no caricature, no fantasy styling. It should feel like a real family portrait photo.
```

---

## 5. road-camera-couple — «Фото с камеры на дороге» (image-edit / gpt-image-2, 3 референса)

**1) Старый:** смешанный EN/RU промпт. «Use exactly three references. Reference image 1 = man/driver, 2 = woman/passenger, 3 = car. Preserve each identity… Чёрно-белый фотореалистичный уличный кадр… вид сверху-спереди… номера 1в1… CAM 09, дата 2026-03-16, 217 km/h…»

**2) Что не так:**
- Хорошо, что использовано «Reference image 1/2/3» (а не @-якоря) — это правильно для gpt-image.
- **Двуязычность** (EN преамбула + RU тело) — gpt-image лучше слушает один язык; лучше весь промпт на английском.
- gpt-image слабо рендерит читаемый текст («CAM 09», дата, «217 km/h») — часто получается мусор/缺. Это известное слабое место; ожидать кривой текст. Можно оставить, но знать риск.
- 3 референса + точная композиция + сохранение номера 1-в-1 — амбициозно для gpt-image; номер машины почти наверняка исказится.

**3) Новый (единый английский, реалистичные ожидания):**
```
GPT Image 2 edit. You are given exactly three reference images: the FIRST is the man (driver), the SECOND is the woman (passenger), the THIRD is the car. Preserve each person's identity separately and clearly (face, hairstyle, proportions) and keep the car's make, model, body shape, headlights, grille and proportions as close to its reference as possible.

Create a black-and-white photorealistic street shot in the style of a road-surveillance / speed camera, viewed from the front and slightly above. The car drives along a city road, centered and symmetrical in the frame, hood and grille emphasized. Inside, two people on the front seats match their references: the driver holds the wheel with one hand, looking ahead with a faint smile; the passenger leans toward him and kisses him on the cheek — an intimate, spontaneous moment. The windshield reflects light slightly but the faces stay readable. Detailed asphalt texture, curb on the left, a sense of motion. A speed-camera HUD overlay along the bottom in a monospace font: "CAM 09", date "2026-03-16", speed "217 km/h" (render text crisp if possible). High-contrast black-and-white, sharp, gritty documentary surveillance aesthetic, cinematic raw mood. No color, no beauty filter, no watermark.
```
> Примечание: точный текст HUD и номерной знак gpt-image воспроизводит ненадёжно — это ограничение модели, не промпта.

---

## 6. group-photo-2017-copy-copy — «Красивое фото с девушкой» (image-edit / gpt-image-2, 2 референса)

**1) Старый:** хороший детальный промпт: «Reference image 1 = man (foreground), 2 = woman behind. Extreme close-up cinematic portrait… emotional tension, not romance… shallow DOF, film grain…»

**2) Что не так:** почти ок. Использует plain «Reference image 1/2» (правильно). Можно усилить «exactly 2 people, no others» в начале (есть «use exactly 2 people and no one else» — ок) и явный запрет смешивания лиц (есть). Реально минорно — оставить почти как есть.

**3) Новый (лёгкая полировка — усилен порядок и анти-blend в начале):**
```
GPT Image 2 edit. Use exactly TWO reference images and show exactly two people, no one else. The FIRST reference image is the man in the extreme foreground; the SECOND reference image is the woman standing directly behind him. Reproduce each face exactly and separately from its own reference — exact structure, natural asymmetry, eyes, nose, mouth, eyebrows, skin tone, hairstyle, age. Never blend, swap or duplicate the two faces, and never add extra people, background faces, posters or reflections with faces.

Composition: an extreme close-up cinematic portrait with a very tight crop — only about half of the man's face fills most of the frame, facing forward with a slight turn; the woman is very close directly behind, her face partly hidden behind his head and shoulder, visible only in fragments but still recognizable. Strong layered depth: sharp dominant foreground man, woman softer behind but clear.

Mood: psychological tension, not romance. Man calm, neutral, slightly serious; woman an intense gaze with slightly narrowed eyes, lips softly pressed or barely parted. Intimate, restrained, cinematic.

Style: realistic cinematic photography, dramatic but natural light, shallow depth of field, rich shadows, detailed skin with visible pores, natural hair strands, subtle film grain, soft contrast, high-end editorial look. Faces sharp and recognizable. No beauty filter, no glossy AI skin, no CGI, no heavy HDR, no fake bokeh, no deformed hands or faces, no text, logo or watermark.
```

---

## 7. test-revieve — «Персональный анализ внешности» (image-edit / gpt-image-2)

**1) Старый:** RU-промпт: «Создай минималистичную инфографику… форма лица, тип волос… 3 ряда причёсок… чистый дизайн…»

**2) Что не так:** gpt-image **очень плохо рендерит много мелкого текста и инфографику** (подписи получаются нечитаемыми/мусорными). Услуга концептуально упирается в слабое место модели. Если оставлять — минимизировать текст, делать крупные подписи, меньше элементов. Это ограничение модели, не промпта.

**3) Новый (минимизирован текст, крупные подписи, англ+рус смешанно осознанно для лейблов):**
```
GPT Image 2 edit. Use the uploaded selfie(s) only to read the person's face shape, hair type and hairline. Create a clean, minimal hairstyle-guide infographic on a neutral background (barbershop / UI style). Layout, top to bottom:

1) A compact icon row with FOUR short labels and values (keep text minimal and large): "Форма лица", "Тип волос", "Густота", "Длина".
2) Three rows of example haircuts shown as clear portrait thumbnails with very short captions: row 1 "Лучшее", row 2 "Альтернативы", row 3 "Не подходит".

All haircuts must be different (no repeats), one consistent face/style across thumbnails, big legible captions, lots of whitespace, no long paragraphs, no gibberish text, no watermark. Prioritize clean readable typography over decoration.
```
> Реалистичное ожидание: точность текста ограничена моделью; меньше текста = меньше брака.

---

## 8. last-kiss-meteor — «Последний поцелуй» (text-to-video / sora-2-pro, 2 референса)

**1) Старый:** «…woman = @image_1, man = @image_2… Preserve faces максимально точно… meteor falls… final kiss… explosion… cinematic…» (EN + вставка RU).

**2) Что не так:**
- **Якоря `@image_1/@image_2` на Sora-2 ненадёжны** — нужно проверить, что Sora через PiAPI вообще принимает 2 image-референса и держит личности. Это помечено техдолгом (P7.2/P8.2: «smoke-test Sora перед платным запуском»). Если личности не держатся — проблема в модели/передаче, не в тексте.
- Смешан язык («максимально точно»). Лучше весь EN.
- Промпт хороший по режиссуре.

**3) Новый (единый EN; якоря оставлены, т.к. для omni/видео это рабочий синтаксис — но провалидируйте на Sora):**
```
Ultra-cinematic, photorealistic, dramatic romance video. A dramatic end-of-the-world scene on a real ocean shore at golden-hour dusk. In frame: an adult woman with the exact identity of @image_1 and an adult man with the exact identity of @image_2. Preserve their faces as precisely as possible — same features, skin tone, hairstyle, age, proportions and recognizable identity. No face distortion, no beauty filter, no identity drift, no extra people.

The scene opens with both standing close on the beach during a stormy dusk: wind moves their hair and clothes, waves roll behind, wet sand reflects the sky. Emotional tension first, as if after an argument, then they look at each other with sadness and love. Far behind them a huge fiery meteor begins falling toward the horizon; the sky turns brighter and apocalyptic with glowing clouds, smoke and shockwave light. As it nears, they move together, embrace tightly and share a final emotional kiss — and exactly as they kiss, the meteor impacts in the background: massive explosion, bright flash, fireball, flying debris, ocean spray, cinematic shockwave. The couple stays the emotional focus in the foreground.

Style: photorealistic, emotional, viral cinematic trend, high detail, natural realistic motion and facial expressions, dramatic lighting, shallow depth of field, blockbuster feel. Camera: smooth cinematic move, slight handheld / slow push-in. Framing: medium-wide to medium, both faces clearly visible throughout. Mood: tragic, romantic, epic.
```

---

## 9. last-kiss-meteor-copy — «Случайный кадр со стадиона» (image-edit → text-to-video → video-compose)

**Шаг (image-edit, gpt-image-2):** «…person from @image1… Korean baseball stands, candid broadcast, telephoto zoom, calm aloof sultry, NOT smiling/cheering… white jersey, no logos… 16:9…»
**Шаг (text-to-video, kling-3-omni):** аналогичный, с «@image1» и движением.

**2) Что не так:**
- Логика отличная (P10.1 уже доработали). Но в **image-edit `@image1` не работает** (gpt-image не понимает якорь) — заменить на «the uploaded reference person». В **видео-шаге kling-omni** якорь рабочий, но формат лучше `@image_1` (omni-стандарт), а не `@image1`.
- В остальном — один из лучших промптов, трогать сильно не нужно.

**3) Новый (image-edit шаг — убрать якорь):**
```
GPT Image 2 edit. Use the uploaded photo as the identity reference for one adult female spectator. Cinematic candid broadcast still at a Korean professional baseball stadium: she sits in the stands, randomly caught by the live TV camera and unaware of it. Calm, relaxed, slightly aloof and sultry expression — pretty and cute with a faint confident, slightly sassy look. She is NOT smiling widely, NOT cheering, NOT excited, NOT reacting; she just quietly watches the game. Distant telephoto broadcast lens: strong zoom compression, shallow depth of field, the crowded stands softly blurred around her, as if zoomed in from far across the stadium. Plain white baseball-style jersey, realistic fabric, no logos or readable text. Warm evening floodlights, realistic skin texture, slight grain, photojournalistic candid feel, ultra realistic. NOT a close-up selfie and NOT shot from nearby — a distant zoomed broadcast frame. 16:9 horizontal.
```
> В видео-шаге: заменить `@image1` → `@image_1` (омни-стандарт), остальное оставить.

---

## 10. face-in-trend-pro / toxis-dance / toxis-dance-copy (trend-video-transfer)

**1) Старый (все три, почти одинаково):**
- face-in-trend-pro: `Repeat the main person motion from the reference trend video while preserving the uploaded person identity. Natural body movement, stable face, realistic lighting, vertical social-video framing.`
- toxis-dance / -copy: `Repeat the dance movement from the reference video while preserving the uploaded person identity. Natural energetic dance, stable face, realistic lighting, vertical social-video framing.`

**2) Что не так:** слишком общо, слабая защита личности. Рядом есть `toxis-dance-copy-2` — детальный промпт с анти-морфингом и микро-мимикой. Подтянуть слабые к нему.

**3) Новый (для танцев — на базе copy-2):**
```
Use the reference video only for the dance motion, body rhythm, timing, camera framing and choreography. Preserve the uploaded person's identity exactly: same face shape and proportions, eyes, nose, lips, jawline, hairstyle, skin tone and recognizable features. The person performs the same dance naturally and energetically. Keep the face stable and realistic throughout — no warping, morphing, face replacement or identity drift. Natural facial expressions matching the dance (subtle smiles, realistic micro-expressions, relaxed eyes and mouth), never exaggerated. Accurate head position, natural neck and body motion, face sharp and recognizable in every frame. Realistic lighting, natural skin texture, clean smooth motion, vertical social-video framing. It must look like the SAME real person genuinely dancing, not a swapped or generated face.
```
**3) Новый (face-in-trend-pro — обобщённое движение):**
```
Use the reference video only for the main person's motion, rhythm, timing, camera framing and overall action. Preserve the uploaded person's identity exactly: same face shape, eyes, nose, lips, jawline, hairstyle, skin tone and recognizable features. Reproduce the same body movement naturally. Keep the face stable and realistic — no warping, morphing, face replacement or identity drift; natural expressions, no distortion of eyes, mouth or hands. Accurate head and body motion, face sharp and recognizable every frame. Realistic lighting, natural skin texture, clean motion, vertical social-video framing. It must look like the SAME real person, not a swapped face.
```

---

## 11. me-in-movie / me-in-cartoon (scene-transfer, набор base-промптов)

**1) Старый:** многоблочные промпты (`photo_base_prompt`, `prompt_base_prompt`, `character_prompt`, `cartoon_realistic_prompt`, `stylize_prompt` и т.д.) — структурно неплохо проработаны.

**2) Что не так:** в целом ок, это самые продуманные промпты. Мелочи:
- `character_prompt` хорошо держит личность — оставить.
- В `cartoon` режиме `realistic` vs `cartoon` логика разведена корректно.
- Можно усилить запрет «extra characters» и «text/logos» (частично есть).
- Это низкий приоритет по сравнению с gpt-image-услугами.

**3) Новый:** существенных правок не требуют; при желании — добавить в `character_prompt` фразу: `Keep the person's identity locked across the whole clip; if it starts to drift, prioritize matching the reference face over scene styling.` Остальное оставить.

---

## 12. video-quality-kling — «Улучшение видео через Kling 3.0» (text-to-video / kling-3-omni)

**1) Старый:** «Use the uploaded video as strict source… recreate same video with improved quality, preserve duration/timing/identity/scene… improve clarity, sharpness, denoise, color… no new story…»

**2) Что не так (важно):** kling-3-omni — **генеративная** модель, она перерисует кадр, а не сделает попиксельный апскейл. «Сохрани всё точь-в-точь И улучши» — внутренне противоречиво: личность/детали будут плыть. Это **mismatch ожиданий**, а не текста. Варианты: (а) честно позиционировать как «кинематографичная пересъёмка/ремастеринг с возможными изменениями», (б) для настоящего апскейла использовать профильный upscale-блок/модель, а не omni.

**3) Новый (если оставляем omni — реалистичные ожидания):**
```
Use the uploaded video as the source reference. Recreate the same scene with higher visual quality while staying as close as possible to the original duration, timing, camera motion, composition, subject and action. Improve sharpness, fine detail, color balance, local contrast and temporal stability; reduce noise, compression artifacts and flicker. Keep the same person recognizable and the same overall look — but note this is a cinematic re-render, so prioritize a clean, natural, realistic result over pixel-identical reproduction. Natural skin and texture, no plastic skin, no over-sharpening halos, no HDR look, no added text, watermark or extra objects.
```
> Для реального апскейла без «перерисовки» нужен отдельный upscale-pipeline — это уже не текст промпта.

---

## 13. carousel-post — «Карусель для поста» (carousel-slides / gpt-image-2)

**1) Старый:** DB `style_prompt` (cream/beige premium template) + кодовый `buildSlidePrompt` (детальный: единый шаблон, человек как PNG-вырезка, точный verbatim-текст…).

**2) Что не так:**
- Кодовый промпт уже сильный и продуманный.
- Слабое место — **gpt-image/nano рендер точного текста**: длинные подписи получаются с ошибками/мусором (известный долг — overlay текста через ffmpeg/canvas на будущее). Это модельное ограничение.
- DB `style_prompt` можно сделать более «вирусным/смелым», если нужен не editorial-cream, а яркий стиль — на вкус.

**3) Новый (DB style_prompt — оставить или заменить под нужный визуал; пример более универсального):**
```
One cohesive premium social-media carousel with a single consistent template across all slides: a fully designed edge-to-edge background (tasteful brand color or soft gradient with subtle geometric accents), strong modern typography (bold sans-serif headline + clean readable body), generous margins and a consistent area for the person. Cohesive, professional, art-directed, magazine-like, sharp and 100% legible.
```
> Главный рычаг качества здесь — не текст промпта, а будущий overlay реального текста поверх картинки.

---

## 14. product-cover / product-ad (product-card, дефолты в коде)

**1) Старый (дефолты блока):**
- cover: `Clean premium e-commerce product cover. The product is the hero: centered, sharp, well-lit on a tasteful studio background…`
- animation: `Gentle premium product showcase: slow smooth rotation and subtle camera move…`
- ad: `Cinematic premium product advertisement video: dynamic shots… macro detail… commercial editing rhythm…`
+ всегда добавляется «Keep the EXACT product from the reference photos…».

**2) Что не так:** дефолты адекватные и безопасные. Минусы:
- Это **код-дефолты** (`apps/worker/src/blocks/product-card.ts`), не правятся в админке — менять через `cover_prompt`/`ad_prompt` в params услуги, если нужно.
- `product-ad` использует `ad_style = {{user.style}}` (пользователь задаёт стиль) — хорошо; но если юзер ничего не ввёл, остаётся только дефолтный каркас (ок).
- Можно усилить «сохрани точный товар» и «никакого выдуманного текста на упаковке».

**3) Новый (если хотите переопределить в params услуги — пример cover_prompt):**
```
Clean premium e-commerce hero cover. The product is the hero: perfectly centered, sharp, professionally lit on a tasteful seamless studio background. Reproduce the EXACT product from the reference photos — same shape, proportions, color, materials, logo and label details, with realistic textures and accurate reflections. High detail, commercial product-photography quality. Do not invent or alter any text, branding or label wording; no extra props, no watermark.
```

---

## Приоритеты (что чинить в первую очередь)

| Приоритет | Услуга | Главная причина |
|---|---|---|
| 🔴 Высокий | future-child | `@image_1/@image_2` не работают в gpt-image → роли родителей не передаются |
| 🔴 Высокий | restore | принудительная колоризация перебивает «keep B&W» |
| 🟠 Средний | toxis-dance / -copy / face-in-trend-pro | слабые generic-промпты, нет защиты личности |
| 🟠 Средний | road-camera-couple | двуязычность; ослабить ожидания по тексту/номеру |
| 🟠 Средний | last-kiss-meteor-copy (image-edit) | `@image1` в gpt-image не работает |
| 🟡 Низкий | last-kiss-meteor | проверить, держит ли Sora-2 личности (модель, не текст) |
| 🟡 Низкий | video-quality-kling | mismatch ожиданий (omni ≠ апскейл) |
| 🟡 Низкий | old-age-portrait, group-photo-2017-copy-copy, test-revieve, carousel, product-* | полировка / модельные ограничения |
| ✅ Готово | single-photo-2017, group-photo-2017 | уже переписаны в этой сессии |
```
