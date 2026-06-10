import { Link } from "@tanstack/react-router";
import { StonMakerLogo } from "@/components/brand/StonMakerLogo";
import { TelegramAddLink } from "@/components/site/TelegramAddLink";
import { cn } from "@/lib/utils";
import { Menu, Send } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const navLinks = [
  { to: "/" as const, label: "Home", exact: true },
  { to: "/dashboard" as const, label: "Dashboard", exact: false },
  { to: "/how-it-works" as const, label: "How it works", exact: false },
];

const telegramButtonClass =
  "group inline-flex shrink-0 items-center gap-2 rounded-full bg-primary font-medium text-primary-foreground transition-all hover:shadow-[var(--shadow-glow)] hover:-translate-y-px";

function TelegramButton({ className }: { className?: string }) {
  return (
    <TelegramAddLink className={cn(telegramButtonClass, className)}>
      <Send className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">Add to Telegram</span>
      <span className="sm:hidden">Telegram</span>
    </TelegramAddLink>
  );
}

function NavLink({
  to,
  label,
  exact,
  className,
  onClick,
}: {
  to: "/" | "/dashboard" | "/how-it-works";
  label: string;
  exact?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      activeOptions={exact ? { exact: true } : undefined}
      activeProps={{ className: "text-foreground" }}
      className={cn("hover:text-foreground transition-colors", className)}
      onClick={onClick}
    >
      {label}
    </Link>
  );
}

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 shrink items-center">
          <StonMakerLogo className="text-[15px]" />
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          {navLinks.map((link) => (
            <NavLink key={link.to} {...link} />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <TelegramButton className="px-3 py-2 text-xs sm:px-4" />

          <Sheet>
            <SheetTrigger
              className="inline-flex md:hidden size-9 items-center justify-center rounded-full border border-border bg-surface/60 text-foreground transition-colors hover:bg-surface"
              aria-label="Open menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(100vw-2rem,20rem)]">
              <SheetHeader>
                <SheetTitle className="text-left">
                  <StonMakerLogo className="text-[15px]" />
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <SheetClose key={link.to} asChild>
                    <NavLink
                      {...link}
                      className="rounded-lg px-3 py-3 text-base text-muted-foreground hover:bg-surface hover:text-foreground"
                    />
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-8">
                <SheetClose asChild>
                  <TelegramButton className="w-full justify-center px-4 py-3 text-sm" />
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
