import * as echarts from 'echarts';
import { getColor, getLabel } from '../colors';

export function renderTimeline(containerId: string, data: Array<{ date: string; collection: string; count: number }>) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  // Group by collection, create a line series per collection
  const collections = [...new Set(data.map(d => d.collection))];
  const dates = [...new Set(data.map(d => d.date))].sort();
  
  // Build lookup
  const lookup = new Map<string, number>();
  for (const d of data) lookup.set(`${d.date}|${d.collection}`, d.count);

  const series = collections.map(col => ({
    name: getLabel(col),
    type: 'line' as const,
    smooth: true,
    symbol: 'none',
    stack: 'total',
    areaStyle: { opacity: 0.3 },
    itemStyle: { color: getColor(col) },
    data: dates.map(d => lookup.get(`${d}|${col}`) || 0),
  }));

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#aaa' } },
    grid: { top: 40, bottom: 30, left: 50, right: 20 },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45 } },
    yAxis: { type: 'value' },
    series,
  });
}
