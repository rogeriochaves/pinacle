import { headers } from "next/headers";
import { locales } from "@/i18n";

// Root layout - provides basic HTML structure with locale detection
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/";

  // Extract locale from pathname
  const locale = locales.find((loc) =>
    pathname.startsWith(`/${loc}`) || pathname === `/${loc}` || pathname === "/" && loc === "en"
  ) || "en";

  return (
    <html lang={locale}>
      <body>
        {children}
      </body>
    </html>
  );
}

