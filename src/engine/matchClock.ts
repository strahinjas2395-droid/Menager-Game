/** Fixed presentation pace: 45 match minutes advance in eight real minutes. */
export const REAL_SECONDS_PER_HALF = 8 * 60;
export const MATCH_SECONDS_PER_HALF = 45 * 60;
export const MATCH_TIME_SCALE = MATCH_SECONDS_PER_HALF / REAL_SECONDS_PER_HALF;

/** Format the live clock with seconds, including second-half stoppage time. */
export function formatMatchClock(gameTime: number): string {
  const total = Math.max(0, Math.floor(gameTime));
  const regulation = 90 * 60;
  if (total <= regulation) {
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  const extra = total - regulation;
  return `90+${Math.floor(extra / 60)}:${String(extra % 60).padStart(2, "0")}`;
}
