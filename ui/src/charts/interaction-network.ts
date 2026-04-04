import * as echarts from 'echarts';

export function renderInteractions(containerId: string, data: Array<{ did: string; collection: string; count: number; handle?: string | null }>) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const labels: Record<string, string> = { 'app.bsky.feed.like': 'Liked', 'app.bsky.feed.repost': 'Reposted', 'reply': 'Replied to' };

  // Take top 15 by count, show as horizontal bar chart
  const top = data.slice(0, 15);
  const dids = top.map(d => d.handle ? `@${d.handle}` : d.did.slice(0, 20) + '...');
  const colors: Record<string, string> = { 'app.bsky.feed.like': '#ff6b6b', 'app.bsky.feed.repost': '#51cf66', 'reply': '#339af0' };

  chart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 10, bottom: 30, left: 150, right: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: dids.reverse(), axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar',
      data: top.reverse().map(d => ({
        value: d.count,
        itemStyle: { color: colors[d.collection] || '#0085ff' },
        name: labels[d.collection] || d.collection,
      })),
      label: { show: true, position: 'right', fontSize: 11 },
    }],
  });
}
