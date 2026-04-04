import * as echarts from 'echarts';

export function renderRatios(containerId: string, data: Array<{ collection: string; count: number }>) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const labels: Record<string, string> = {
    'original_post': 'Original Posts', 'reply': 'Replies',
    'app.bsky.feed.repost': 'Reposts', 'app.bsky.feed.like': 'Likes',
    'app.bsky.graph.follow': 'Follows', 'app.bsky.graph.block': 'Blocks',
  };

  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['35%', '65%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#111', borderWidth: 2 },
      label: { color: '#ccc' },
      data: data.map(d => ({ name: labels[d.collection] || d.collection, value: d.count })),
    }],
  });
}
