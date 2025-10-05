import { Features } from "../components/landing/features";
import { Footer } from "../components/landing/footer";
import { Hero } from "../components/landing/hero";
import { Pricing } from "../components/landing/pricing";
import { Templates } from "../components/landing/templates";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <Templates />
      <div id="features">
        <Features />
      </div>
      <Pricing />
      <Footer />
    </div>
  );
}
