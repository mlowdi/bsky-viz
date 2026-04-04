export let currentOffsetHours = Math.round(-new Date().getTimezoneOffset() / 60);

export function setOffsetHours(offset: number) {
  currentOffsetHours = offset;
}

export function shiftHeatmapData(
  data: Array<{ dayOfWeek: number; hourOfDay: number; count: number }>,
  offsetHours: number
): Array<{ dayOfWeek: number; hourOfDay: number; count: number }> {
  return data.map(d => {
    let newHour = Math.floor(d.hourOfDay + offsetHours);
    let newDay = d.dayOfWeek;

    while (newHour >= 24) {
      newHour -= 24;
      newDay = (newDay + 1) % 7;
    }
    while (newHour < 0) {
      newHour += 24;
      newDay = (newDay - 1 + 7) % 7;
    }

    return {
      dayOfWeek: newDay,
      hourOfDay: newHour,
      count: d.count
    };
  });
}

export function getTimezoneLabel(): string {
  const localOffset = Math.round(-new Date().getTimezoneOffset() / 60);
  if (currentOffsetHours === localOffset) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    } catch {}
    return `Local (UTC${localOffset >= 0 ? '+' : ''}${localOffset})`;
  }
  return `UTC${currentOffsetHours >= 0 ? '+' : ''}${currentOffsetHours}`;
}
