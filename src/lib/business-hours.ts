// Horário comercial usado nos indicadores de produtividade.
export const BUSINESS_HOURS = {
  timeZone: "America/Sao_Paulo",
  // America/Sao_Paulo não tem horário de verão desde 2019: UTC-3 fixo.
  utcOffsetHours: -3,
  workDays: [1, 2, 3, 4, 5], // segunda a sexta (0 = domingo)
  startHour: 8,
  endHour: 18,
} as const;

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

// Minutos dentro do horário comercial entre dois instantes (ms desde a época).
export function businessMinutesBetween(startMs: number, endMs: number): number {
  if (!(endMs > startMs)) return 0;
  const off = BUSINESS_HOURS.utcOffsetHours * HOUR_MS;
  // Relógio local representado como UTC: o dia local começa em múltiplos de 24h.
  const s = startMs + off;
  const e = endMs + off;
  let total = 0;
  for (let day = Math.floor(s / DAY_MS) * DAY_MS; day < e; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (!(BUSINESS_HOURS.workDays as readonly number[]).includes(weekday)) continue;
    const from = Math.max(s, day + BUSINESS_HOURS.startHour * HOUR_MS);
    const to = Math.min(e, day + BUSINESS_HOURS.endHour * HOUR_MS);
    if (to > from) total += to - from;
  }
  return total / 60000;
}
