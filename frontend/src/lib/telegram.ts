const DEFAULT_BOT_USERNAME = "StonMakerBot";

export function getBotUsername(): string {
  return (import.meta.env.VITE_BOT_USERNAME || DEFAULT_BOT_USERNAME).replace(/^@/, "");
}

/**
 * Opens the bot DM with start=add, which shows Telegram's native "Select your group" button.
 * Websites cannot add a bot to a group directly — Telegram requires in-app confirmation.
 */
export function getTelegramAddToGroupUrl(): string {
  return `https://t.me/${getBotUsername()}?start=add`;
}

export function getTelegramTgAddToGroupUrl(): string {
  return `tg://resolve?domain=${getBotUsername()}&start=add`;
}

/** @deprecated Use getTelegramAddToGroupUrl */
export function getTelegramBotUrl(): string {
  return getTelegramAddToGroupUrl();
}

export function openTelegramAddToGroup(): void {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  window.location.href = isMobile ? getTelegramTgAddToGroupUrl() : getTelegramAddToGroupUrl();
}
