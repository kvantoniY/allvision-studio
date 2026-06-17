-- Фикс пропорций голова/тело: три-четверти кадрирование вместо полного роста (gpt-image хуже считает
-- анатомию в полный рост), явное требование корректной анатомии и соотношения головы к телу.

UPDATE "Service" SET "pipelineConfig" =
  jsonb_set(
    "pipelineConfig",
    '{0,params,prompt}',
    to_jsonb('GPT Image 2 edit. Use the uploaded photo ONLY as a face and identity reference. Reproduce the same person exactly and recognizably: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. Do NOT copy the original selfie pose, framing, clothing or background from the reference, and do NOT beautify, re-age or change the face.

Build a brand new authentic photo from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era. It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie.

MANDATORY wardrobe change: replace whatever the person is wearing in the reference with authentic 2017 raion (двор) street style. Pick a believable combination: an adidas-style retro track jacket (олимпийка) with side stripes, OR a Thrasher-style flame-logo hoodie, OR a plain dark hoodie or tracksuit top; paired with dark tracksuit pants or fitted jeans and white sneakers; optionally a cap, beanie or small shoulder bag (барсетка). The outfit must clearly read as 2016-2017 CIS youth streetwear. Never keep the original clothing.

Scene: an ordinary post-Soviet courtyard at dusk. Grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, a bench, metal garages, workout bars (турники), old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

LIGHTING AND INTEGRATION (critical - this is the most important rule): the entire photo must share ONE single coherent light situation - the warm crimson-pink sunset light plus soft cool dusk ambient. The face and body MUST be fully re-lit and color-graded to match this exact light: a warm rim/edge light on the hair, cheek and shoulders coming from the glowing sky, soft warm-to-neutral fill on the face, and the SAME white balance, color temperature, exposure, contrast, softness and grain as the background. The person must look genuinely photographed standing in this courtyard at this moment, with their skin tone blended into the warm dusk grade while staying recognizable. Do NOT keep the original lighting or color of the reference face. Strictly avoid a pasted, cut-out, sticker or photoshop-composite look: the face must NOT be brighter, sharper, cleaner, cooler or a different color than the rest of the scene, and there must be no mismatch between the face and the environment.

Framing and pose: a candid three-quarter shot framed from the head down to roughly the knees or mid-thigh - NOT a tiny distant full-body figure and NOT a tight face close-up. The person stands or leans casually in the yard against the sunset and the panelki, slightly off-center, relaxed and natural - hands in pockets or loosely at the sides, calm confident posture, looking at the camera or slightly away. Not a model pose, no outstretched arm, no phone in hand, no mirror.

ANATOMY AND PROPORTIONS (critical): render fully correct, natural human anatomy. The head must be in correct, realistic proportion to the neck and body, with normal shoulder width and natural limb and torso length. No oversized or undersized head, no shrunken or elongated body, no wrong head-to-body ratio, no warped or melted proportions, no distorted limbs or hands.

Look and quality: this must look like a REAL amateur 2017 smartphone photo, not a polished studio render. Slightly soft focus, mild sensor noise and grain applied evenly across the WHOLE frame including the face, slightly uneven natural exposure, warm color cast, simple flat phone-camera depth (no fake bokeh), authentic imperfect VK vibe. Keep the FACE recognizable but lit and textured like the rest of the photo. Realistic skin texture, natural body proportions, correct hands.

Avoid: disproportionate oversized or tiny head, wrong head-to-body ratio, elongated or shrunken body, warped or unnatural proportions, distorted limbs, pasted or cut-out faces, photoshop composite, sticker faces, faces lit differently from the scene, mismatched white balance or color temperature on the face, faces brighter sharper or cooler than the body and background, double lighting, glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, close-up face crop, outstretched arm, phone or mirror in frame, modern influencer aesthetic, extra people, duplicated or distorted faces, deformed hands, text, captions, logos or watermarks.'::text),
    true
  )
WHERE slug = 'single-photo-2017';

UPDATE "Service" SET "pipelineConfig" =
  jsonb_set(
    "pipelineConfig",
    '{0,params,prompt}',
    to_jsonb('GPT Image 2 edit. You are given several reference images. Each uploaded reference image is ONE separate real person. Create one new photorealistic group photo from the CIS / post-Soviet summer of 2016-2017, the nostalgic VK era.

CRITICAL identity and count rules:
- The number of people in the result MUST exactly equal the number of provided reference images: 2 references means exactly 2 people, 3 references means exactly 3 people, 4 references means exactly 4 people.
- Each person must be reproduced exactly and recognizably from their OWN reference image: same face shape, eyes, eyebrows, nose, mouth, jawline, hairstyle, hair color, skin tone, age and natural expression. Treat every reference as a distinct individual.
- Do NOT blend, average, mix or swap faces between people. Do NOT duplicate the same person, do NOT invent extra people, do NOT add background friends, crowds or faces on posters. Keep each face sharp, clearly separated and recognizable.

It must look like a real amateur phone snapshot taken by a friend from a few meters away, never a selfie. The group stands or sits close together, relaxed and natural, in an ordinary post-Soviet courtyard at dusk.

MANDATORY wardrobe change for everyone: replace whatever each person is wearing in their reference with authentic 2016-2017 raion (двор) street style - adidas-style retro track jackets (олимпийки) with side stripes, Thrasher-style flame-logo hoodies, plain dark hoodies or tracksuit tops, dark tracksuit pants or fitted jeans, white sneakers, optional caps or beanies. Vary the outfits naturally between people. Never keep the original clothing.

Scene: grey panel apartment blocks (панельки / хрущёвки) in the background, asphalt, benches, metal garages, workout bars, old parked cars, a simple playground. Strong малиновый закат: a crimson-pink-purple sunset gradient sky glowing behind the buildings, warm low sunlight, long soft shadows.

LIGHTING AND INTEGRATION (critical - this is the most important rule): the entire photo must share ONE single coherent light situation - the warm crimson-pink sunset light plus soft cool dusk ambient. EVERY face and body MUST be fully re-lit and color-graded to match this exact light: a warm rim/edge light on hair, cheeks and shoulders coming from the glowing sky, soft warm-to-neutral fill on the faces, and the SAME white balance, color temperature, exposure, contrast, softness and grain across all people and the background. Everyone must look genuinely photographed together standing in this courtyard at this moment, their skin tones blended into the warm dusk grade while staying recognizable. Do NOT keep the original lighting or color of the reference faces. Strictly avoid a pasted, cut-out, sticker or photoshop-composite look: no face may be brighter, sharper, cleaner, cooler or a different color than the others or than the scene, and there must be no mismatch between faces and environment. All people must be lit by the same single sunset light and sit in the same focal plane and grain.

Framing and pose: a candid group shot framed from the heads down to roughly the knees or mid-thigh - NOT tiny distant full-body figures and NOT tight face close-ups. People stand or sit casually together against the sunset and the panelki, slightly off-center, relaxed natural posture, hands in pockets or loosely at the sides, looking at the camera or slightly away. Not model poses, no outstretched arm, no phone in hand, no mirror.

ANATOMY AND PROPORTIONS (critical): render fully correct, natural human anatomy for everyone. Each head must be in correct, realistic proportion to its neck and body, with normal shoulder width and natural limb and torso length, and all people at consistent, believable scale relative to each other. No oversized or undersized heads, no wrong head-to-body ratio, no shrunken or elongated bodies, no warped or melted proportions, no distorted limbs or hands.

Look and quality: a REAL amateur 2017 smartphone photo, not a polished studio render. Slightly soft focus, mild sensor noise and grain applied evenly across the WHOLE frame including all faces, slightly uneven natural exposure, warm color cast, simple flat phone-camera depth, authentic imperfect VK vibe. Keep every FACE recognizable but lit and textured like the rest of the photo. Realistic skin texture, natural proportions, correct hands.

Avoid: disproportionate oversized or tiny heads, wrong head-to-body ratio, elongated or shrunken bodies, inconsistent scale between people, warped or unnatural proportions, distorted limbs, pasted or cut-out faces, photoshop composite, sticker faces, faces lit differently from the scene, mismatched white balance or color temperature on faces, faces brighter sharper or cooler than the bodies and background, double lighting, glossy AI skin, beauty filter, glamour retouch, cinematic editorial polish, heavy HDR, oversaturation, selfie framing, outstretched arm, phone or mirror in frame, modern influencer aesthetic, merged or duplicated faces, wrong number of people, distorted faces, deformed hands, text, captions, logos or watermarks.'::text),
    true
  )
WHERE slug = 'group-photo-2017';
