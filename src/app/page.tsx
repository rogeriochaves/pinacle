import { Footer } from "../components/landing/footer";
import { Hero } from "../components/landing/hero";
import { JumpRightBack } from "../components/landing/jump-right-back";
import { Templates } from "../components/landing/templates";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Hero />
      <JumpRightBack />
      <Templates />
      <Footer />
    </div>
  );
}
