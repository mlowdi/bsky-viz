import * as echarts from 'echarts';

let chartInstance: echarts.ECharts | null = null;
let rawData: Array<{ did: string; collection: string; count: number; handle?: string | null }> = [];
let currentFilter: string = 'all';
let switcherInitialized = false;

const colors: Record<string, string> = {
  'app.bsky.feed.like': '#ff6b6b',
  'app.bsky.feed.repost': '#51cf66',
  'reply': '#339af0'
};

const labels: Record<string, string> = {
  'app.bsky.feed.like': 'Likes',
  'app.bsky.feed.repost': 'Reposts',
  'reply': 'Replies'
};

export function renderInteractions(containerId: string, data: Array<{ did: string; collection: string; count: number; handle?: string | null }>) {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  chartInstance = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chartInstance?.resize());
  }

  rawData = data;

  if (!switcherInitialized) {
    const switcher = document.getElementById('interactions-switcher');
    if (switcher) {
      switcher.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('tab-btn')) {
          switcher.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
          target.classList.add('active');
          
          currentFilter = target.getAttribute('data-filter') || 'all';
          updateChart();
        }
      });
    }
    switcherInitialized = true;
  }

  updateChart();
}

function updateChart() {
  if (currentFilter === 'all') {
    renderStacked();
  } else {
    renderFiltered();
  }
}

function getLabel(d: { did: string; handle?: string | null }) {
  return d.handle ? `@${d.handle}` : d.did.slice(0, 20) + '...';
}

function renderStacked() {
  if (!chartInstance) return;

  const map = new Map<string, { label: string; counts: Record<string, number>; total: number }>();
  
  for (const item of rawData) {
    if (!map.has(item.did)) {
      map.set(item.did, {
        label: getLabel(item),
        counts: { 'app.bsky.feed.like': 0, 'app.bsky.feed.repost': 0, 'reply': 0 },
        total: 0
      });
    }
    const entry = map.get(item.did)!;
    entry.counts[item.collection] = (entry.counts[item.collection] || 0) + item.count;
    entry.total += item.count;
  }

  const top = Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 15)
    .reverse();

  const yAxisData = top.map(d => d.label);

  const collections = ['app.bsky.feed.like', 'app.bsky.feed.repost', 'reply'];
  
  const series = collections.map(col => ({
    name: labels[col],
    type: 'bar',
    stack: 'total',
    itemStyle: { color: colors[col] },
    data: top.map(d => d.counts[col])
  }));

  chartInstance.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, textStyle: { color: '#aaa' } },
    grid: { top: 30, bottom: 30, left: 150, right: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: yAxisData, axisLabel: { fontSize: 11 } },
    series
  }, { notMerge: true });
}

function renderFiltered() {
  if (!chartInstance) return;

  const filtered = rawData.filter(d => d.collection === currentFilter);
  const top = filtered
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .reverse();

  const yAxisData = top.map(d => getLabel(d));
  const seriesData = top.map(d => ({
    value: d.count,
    itemStyle: { color: colors[d.collection] || '#0085ff' },
    name: labels[d.collection] || d.collection
  }));

  chartInstance.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 10, bottom: 30, left: 150, right: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: yAxisData, axisLabel: { fontSize: 11 } },
    series: [{
      type: 'bar',
      data: seriesData,
      label: { show: true, position: 'right', fontSize: 11 }
    }]
  }, { notMerge: true });
}
