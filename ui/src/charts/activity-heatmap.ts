import * as echarts from 'echarts';

export function renderHeatmap(containerId: string, data: Array<{ dayOfWeek: number; hourOfDay: number; count: number }>) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  // ECharts heatmap data format: [xIndex, yIndex, value]
  const heatData = data.map(d => [d.hourOfDay, d.dayOfWeek, d.count]);
  const maxVal = Math.max(...data.map(d => d.count), 1);

  chart.setOption({
    tooltip: {
      position: 'top',
      formatter: (p: any) => {
        if (!p || !p.value) return '';
        const day = days[p.value[1]];
        const hour = hours[p.value[0]];
        const count = p.value[2];
        if (!count) return `${day} ${hour}: No activity`;
        return `${day} ${hour}: ${count} records`;
      }
    },
    grid: { top: 10, bottom: 40, left: 60, right: 20 },
    xAxis: { type: 'category', data: hours, splitArea: { show: true } },
    yAxis: { type: 'category', data: days, splitArea: { show: true } },
    visualMap: { min: 0, max: maxVal, calculable: true, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#0a0a2e', '#003366', '#0066cc', '#0085ff', '#33aaff'] } },
    series: [{ type: 'heatmap', data: heatData, label: { show: false }, emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' } } }]
  });
}
