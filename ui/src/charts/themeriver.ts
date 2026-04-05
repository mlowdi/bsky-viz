import * as echarts from 'echarts';

interface ClusterData {
  clusters: Array<{ id: number; label: string }>;
  series: Array<{ date: string; clusterId: number; count: number }>;
  posts?: Array<{ clusterId: number; text: string; createdAt: number }>;
}

type DisplayMode = 'normalized' | 'absolute';

let currentMode: DisplayMode = 'normalized';
let lastData: ClusterData | null = null;
let lastContainerId: string = '';

export function setThemeRiverMode(mode: DisplayMode): void {
  currentMode = mode;
  if (lastData && lastContainerId) {
    renderThemeRiver(lastContainerId, lastData);
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max) + '...' : text;
}

function showPostsModal(label: string, posts: Array<{ text: string; createdAt: number }>): void {
  // Remove any existing modal
  document.getElementById('cluster-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'cluster-modal-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:#111;border:1px solid #222;border-radius:8px;max-width:700px;width:90%;max-height:80vh;display:flex;flex-direction:column;color:#e0e0e0;';

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #222;flex-shrink:0;';
  const title = document.createElement('h3');
  title.style.cssText = 'margin:0;font-size:16px;color:#0085ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
  title.textContent = label;
  title.title = label;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.style.cssText = 'background:none;border:none;color:#e0e0e0;font-size:24px;cursor:pointer;padding:0 0 0 12px;line-height:1;';
  closeBtn.onclick = () => overlay.remove();
  header.appendChild(title);
  header.appendChild(closeBtn);

  // Post count
  const countBar = document.createElement('div');
  countBar.style.cssText = 'padding:8px 20px;font-size:13px;color:#888;border-bottom:1px solid #222;flex-shrink:0;';
  countBar.textContent = `${posts.length} post${posts.length !== 1 ? 's' : ''}`;

  // Content
  const content = document.createElement('div');
  content.style.cssText = 'overflow-y:auto;padding:12px 20px;flex:1;';

  const sorted = [...posts].sort((a, b) => a.createdAt - b.createdAt);
  for (const post of sorted) {
    const item = document.createElement('div');
    item.style.cssText = 'padding:10px 0;border-bottom:1px solid #1a1a1a;';
    const time = document.createElement('div');
    time.style.cssText = 'font-size:12px;color:#666;margin-bottom:4px;';
    time.textContent = formatDate(post.createdAt);
    const text = document.createElement('div');
    text.style.cssText = 'font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word;';
    text.textContent = truncate(post.text, 500);
    item.appendChild(time);
    item.appendChild(text);
    content.appendChild(item);
  }

  modal.appendChild(header);
  modal.appendChild(countBar);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

export function renderThemeRiver(containerId: string, data: ClusterData): void {
  lastData = data;
  lastContainerId = containerId;

  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const clusterMap = new Map<number, string>();
  data.clusters.forEach(c => clusterMap.set(c.id, c.label));

  // Build label -> clusterId reverse map for click handler
  const labelToId = new Map<string, number>();
  data.clusters.forEach(c => labelToId.set(c.label, c.id));

  let chartData: (string | number)[][];

  if (currentMode === 'normalized') {
    const dateTotals = new Map<string, number>();
    for (const s of data.series) {
      dateTotals.set(s.date, (dateTotals.get(s.date) || 0) + s.count);
    }
    chartData = data.series.map(s => {
      const total = dateTotals.get(s.date) || 1;
      return [
        s.date,
        Math.round((s.count / total) * 100 * 10) / 10,
        clusterMap.get(s.clusterId) || `Cluster ${s.clusterId}`
      ];
    });
  } else {
    chartData = data.series.map(s => [
      s.date,
      s.count,
      clusterMap.get(s.clusterId) || `Cluster ${s.clusterId}`
    ]);
  }

  const PALETTE = [
    '#339af0', '#845ef7', '#ff6b6b', '#51cf66', '#22b8cf', '#ff922b',
    '#f06595', '#ae3ec9', '#20c997', '#fab005', '#e64980', '#4c6ef5',
    '#94d82d', '#fd7e14', '#15aabf', '#be4bdb'
  ];

  const isNormalized = currentMode === 'normalized';

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="margin-bottom: 5px; font-weight: bold;">${params[0].value[0]}</div>`;
        params.forEach((p: any) => {
          const val = isNormalized ? `${p.value[1]}%` : p.value[1].toLocaleString();
          res += `<div style="display: flex; justify-content: space-between; gap: 10px;">
            <span>${p.marker} ${p.value[2]}</span>
            <span style="font-weight: bold;">${val}</span>
          </div>`;
        });
        return res;
      }
    },
    singleAxis: {
      top: 20,
      bottom: 30,
      left: 50,
      right: 50,
      type: 'time',
      axisPointer: {
        animation: true,
        label: { show: true }
      },
      splitLine: {
        show: true,
        lineStyle: { type: 'dashed', opacity: 0.1 }
      }
    },
    series: [
      {
        type: 'themeRiver',
        emphasis: {
          itemStyle: {
            shadowBlur: 20,
            shadowColor: 'rgba(0, 0, 0, 0.8)'
          }
        },
        data: chartData,
        label: { show: false },
        color: PALETTE
      }
    ]
  });

  // Click handler for opening post modal
  chart.off('click');
  chart.on('click', (params: any) => {
    if (!data.posts || data.posts.length === 0) return;
    const seriesName = params.value?.[2] || params.name;
    if (!seriesName) return;

    const clusterId = labelToId.get(seriesName);
    if (clusterId === undefined) return;

    const clusterPosts = data.posts.filter(p => p.clusterId === clusterId);
    if (clusterPosts.length === 0) return;

    showPostsModal(seriesName, clusterPosts);
  });
}
