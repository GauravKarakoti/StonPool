/**
 * Parse a duration string like "24h", "2d", "1w" into hours.
 */
export function parseDurationToHours(text: string): number | null {
    const trimmed = text.trim().toLowerCase();
    const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks)$/);
    if (!match) return null;

    const value = parseFloat(match[1]!);
    if (value <= 0) return null;

    const unit = match[2]!;
    if (unit.startsWith('h')) return value;
    if (unit.startsWith('d')) return value * 24;
    if (unit.startsWith('w')) return value * 24 * 7;
    return null;
}

export function formatDurationFromHours(hours: number): string {
    if (hours % (24 * 7) === 0 && hours >= 24 * 7) {
        const weeks = hours / (24 * 7);
        return weeks === 1 ? '1 week' : `${weeks} weeks`;
    }
    if (hours % 24 === 0 && hours >= 24) {
        const days = hours / 24;
        return days === 1 ? '1 day' : `${days} days`;
    }
    return hours === 1 ? '1 hour' : `${hours} hours`;
}

export function formatExpiresIn(expiresAt: Date | null | undefined): string {
    if (!expiresAt) return 'No expiry set';
    const ms = expiresAt.getTime() - Date.now();
    if (ms <= 0) return 'Expired';
    const hours = Math.ceil(ms / (1000 * 60 * 60));
    if (hours >= 24 * 7) {
        const weeks = Math.ceil(hours / (24 * 7));
        return weeks === 1 ? '1 week' : `${weeks} weeks`;
    }
    if (hours >= 24) {
        const days = Math.ceil(hours / 24);
        return days === 1 ? '1 day' : `${days} days`;
    }
    return hours === 1 ? '1 hour' : `${hours} hours`;
}
