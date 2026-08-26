-- G3: категория шаблонов видео-поздравлений. Живёт во вкладке витрины "greetings",
-- поэтому в "Готовых услугах" она не появится.
INSERT INTO "ServiceCategoryDef" ("code", "section", "title", "description", "shortDescription", "iconName", "sortOrder", "isActive", "isFeatured", "createdAt", "updatedAt") VALUES
  ('VIDEO_GREETINGS', 'greetings', 'Видео-поздравления', 'Загрузите фотографии — соберём смонтированный ролик с музыкой, титрами и переходами', 'Готовые шаблоны поздравлений из ваших фото.', 'Clapperboard', 6, true, true, NOW(), NOW())
ON CONFLICT ("code") DO UPDATE SET "section" = 'greetings';
