-- Улучшенные промпты «Фото 2к17» / «Групповое 2к17»: обязательная смена одежды на стиль 2017,
-- сохранение лиц, любительский (не глянцевый) кадр с телефона, малиновый закат + панельки,
-- НЕ селфи. Для группового — жёсткая привязка «каждый референс = отдельный человек, лиц = числу фото».

UPDATE "Service" SET "pipelineConfig" =
  jsonb_set(
    jsonb_set("pipelineConfig", '{0,params,quality}', '"high"'::jsonb, true),
    '{0,params,prompt}',
    to_jsonb('GPT Image 2 edit. Use the uploaded photo ONLY as a face and identity reference. Reproduce the same person exactly and recognizably: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. Do NOT copy the original selfie pose, framing, clothing or background from the reference, and do NOT beautify, re-age or change the face.

Build a brand new authentic photo from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era. It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie.

MANDATORY wardrobe change: replace whatever the person is wearing in the reference with authentic 2017 raion (двор) street style. Pick a believable combination: an adidas-style retro track jacket (олимпийка) with side stripes, OR a Thrasher-style flame-logo hoodie, OR a plain dark hoodie or tracksuit top; paired with dark tracksuit pants or fitted jeans and white sneakers; optionally a cap, beanie or small shoulder bag (барсетка). The outfit must clearly read as 2016-2017 CIS youth streetwear. Never keep the original clothing.

Scene: an ordinary post-Soviet courtyard at dusk. Grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, a bench, metal garages, workout bars (турники), old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

Framing and pose: candid full-body or knees-up shot, the person standing or leaning casually in the yard against the sunset and the panelki, slightly off-center, relaxed and natural - hands in pockets or loosely at the sides, calm confident posture, looking at the camera or slightly away. Not a model pose, no outstretched arm, no phone in hand, no mirror.

Look and quality: this must look like a REAL amateur 2017 smartphone photo, not a polished studio render. Slightly soft focus, mild sensor noise and grain, slightly uneven natural exposure, warm color cast, simple flat phone-camera depth (no fake bokeh), authentic imperfect VK vibe. Keep the FACE sharp and clearly recognizable even inside this amateur look. Realistic skin texture, natural body proportions, correct hands.

Avoid: glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, close-up face crop, outstretched arm, phone or mirror in frame, modern influencer aesthetic, extra people, duplicated or distorted faces, deformed hands, text, captions, logos or watermarks.'::text),
    true
  )
WHERE slug = 'single-photo-2017';

UPDATE "Service" SET "pipelineConfig" =
  jsonb_set(
    jsonb_set("pipelineConfig", '{0,params,quality}', '"high"'::jsonb, true),
    '{0,params,prompt}',
    to_jsonb('GPT Image 2 edit. You are given several reference images. Each uploaded reference image is ONE separate real person. Create one new photorealistic group photo from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era.

CRITICAL identity and count rules:
- The number of people in the result MUST exactly equal the number of provided reference images: 2 references means exactly 2 people, 3 references means exactly 3 people, 4 references means exactly 4 people.
- Each person must be reproduced exactly and recognizably from their OWN reference image: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. Treat every reference as a distinct individual.
- Do NOT blend, average, mix or swap faces between people. Do NOT duplicate the same person, do NOT invent extra people, do NOT add background friends, crowds or faces on posters. Keep each face sharp, clearly separated and recognizable.

It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie. The group stands or sits close together, relaxed and natural, in an ordinary post-Soviet courtyard at dusk.

MANDATORY wardrobe change for everyone: replace whatever each person is wearing in their reference with authentic 2016-2017 raion (двор) street style - adidas-style retro track jackets (олимпийки) with side stripes, Thrasher-style flame-logo hoodies, plain dark hoodies or tracksuit tops, dark tracksuit pants or fitted jeans, white sneakers, optional caps or beanies. Vary the outfits naturally between people. Never keep the original clothing.

Scene: grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, benches, metal garages, workout bars, old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

Framing and pose: candid full-body or knees-up group shot from a few meters away, people standing or sitting casually together against the sunset and the panelki, slightly off-center, relaxed natural posture, hands in pockets or loosely at the sides, looking at the camera or slightly away. Not model poses, no outstretched arm, no phone in hand, no mirror.

Look and quality: a REAL amateur 2017 smartphone photo, not a polished studio render. Slightly soft focus, mild sensor noise and grain, slightly uneven natural exposure, warm color cast, simple flat phone-camera depth, authentic imperfect VK vibe. Keep every FACE sharp and clearly recognizable. Realistic skin texture, natural proportions, correct hands.

Avoid: glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, outstretched arm, phone or mirror in frame, modern influencer aesthetic, merged or duplicated faces, wrong number of people, distorted faces, deformed hands, text, captions, logos or watermarks.'::text),
    true
  )
WHERE slug = 'group-photo-2017';
