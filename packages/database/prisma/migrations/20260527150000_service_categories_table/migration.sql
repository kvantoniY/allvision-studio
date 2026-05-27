-- Convert Service.category from ServiceCategory enum to TEXT, drop enum, add ServiceCategoryDef table.

ALTER TABLE "Service" ALTER COLUMN "category" TYPE TEXT USING "category"::TEXT;

DROP TYPE "ServiceCategory";

CREATE TABLE "ServiceCategoryDef" (
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "shortDescription" TEXT,
  "iconName" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceCategoryDef_pkey" PRIMARY KEY ("code")
);

INSERT INTO "ServiceCategoryDef" ("code", "title", "description", "shortDescription", "iconName", "sortOrder", "isActive", "isFeatured", "createdAt", "updatedAt") VALUES
  ('NOSTALGIA',         'Ностальгия',        'Оживите старое фото, восстановите выцветшие воспоминания', 'Семейный архив, старые снимки и тёплые видео-воспоминания.',           'Sparkles',     1, true,  true,  NOW(), NOW()),
  ('TRENDS_MEMES',      'Тренды и мемы',     'Лицо в трендовом видео или киносцене',                     'Быстрые ролики, мемные сцены и форматы для семейного чата.',          'Flame',        2, true,  true,  NOW(), NOW()),
  ('KIDS_HEROES',       'Дети-герои',        'Ваш ребёнок — герой собственной сказки или мультика',     'Добрые стилизованные миры, где ребёнок в центре истории.',            'Baby',         3, true,  true,  NOW(), NOW()),
  ('SPECIAL_OCCASIONS', 'Особые поводы',     'Юбилеи, свадьбы, корпоративы, 8 марта и 23 февраля',      'Видео-открытки и сюрпризы для дат, которые хочется помнить.',         'Cake',         4, true,  true,  NOW(), NOW());
