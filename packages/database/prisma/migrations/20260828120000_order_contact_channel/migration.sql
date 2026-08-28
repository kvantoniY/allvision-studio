-- Способ связи по заявке: человек может не ждать письма, а сразу назвать мессенджер.
-- Храним отдельными колонками, а не в JSON брифа: это контакт, а не ответ на вопрос,
-- и админской карточке он нужен рядом с именем и почтой.
ALTER TABLE "CustomOrder" ADD COLUMN "contactMessenger" TEXT;
ALTER TABLE "CustomOrder" ADD COLUMN "contactHandle" TEXT;
