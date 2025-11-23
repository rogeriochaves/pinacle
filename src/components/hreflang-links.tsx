"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { generateHreflangLinks } from "@/lib/hreflang";

export function HreflangLinks() {
  const pathname = usePathname();

  useEffect(() => {
    // Remove any existing hreflang links
    const existingLinks = document.querySelectorAll('link[rel="alternate"][hreflang]');
    existingLinks.forEach(link => link.remove());

    // Generate and add new hreflang links
    const links = generateHreflangLinks(pathname);
    const head = document.head;

    links.forEach(link => {
      const linkElement = document.createElement('link');
      linkElement.rel = link.rel;
      linkElement.hreflang = link.hreflang;
      linkElement.href = link.href;
      head.appendChild(linkElement);
    });

    // Cleanup function
    return () => {
      links.forEach(link => {
        const linkElement = document.querySelector(`link[rel="alternate"][hreflang="${link.hreflang}"]`);
        if (linkElement) {
          linkElement.remove();
        }
      });
    };
  }, [pathname]);

  return null; // This component doesn't render anything
}
