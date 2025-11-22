import Script from "next/script";

export const GoogleAnalytics = () => {
  const GA_MEASUREMENT_ID = "G-C5MMEHWLNZ";
  const GOOGLE_ADS_ID = "AW-17752491685";

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          
          // Google Analytics
          gtag('config', '${GA_MEASUREMENT_ID}');
          
          // Google Ads
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  );
};

