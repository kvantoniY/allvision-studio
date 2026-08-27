-- Музыкальная библиотека называлась двумя именами: админка грузила треки как
-- music-track, а услуги и редактор искали background-music — загруженный трек нигде
-- не появлялся. Канонизируем на background-music и переносим уже загруженное.
UPDATE "MediaAsset" SET "kind" = 'background-music' WHERE "kind" = 'music-track';
