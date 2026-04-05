import * as echarts from 'echarts';

interface TypicalDayPoint {
  hour: number;
  collection: string;
  count: number;
}

const SERIES_CONFIG: Record<string, { name: string; color: string }> = {
  'original_post': { name: 'Original Posts', color: '#339af0' },
  'reply': { name: 'Replies', color: '#845ef7' },
  'app.bsky.feed.like': { name: 'Likes', color: '#ff6b6b' },
  'app.bsky.feed.repost': { name: 'Reposts', color: '#51cf66' },
  'app.bsky.graph.follow': { name: 'Follows', color: '#22b8cf' },
  'app.bsky.graph.block': { name: 'Blocks', color: '#ff922b' },
};

export function renderTypicalDay(containerId: string, data: TypicalDayPoint[]) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
  const collections = Object.keys(SERIES_CONFIG);
  
  const series = collections.map(col => {
    const config = SERIES_CONFIG[col];
    const seriesData = Array(24).fill(0);
    
    data.filter(d => d.collection === col).forEach(d => {
      if (d.hour >= 0 && d.hour < 24) {
        seriesData[d.hour] = d.count;
      }
    });

    return {
      name: config.name,
      type: 'bar',
      stack: 'total',
      color: config.color,
      data: seriesData,
      emphasis: { focus: 'series' },
    };
  });

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: collections.map(col => SERIES_CONFIG[col].name),
      bottom: 0
    },
    grid: {
      top: 40,
      left: 60,
      right: 20,
      bottom: 70,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: hours
    },
    yAxis: {
      type: 'value',
      name: 'Events'
    },
    series
  });
}
