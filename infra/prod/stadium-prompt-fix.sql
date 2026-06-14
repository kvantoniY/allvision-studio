-- «Случайный кадр со стадиона» (last-kiss-meteor-copy): спокойный кадр телетрансляции
-- с зумом издалека (не вблизи, не активная радость), модель кадра -> nano-banana (берёт фото юзера).
UPDATE "Service" SET "pipelineConfig" =
  jsonb_set(
    jsonb_set(
      jsonb_set("pipelineConfig", '{0,params,model}', to_jsonb('nano-banana'::text), true),
      '{0,params,prompt}',
      to_jsonb('Cinematic candid broadcast still captured at a Korean professional baseball stadium. The person from @image1 is sitting in the spectator stands, randomly caught by the live TV broadcast camera and unaware of it. Calm, relaxed, slightly aloof and sultry expression: pretty and cute with a faint confident, slightly sassy look. She is NOT smiling widely, NOT cheering, NOT excited, NOT reacting; she simply sits and watches the game quietly. Distant telephoto broadcast lens: strong zoom compression, shallow depth of field, the crowded stands softly blurred around her, as if a camera operator zoomed in on her from far across the stadium. She wears a plain white baseball-style jersey, realistic fabric, no logos, no readable text. Warm evening floodlights, realistic skin texture, slight grain, photojournalistic candid feel, ultra realistic. This is NOT a close-up selfie and NOT shot from nearby: it is a distant zoomed-in broadcast frame. 16:9 horizontal composition.'::text),
      true
    ),
    '{1,params,prompt}',
    to_jsonb('Realistic candid sports-broadcast video captured at a Korean professional baseball game. Use @image1 as the identity reference for one adult female spectator in the stands; preserve her likeness, facial structure, hairstyle, age and natural look. Calm, relaxed, slightly aloof and sultry expression: pretty and cute with a faint confident, slightly sassy look. She is NOT smiling widely, NOT cheering, NOT excited; she simply watches the game, unaware of the camera. Natural subtle motion only: gentle blinking, slow small head movement, calm breathing, a quiet glance; no big gestures, no clapping. Distant telephoto broadcast camera: heavy zoom-lens compression, shallow depth of field, the crowd softly blurred, as if the operator zoomed in on her from far across the stadium. Plain white baseball-style jersey, realistic fabric, no logos, no readable brand text. Warm evening floodlights, candid documentary broadcast style, slight motion blur, realistic skin texture, ultra realistic. This is NOT a close nearby shot and NOT a selfie: it is a distant zoomed-in broadcast frame. 16:9 horizontal composition.'::text),
    true
  )
WHERE slug = 'last-kiss-meteor-copy';
