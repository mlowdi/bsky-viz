import * as echarts from 'echarts';

export function renderSocial(
  containerId: string,
  follows: Array<{ created_at: number; subject_did: string }>,
  blocks: Array<{ created_at: number; subject_did: string }>
) {
  const el = document.getElementById(containerId)!;
  const chart = echarts.init(el, 'dark');

  // Cumulative follow/block count over time
  const followDates = follows.map(f => new Date(f.created_at).toISOString().slice(0, 10));
  const blockDates = blocks.map(b => new Date(b.created_at).toISOString().slice(0, 10));
  const allDates = [...new Set([...followDates, ...blockDates])].sort();

  // Count per day
  const followCounts = new Map<string, number>();
  const blockCounts = new Map<string, number>();
  for (const d of followDates) followCounts.set(d, (followCounts.get(d) || 0) + 1);
  for (const d of blockDates) blockCounts.set(d, (blockCounts.get(d) || 0) + 1);

  // Cumulative
  let fCum = 0, bCum = 0;
  const fData = allDates.map(d => { fCum += followCounts.get(d) || 0; return fCum; });
  const bData = allDates.map(d => { bCum += blockCounts.get(d) || 0; return bCum; });

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#aaa' } },
    grid: { top: 40, bottom: 30, left: 60, right: 20 },
    xAxis: { type: 'category', data: allDates },
    yAxis: { type: 'value' },
    series: [
      { name: 'Follows (cumulative)', type: 'line', smooth: true, symbol: 'none', data: fData, lineStyle: { color: '#51cf66' }, itemStyle: { color: '#51cf66' } },
      { name: 'Blocks (cumulative)', type: 'line', smooth: true, symbol: 'none', data: bData, lineStyle: { color: '#ff6b6b' }, itemStyle: { color: '#ff6b6b' } },
    ],
  });
  window.addEventListener('resize', () => chart.resize());
}
