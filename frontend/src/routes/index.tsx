import { createFileRoute } from "@tanstack/react-router";
import { Hero, Pillars, FlowSteps } from "@/components/landing/LandingSections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StonMaker — Your Telegram Group. Now a DAO." },
      { name: "description", content: "Propose. Vote. Execute — all inside Telegram. Powered by TON." },
      { property: "og:title", content: "StonMaker — Your Telegram Group. Now a DAO." },
      { property: "og:description", content: "Propose. Vote. Execute — all inside Telegram. Powered by TON." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <>
      <Hero />
      <Pillars />
      <FlowSteps />
    </>
  );
}
