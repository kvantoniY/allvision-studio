-- Add the "Кинематограф" (CINEMA) service category for film/cartoon scene-transfer services.
INSERT INTO "ServiceCategoryDef" ("code", "title", "description", "shortDescription", "iconName", "sortOrder", "isActive", "isFeatured", "createdAt", "updatedAt") VALUES
  ('CINEMA', 'Кинематограф', 'Перенесём вас в любимый фильм или мультфильм', 'Я в фильме, я в мультфильме и готовые сцены по референсу.', 'Film', 5, true, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
