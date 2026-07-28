-- A13: персональная генерация отдельного элемента сцены (кат-сцена с ребёнком).
-- Связка «экземпляр урока + сцена + элемент → проект генерации».
-- elementId пустой строкой означает генерацию всей сцены целиком (прежнее поведение A6.6);
-- NULL здесь использовать нельзя: в Postgres NULL'ы в уникальном индексе различны,
-- и upsert по сцене перестал бы защищать от дублей.
ALTER TABLE "LessonInstanceSceneAsset" ADD COLUMN IF NOT EXISTS "elementId" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "LessonInstanceSceneAsset_instanceId_sceneId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "LessonInstanceSceneAsset_instanceId_sceneId_elementId_key"
  ON "LessonInstanceSceneAsset" ("instanceId", "sceneId", "elementId");
