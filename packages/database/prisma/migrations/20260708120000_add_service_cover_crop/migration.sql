-- Кадрирование обложки услуги для витрины (16:10). Нормализованный прямоугольник { x, y, w, h }.
ALTER TABLE "Service" ADD COLUMN "coverCrop" JSONB;
