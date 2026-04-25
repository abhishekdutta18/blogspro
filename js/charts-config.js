// BlogsPro — Google Charts Configuration (extracted from index.html)
// Assigned to window.* so the ES module (init.js) can read them across the
// classic-script / module-script boundary.

window.chartsReadyPromise = google.charts.load('current', { packages: ['corechart', 'gauge'] });
window.CHART_THEME = {
  backgroundColor: '#0a0f1d',
  fontName: 'JetBrains Mono',
  colors: ['#BFA100', '#FFB800', '#D4AF37', '#8A6D3B'],
  legend: {
    position: 'top',
    alignment: 'center',
    textStyle: { color: 'rgba(191,161,0,0.8)', fontSize: 10 }
  },
  chartArea: { left: 60, right: 20, top: 40, bottom: 60, width: '85%', height: '70%' },
  hAxis: {
    title: 'Observation Period',
    textStyle: { color: 'rgba(191,161,0,0.6)', fontSize: 9 },
    titleTextStyle: { color: 'rgba(191,161,0,0.8)', fontSize: 10, italic: true },
    gridlines: { color: 'rgba(191,161,0,0.1)' },
    baselineColor: 'rgba(191,161,0,0.3)'
  },
  vAxis: {
    title: 'Value Drift %',
    textStyle: { color: 'rgba(191,161,0,0.6)', fontSize: 9 },
    titleTextStyle: { color: 'rgba(191,161,0,0.8)', fontSize: 10, italic: true },
    gridlines: { color: 'rgba(191,161,0,0.1)' },
    baselineColor: 'rgba(191,161,0,0.3)'
  }
};
