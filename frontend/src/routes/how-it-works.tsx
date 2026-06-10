import { createFileRoute } from "@tanstack/react-router";
import { FadeUp } from "@/components/site/FadeUp";
import { TelegramAddLink } from "@/components/site/TelegramAddLink";
import { Send, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How it Works — StonMaker" },
      { name: "description", content: "From Telegram group to on-chain DAO in five steps. Here's how StonMaker turns conversation into consensus." },
      { property: "og:title", content: "How it Works — StonMaker" },
      { property: "og:description", content: "From Telegram group to on-chain DAO in five steps." },
    ],
  }),
  component: HowItWorksPage,
});

const steps = [
  { n: "01", title: "Add the bot to your group", body: "Invite @StonMakerBot to your Telegram chat. It introduces itself, creates a TON treasury, and locks the multisig keys to your group — not us." },
  { n: "02", title: "Approve your members", body: "The bot pings every member with a one-tap signature request. Only approved wallets get a vote. No spreadsheets, no Discord roles." },
  { n: "03", title: "Propose anything", body: "Type /propose followed by what you want to do — a transfer, a swap on STON.fi, a parameter change. The bot turns plain text into a structured on-chain proposal." },
  { n: "04", title: "Vote inside the chat", body: "Members vote with inline buttons. Tallies update in real time. The bot enforces your quorum threshold — no execution until the room agrees." },
  { n: "05", title: "Execute on TON", body: "Once a proposal passes, the bot signs and broadcasts the transaction. The tx hash is posted back to the chat. Auditable, irreversible, instant." },
];

function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-20 md:pt-28 pb-12">
      <FadeUp>
        <div className="text-center mb-24">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">How it works</p>
          <h1 className="mt-4 text-4xl md:text-5xl font-semibold tracking-tight text-balance headline-gradient">
            From group chat to consensus.
          </h1>
          <p className="mt-5 text-base text-muted-foreground max-w-xl mx-auto text-balance">
            Five steps. No new app to learn. Your community stays where it is — the governance just becomes real.
          </p>
        </div>
      </FadeUp>

      <ol className="space-y-28">
        {steps.map((s, i) => (
          <FadeUp key={s.n} delay={i * 80}>
            <li className="relative">
              <span aria-hidden className="absolute -top-10 -left-2 md:-left-8 text-[140px] md:text-[180px] font-semibold leading-none tracking-tighter text-foreground/[0.04] select-none pointer-events-none">
                {s.n}
              </span>
              <div className="relative">
                <p className="text-xs uppercase tracking-[0.18em] text-primary/80">Step {s.n}</p>
                <h2 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight text-balance">{s.title}</h2>
                <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-xl">{s.body}</p>
              </div>
            </li>
          </FadeUp>
        ))}
      </ol>

      <FadeUp delay={200}>
        <section className="mt-32 relative overflow-hidden rounded-3xl glass-card px-8 py-14 md:px-14 md:py-20 text-center">
          <div className="absolute inset-0 bg-radial-glow opacity-80 pointer-events-none" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance headline-gradient">
              Ready to DAO your group?
            </h2>
            <p className="mt-4 text-sm text-muted-foreground max-w-md mx-auto">
              Add the bot. Approve your members. Run your first vote in under five minutes.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4 flex-wrap">
              <TelegramAddLink className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5">
                <Send className="size-4" />
                Add to Telegram
              </TelegramAddLink>
              <a href="/dashboard" className="group inline-flex items-center gap-2 text-sm font-medium text-foreground/90 hover:text-foreground transition-colors">
                See a live treasury
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </section>
      </FadeUp>
    </div>
  );
}
