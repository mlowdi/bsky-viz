import * as echarts from 'echarts';

interface SleepWindow {
  date: string;
  gapStartHour: number;
  gapEndHour: number;
  gapMinutes: number;
}

function formatHour(h: number): string {
  const hour = Math.floor(h);
  const min = Math.round((h - hour) * 60);
  return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

export function renderSleepPattern(containerId: string, data: SleepWindow[]) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const dates = sortedData.map(d => d.date);

  const seriesData: any[] = [];
  sortedData.forEach((d, idx) => {
    if (d.gapStartHour > d.gapEndHour) {
      // Wraps midnight — draw two segments
      seriesData.push({
        name: d.date,
        value: [idx, d.gapStartHour, 24, d.gapMinutes, d.gapStartHour, d.gapEndHour]
      });
      seriesData.push({
        name: d.date,
        value: [idx, 0, d.gapEndHour, d.gapMinutes, d.gapStartHour, d.gapEndHour]
      });
    } else {
      seriesData.push({
        name: d.date,
        value: [idx, d.gapStartHour, d.gapEndHour, d.gapMinutes, d.gapStartHour, d.gapEndHour]
      });
    }
  });

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params: any) => {
        const d = params.value;
        const date = dates[d[0]];
        const duration = d[3];
        const start = formatHour(d[4]);
        const end = formatHour(d[5]);
        return `<b>${date}</b><br/>Sleep Window: ${start} - ${end}<br/>Duration: ${Math.floor(duration / 60)}h ${duration % 60}m`;
      }
    },
    grid: {
      top: 40,
      bottom: 60,
      left: 60,
      right: 40,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        rotate: 45,
        formatter: (value: string) => value.substring(5)
      }
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 24,
      inverse: true,
      interval: 3,
      axisLabel: {
        formatter: (value: number) => `${value}:00`
      },
      splitLine: {
        lineStyle: { color: '#222' }
      }
    },
    series: [
      {
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const categoryIndex = api.value(0);
          const startHour = api.value(1);
          const endHour = api.value(2);

          const start = api.coord([categoryIndex, startHour]);
          const end = api.coord([categoryIndex, endHour]);
          const bandWidth = api.size([1, 0])[0];
          const width = bandWidth * 0.8;

          return {
            type: 'rect',
            shape: {
              x: start[0] - width / 2,
              y: start[1],
              width: width,
              height: end[1] - start[1]
            },
            style: api.style({
              fill: '#1a3a5c'
            })
          };
        },
        data: seriesData
      }
    ]
  });
}
