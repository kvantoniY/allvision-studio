import Script from 'next/script';

// Аналитика подключается через env (build-time NEXT_PUBLIC_*). Пока id не задан —
// ничего не рендерится. Заполнить NEXT_PUBLIC_YANDEX_METRICA_ID / NEXT_PUBLIC_GA_ID
// и пересобрать web, чтобы счётчики появились.
const YANDEX_METRICA_ID = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function Analytics() {
  return (
    <>
      {YANDEX_METRICA_ID ? (
        <>
          <Script id="yandex-metrica" strategy="afterInteractive">
            {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${YANDEX_METRICA_ID},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://mc.yandex.ru/watch/${YANDEX_METRICA_ID}`} style={{ position: 'absolute', left: '-9999px' }} alt="" />
          </noscript>
        </>
      ) : null}

      {GA_ID ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      ) : null}
    </>
  );
}
