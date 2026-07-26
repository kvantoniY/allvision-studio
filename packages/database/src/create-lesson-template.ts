import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from './index';

/**
 * Создаёт ЧЕРНОВИК шаблона урока из JSON-документа сцены (для авторинга уроков).
 * Валидацию делает публикация в UI — здесь просто вставляем draft.
 *
 * Использование:
 *   npm run academy:template -- --file scene.json --title "Английский · Введение" [--topic <topicId>] [--author <email>]
 *
 * scene.json — либо документ { "scenes": [ ... ] }, либо одиночная сцена { "layers": [ ... ] }.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg('file');
  const title = arg('title');
  const topicId = arg('topic') ?? null;
  const authorEmail = arg('author');
  if (!file || !title) {
    console.error('Нужны --file <scene.json> и --title "<название>"');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(file, 'utf-8'));
  const scene = Array.isArray(raw?.scenes) || Array.isArray(raw?.layers)
    ? (Array.isArray(raw?.scenes) ? raw : { scenes: [raw] })
    : null;
  if (!scene) {
    console.error('JSON должен быть документом { scenes: [...] } или сценой { layers: [...] }');
    process.exit(1);
  }

  const author = authorEmail
    ? await prisma.user.findFirst({ where: { email: authorEmail } })
    : await prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'METHODIST'] } }, orderBy: { createdAt: 'asc' } });
  if (!author) {
    console.error('Не найден автор (ADMIN/METHODIST). Укажите --author <email>.');
    process.exit(1);
  }

  const template = await prisma.lessonTemplate.create({
    data: { title, status: 'draft', scene, latestVersion: 0, createdById: author.id, topicId },
    select: { id: true, title: true },
  });
  console.log(`Черновик шаблона создан: ${template.id} — «${template.title}»`);
  console.log('Дальше: открыть в /constructor, проверить, опубликовать, привязать к теме в /admin/curriculum.');
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
