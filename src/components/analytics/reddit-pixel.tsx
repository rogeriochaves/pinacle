import Script from "next/script";

export const RedditPixel = () => {
  const REDDIT_PIXEL_ID = "a2_i470svrjbwmv";

  return (
    <Script id="reddit-pixel" strategy="afterInteractive">
      {`
        !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
        rdt('init','${REDDIT_PIXEL_ID}');
        rdt('track', 'PageVisit');
      `}
    </Script>
  );
};

