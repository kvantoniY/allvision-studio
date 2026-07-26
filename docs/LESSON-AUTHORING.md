# Памятка: как я (Claude) собираю уроки Academy

Владелец говорит: «Курс английский, модуль 1 „Первые шаги“, тема 1 „Введение“» — я собираю сцену(ы)
урока и отдаю. Владелец публикует шаблон, привязывает к теме и запускает генерации картинок/видео.

## Жёсткие правила бюджета (на 1 урок)

- **Максимум 1 видео** длительностью **10–15 секунд**.
- **Максимум 10 генераций картинок**.
- **Генерации я НЕ запускаю.** В сцене под картинки/видео оставляю элементы-плейсхолдеры, которые
  владелец потом заполнит своими или сгенерированными материалами через конструктор (кнопка
  «Выбрать материал» / «Загрузить свою» / «Сгенерировать фон»).
- Считаю бюджет заранее: сколько картинок-плейсхолдеров и есть ли видео. Если сцен много — держусь
  в пределах 10 картинок и 1 видео суммарно на урок.

## Что такое сцена (формат AcademyScene, formatVersion=1)

Документ урока = `{ scenes: AcademyScene[] }` (несколько сцен-иллюстраций по порядку). Каждая сцена:

```jsonc
{
  "formatVersion": 1,
  "id": "intro-1",
  "title": "Введение",
  "checkMode": "automatic",
  "viewport": { "width": 1280, "height": 720, "backgroundColor": "#fff7ed" },
  "initialState": "main",
  "states": [{ "id": "main", "name": "Основное" }],
  "layers": [
    { "id": "background", "name": "Фон", "kind": "background", "zIndex": 0, "elements": [ /* фон */ ] },
    { "id": "world", "name": "Сцена", "kind": "world", "zIndex": 10, "elements": [ /* персонаж, предметы */ ] },
    { "id": "ui", "name": "Интерфейс", "kind": "ui", "zIndex": 20, "elements": [ /* текст, кнопки, поле ввода */ ] }
  ],
  "rules": [ /* событие → условия → действия */ ]
}
```

### Элемент (ключевые поля)

```jsonc
{
  "id": "btn-apple", "name": "Кнопка Apple", "type": "button",
  "zIndex": 1, "visible": true, "interactive": true,
  "transform": { "x": 100, "y": 500, "width": 260, "height": 90, "rotation": 0, "opacity": 1, "scaleX": 1, "scaleY": 1, "anchorX": 0, "anchorY": 0 },
  "content": { "text": "Apple" },
  "style": { "fill": "#f97316", "textColor": "#ffffff", "fontSize": 32, "fontWeight": "700", "borderRadius": 18 },
  "states": [], "animations": {}
}
```

Типы: `background` `image` `foreground` `video` `animated-background` (нужен `asset`/плейсхолдер),
`character` (персонаж ученика — абстрактный, подставляется при подготовке), `npc` `prop`,
`text` `dialogue` `button` `card`, `input`, `timer` `progress` `indicator` `particles`,
`hotspot` `collision` `platform`, `audio`.

Единые правила стиля (совпадают в конструкторе и уроке): `style.textColor` (цвет текста),
`style.fill` (фон фигуры), `style.objectFit` (`cover`/`contain`/`fill` для картинок),
`style.borderRadius`. Фон-картинка ставится элементом `type:"background"` с `asset` ИЛИ
`content.sourceUrl` — иначе фон будет просто заливкой `viewport.backgroundColor`.

### Плейсхолдеры под генерации (владелец заполнит)

- Фон: элемент `type:"background"` БЕЗ asset — владелец нажмёт «Фон-иллюстрация» и выберет/загрузит/сгенерит.
- Картинка/предмет: `type:"image"`/`"prop"` без asset — покажется рамка «Материал не выбран»,
  владелец привяжет материал.
- Видео: `type:"video"` без asset — владелец привяжет видео (помню про лимит 1 шт., 10–15 сек).
- Цельная AI-сцена по референсу ученика: у сцены `"generation": { "mode": "full-ai", "prompt": "…" }`
  — тогда весь фон генерится по персонажу ребёнка при подготовке (считается как 1 картинка).

## Гибкие события (важно для интерактива)

Правило: `{ id, name, enabled:true, priority:0, event, conditions:[], actions:[], stopPropagation:false }`.

### Варианты ответа (несколько кнопок, одна верная)

У каждой кнопки-варианта `interactive:true` и `content.correctAnswer: true|false`. Pixi при клике
эмитит `answer-correct`/`answer-incorrect`. Реакция на уровне сцены:

```jsonc
{ "event": { "type": "answer-correct" }, "actions": [ { "type": "add-score", "value": 10 }, { "type": "show-hint", "value": "Верно!" }, { "type": "play-sound", "elementId": "snd-ok" } ] }
{ "event": { "type": "answer-incorrect" }, "actions": [ { "type": "show-hint", "value": "Попробуй ещё" }, { "type": "play-sound", "elementId": "snd-no" } ] }
```

### Проверка поля ввода

Поле: `type:"input"`, `content.correctAnswer:"apple"`, `content.acceptedValues:["яблоко"]`.
Кнопка «Проверить»: `event: element-click(btn-check)` + `conditions:[{ type:"input-correct", elementId:"answer" }]`
→ действия успеха; второе правило с `input-incorrect` → подсказка. Сравнение без регистра/пробелов.

### Звук без загрузки файла (встроенные тоны)

Добавляю элемент `type:"audio"` с `content.sourceUrl:"tone:success"` (или `"tone:wrong"`) — Pixi
проиграет короткий тон. Ссылаюсь на него в `play-sound.elementId`. Это НЕ тратит бюджет генераций.

Действия: `show-element` `hide-element` `toggle-element` `play-sound` `set-pose` `play-animation`
`add-score` `show-hint` `set-state` `set-variable` `allow-transition` `next-scene` `emit-event`.
Условия: `always` `state-is[-not]` `variable-*` `score-*` `element-visible/hidden` `role-is`
`answer-is-correct` `input-correct` `input-incorrect`.

Важно: у правила ≥1 действие; все `elementId`/`sourceElementId` в правилах должны ссылаться на
существующие элементы (иначе публикация упадёт). Персонаж ученика (`character`) в шаблоне — без asset.

## Как отдать урок владельцу

Собираю JSON документа `{ scenes: [...] }`, сохраняю в файл и создаю черновик шаблона скриптом:

```
npm run academy:template -- --file scene.json --title "Английский · Введение"
```

Скрипт печатает id шаблона. Дальше владелец в `/constructor` открывает черновик, проверяет,
публикует, и в `/admin/curriculum` привязывает к теме. Генерации картинок/видео владелец делает сам.
