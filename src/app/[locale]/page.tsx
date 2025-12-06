import { UTMCapture } from "@/components/analytics/utm-capture";
import { CTA } from "@/components/landing/cta";
import { FAQ } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { JumpRightBack } from "@/components/landing/jump-right-back";
import { SneakPeek } from "@/components/landing/sneak-peek";
import { Templates } from "@/components/landing/templates";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <UTMCapture />
      <Hero />
      <JumpRightBack />
      <Templates />
      <SneakPeek />
      {/* CTA always shown here (before FAQ) */}
      <CTA />
      <FAQ />
      {/* CTA shown here again on mobile only (after FAQ) */}
      <div className="lg:hidden">
        <CTA />
      </div>
      <Footer />
    </div>
  );
}
