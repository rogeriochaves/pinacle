import Link from "next/link";
import { UTMCapture } from "../components/analytics/utm-capture";
import { FAQ } from "../components/landing/faq";
import { Footer } from "../components/landing/footer";
import { Hero } from "../components/landing/hero";
import { JumpRightBack } from "../components/landing/jump-right-back";
import { SneakPeek } from "../components/landing/sneak-peek";
import { Templates } from "../components/landing/templates";
import { Button } from "../components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <UTMCapture />
      <Hero />
      <JumpRightBack />
      <Templates />
      <SneakPeek />

      {/* CTA Section */}
      <section className="bg-white py-16 sm:py-20 border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold font-mono tracking-tight text-foreground sm:text-3xl mb-6">
            Ready to build?
          </h2>
          <Button variant="accent" size="lg" asChild>
            <Link href="/auth/signup" className="font-mono">
              Get Started
            </Link>
          </Button>
        </div>
      </section>

      <FAQ />
      <Footer />
    </div>
  );
}
