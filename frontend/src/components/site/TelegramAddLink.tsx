import { getTelegramAddToGroupUrl, openTelegramAddToGroup } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import type { MouseEvent, ReactNode } from "react";

type Props = {
  className?: string;
  children: ReactNode;
};

/**
 * Step 1: opens Telegram → bot DM with a native "Select your group" button.
 * Step 2 (in Telegram): user picks their group and confirms — then the bot is added.
 */
export function TelegramAddLink({ className, children }: Props) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openTelegramAddToGroup();
  };

  return (
    <a href={getTelegramAddToGroupUrl()} onClick={handleClick} className={cn(className)}>
      {children}
    </a>
  );
}
