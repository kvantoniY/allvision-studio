-- A6.6: per-student генерация цельной AI-сцены (экземпляр+сцена → academy-generation Project)

CREATE TABLE "LessonInstanceSceneAsset" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonInstanceSceneAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LessonInstanceSceneAsset_instanceId_sceneId_key" ON "LessonInstanceSceneAsset"("instanceId", "sceneId");
CREATE INDEX "LessonInstanceSceneAsset_instanceId_idx" ON "LessonInstanceSceneAsset"("instanceId");
ALTER TABLE "LessonInstanceSceneAsset" ADD CONSTRAINT "LessonInstanceSceneAsset_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "LessonInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
