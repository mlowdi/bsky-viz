import * as echarts from 'echarts';

export function renderTimeline(containerId: string, data: Array<{ date: string; collection: string; count: number }>, profileChangeDates?: string[]) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  // Group by collection, create a line series per collection
  const collections = [...new Set(data.map(d => d.collection))];
  const dates = [...new Set(data.map(d => d.date))].sort();
  const collectionLabels: Record<string, string> = {
    'app.bsky.feed.post': 'Posts', 'app.bsky.feed.like': 'Likes',
    'app.bsky.feed.repost': 'Reposts', 'app.bsky.graph.follow': 'Follows',
    'app.bsky.graph.block': 'Blocks',
  };
  // Build lookup
  const lookup = new Map<string, number>();
  for (const d of data) lookup.set(`${d.date}|${d.collection}`, d.count);

  const series = collections.map(col => ({
    name: collectionLabels[col] || col.split('.').pop(),
    type: 'line' as const,
    smooth: true,
    symbol: 'none',
    stack: 'total',
    areaStyle: { opacity: 0.3 },
    data: dates.map(d => lookup.get(`${d}|${col}`) || 0),
  }));

  if (profileChangeDates && profileChangeDates.length > 0 && series.length > 0) {
    (series[0] as any).markLine = {
      silent: true,
      symbol: 'none',
      data: profileChangeDates.map(date => ({
        xAxis: date,
        label: { 
          formatter: 'Profile\nChange',
          position: 'start' as const,
          fontSize: 10,
          color: '#ffcc00'
        },
        lineStyle: {
          type: 'dashed' as const,
          color: '#ffcc00',
          width: 1.5,
          opacity: 0.7
        }
      }))
    };
  }

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, textStyle: { color: '#aaa' } },
    grid: { top: 40, bottom: 30, left: 50, right: 20 },
    xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45 } },
    yAxis: { type: 'value' },
    series,
  });
}
