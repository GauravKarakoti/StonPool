import { Link } from "@tanstack/react-router";
import { ArrowRight, Send, MessageCircle, Vote, Zap, Users, FileText, CheckCircle2 } from "lucide-react";
import { FadeUp } from "@/components/site/FadeUp";
import { TelegramAddLink } from "@/components/site/TelegramAddLink";

export function Hero() {
  return (
    <section className="relative min-h-[92vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-radial-glow pointer-events-none" />
      <div className="absolute inset-0 bg-grid opacity-[0.18] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)] pointer-events-none" />

      <div className="relative mx-auto max-w-4xl px-6 text-center">
        <FadeUp delay={0}>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full rounded-full bg-primary opacity-70 animate-ping" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            Live on TON testnet
          </div>
        </FadeUp>

        <FadeUp delay={120}>
          <h1 className="mt-7 text-balance text-5xl md:text-7xl font-semibold tracking-[-0.04em] leading-[1.02] headline-gradient">
            Your Telegram Group.<br />Now a DAO.
          </h1>
        </FadeUp>

        <FadeUp delay={260}>
          <p className="mt-6 text-balance text-base md:text-lg text-muted-foreground max-w-xl mx-auto">
            Propose. Vote. Execute — all inside Telegram. Powered by TON.
          </p>
        </FadeUp>

        <FadeUp delay={380}>
          <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
            <TelegramAddLink className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-all hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5">
              <Send className="size-4" />
              Add to Telegram
            </TelegramAddLink>
            <Link
              to="/dashboard"
              className="group inline-flex items-center gap-2 text-sm font-medium text-foreground/90 hover:text-foreground transition-colors"
            >
              Explore a Treasury
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

const pillars = [
  { Icon: MessageCircle, label: "Govern in Telegram", text: "Run your DAO where your community already lives. Zero context-switching." },
  { Icon: Vote, label: "Democratic Proposals", text: "Quorum-backed votes, transparent tallies, executed only when consensus is real." },
  { Icon: Zap, label: "Execute on TON via STON.fi", text: "Swaps and transfers settle on-chain in seconds — gas-light and verifiable." },
];

export function Pillars() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-32">
      <div className="grid md:grid-cols-3 gap-12 md:gap-8">
        {pillars.map((p, i) => (
          <FadeUp key={p.label} delay={i * 120}>
            <div className="group">
              <p.Icon className="size-5 text-primary mb-5 transition-transform group-hover:-translate-y-0.5" />
              <h3 className="text-base font-semibold tracking-tight text-foreground">{p.label}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.text}</p>
            </div>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}

const steps = [
  { Icon: Users, label: "Join" },
  { Icon: FileText, label: "Propose" },
  { Icon: Vote, label: "Vote" },
  { Icon: CheckCircle2, label: "Execute" },
];

export function FlowSteps() {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-32">
      <FadeUp>
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">The flow</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-balance">
            Four steps. One Telegram chat.
          </h2>
        </div>
      </FadeUp>

      <FadeUp delay={150}>
        <div className="relative">
          <div className="absolute top-6 left-[8%] right-[8%] h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
          <div className="absolute top-6 left-[8%] right-[8%] h-px bg-primary/30 blur-sm" />

          <ol className="relative grid grid-cols-4 gap-2">
            {steps.map((s, i) => (
              <li key={s.label} className="flex flex-col items-center text-center">
                <div className="relative size-12 rounded-full glass-card flex items-center justify-center transition-all hover:shadow-[var(--shadow-glow)] hover:-translate-y-0.5">
                  <s.Icon className="size-5 text-primary" />
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.15em] text-muted-foreground">0{i + 1}</p>
                <p className="mt-1 text-sm font-medium text-foreground">{s.label}</p>
              </li>
            ))}
          </ol>
        </div>
      </FadeUp>
    </section>
  );
}
