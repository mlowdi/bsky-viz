import * as echarts from 'echarts';
import { getColor, getLabel } from '../colors';

export function renderRatios(containerId: string, data: Array<{ collection: string; count: number }>) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#111', borderWidth: 2 },
      label: { color: '#ccc' },
      data: data.map(d => ({ 
        name: getLabel(d.collection), 
        value: d.count,
        itemStyle: { color: getColor(d.collection) }
      })),
    }],
  });
}
