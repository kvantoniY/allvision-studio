-- A11: keep the exact consent text accepted by a parent.
ALTER TABLE "Consent" ADD COLUMN "textSnapshot" TEXT;

UPDATE "Consent"
SET "textSnapshot" = CASE "type"::text
  WHEN 'IMAGE_PROCESSING' THEN E'Обработка изображений ребёнка\nРазрешаю обработку загруженных фотографий ребёнка для подготовки учебных материалов.\nРедакция: v1'
  WHEN 'AI_CHARACTER' THEN E'Создание AI-персонажа\nРазрешаю создание синтетического персонажа с внешностью ребёнка для персонализации уроков.\nРедакция: v1'
  WHEN 'AI_GENERATION' THEN E'Генерация иллюстраций и видео\nРазрешаю генерацию иллюстраций и коротких видео с участием AI-персонажа ребёнка.\nРедакция: v1'
  WHEN 'EXTERNAL_PROVIDERS' THEN E'Использование внешних AI-сервисов\nПонимаю, что генерация выполняется внешними AI-сервисами; материалы передаются только через сервер платформы, без публичного доступа.\nРедакция: v1'
  WHEN 'DATA_RETENTION' THEN E'Правила хранения и удаления\nОзнакомлен(а) с правилами хранения материалов и возможностью в любой момент удалить фотографии, персонажа и все производные данные.\nРедакция: v1'
END;

ALTER TABLE "Consent" ALTER COLUMN "textSnapshot" SET NOT NULL;
ALTER TABLE "Consent" ALTER COLUMN "version" SET DEFAULT 'v2';
