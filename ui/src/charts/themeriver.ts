import * as echarts from 'echarts';

export function renderThemeRiver(containerId: string, data: { clusters: Array<{ id: number; label: string }>, series: Array<{ date: string; clusterId: number; count: number }> }): void {
  const el = document.getElementById(containerId)!;
  const existingChart = echarts.getInstanceByDom(el);
  const chart = existingChart || echarts.init(el, 'dark');

  if (!existingChart) {
    window.addEventListener('resize', () => chart.resize());
  }

  const clusterMap = new Map<number, string>();
  data.clusters.forEach(c => clusterMap.set(c.id, c.label));

  // Normalize: convert absolute counts to percentages per time bin
  const dateTotals = new Map<string, number>();
  for (const s of data.series) {
    dateTotals.set(s.date, (dateTotals.get(s.date) || 0) + s.count);
  }

  const normalizedData = data.series.map(s => {
    const total = dateTotals.get(s.date) || 1;
    return [
      s.date,
      Math.round((s.count / total) * 100 * 10) / 10,
      clusterMap.get(s.clusterId) || `Cluster ${s.clusterId}`
    ];
  });

  const PALETTE = [
    '#339af0', '#845ef7', '#ff6b6b', '#51cf66', '#22b8cf', '#ff922b',
    '#f06595', '#ae3ec9', '#20c997', '#fab005', '#e64980', '#4c6ef5',
    '#94d82d', '#fd7e14', '#15aabf', '#be4bdb'
  ];

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        let res = `<div style="margin-bottom: 5px; font-weight: bold;">${params[0].value[0]}</div>`;
        params.forEach((p: any) => {
          res += `<div style="display: flex; justify-content: space-between; gap: 10px;">
            <span>${p.marker} ${p.value[2]}</span>
            <span style="font-weight: bold;">${p.value[1]}%</span>
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
        data: normalizedData,
        label: { show: false },
        color: PALETTE
      }
    ]
  });
}
