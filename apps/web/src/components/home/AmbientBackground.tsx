/**
 * Космический фон витрины.
 *
 * Один слой на всю страницу вместо размытых пятен в каждой секции. Так дешевле и
 * так честнее: свет на референсе — общая атмосфера страницы, а не украшение
 * отдельного блока. Слой закреплён (`fixed`), поэтому при скролле он не
 * перерисовывается, а только композитится — на телефоне это заметно.
 *
 * Всё нарисовано градиентами: звёзды — плиткой из точек, туманности — мягкими
 * радиальными пятнами, дуга — конической заливкой под маской-кольцом. Ни одного
 * `filter: blur()` на большом блоке: именно он обычно и роняет прокрутку.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-slate-950">
      {/* Базовый градиент: к низу страницы небо темнеет. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#131a3a_0%,#0a0f24_42%,#020617_100%)]" />

      {/* Звёзды в два слоя: ровный и медленно мерцающий. */}
      <div className="av-stars absolute inset-0 opacity-80" />
      <div className="av-stars-twinkle absolute inset-0" />

      {/* Туманности. Разные задержки — чтобы пятна не дышали в такт. */}
      <div className="av-nebula av-nebula-amber -left-[18vw] -top-[12vh] h-[62vh] w-[62vh]" />
      <div
        className="av-nebula av-nebula-violet -right-[14vw] top-[6vh] h-[70vh] w-[70vh]"
        style={{ animationDelay: '-9s' }}
      />
      {/*
       * Два дальних пятна — только на большом экране. Каждое анимированное пятно
       * это отдельный композитный слой во весь экран; на телефоне четыре таких
       * слоя стоят заметной памяти, а разницы в картинке на 390px почти нет.
       */}
      <div
        className="av-nebula av-nebula-rose left-[24vw] top-[52vh] hidden h-[52vh] w-[52vh] md:block"
        style={{ animationDelay: '-16s' }}
      />
      <div
        className="av-nebula av-nebula-cyan -right-[10vw] bottom-[-14vh] hidden h-[56vh] w-[56vh] md:block"
        style={{ animationDelay: '-4s' }}
      />

      {/* Световые дуги: две «кометы», уходящие за края экрана. */}
      <div className="av-arc -left-[40vw] -top-[30vh] h-[120vh] w-[120vh] opacity-70" />
      <div
        className="av-arc -right-[45vw] top-[20vh] hidden h-[130vh] w-[130vh] opacity-50 lg:block"
        style={{ transform: 'rotate(150deg)' }}
      />

      {/* Лёгкая виньетка: края экрана уходят в тень, центр остаётся читаемым. */}
      <div className="absolute inset-0 bg-[radial-gradient(100%_70%_at_50%_40%,transparent_45%,rgba(2,6,23,0.75)_100%)]" />
    </div>
  );
}
