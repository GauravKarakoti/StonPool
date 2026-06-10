import { StonMakerLogo } from "@/components/brand/StonMakerLogo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 mt-24">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <StonMakerLogo className="text-sm" />
        <p className="text-xs text-muted-foreground">
          Built on TON · Powered by STON.fi · © {new Date().getFullYear()} StonMaker
        </p>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Docs</a>
          <a href="#" className="hover:text-foreground transition-colors">Twitter</a>
          <a href="#" className="hover:text-foreground transition-colors">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
