/* ═══════════════════════════════════════════════════════════
   script.js — Expense Analyzer Dashboard Logic
   Vanilla JavaScript · Chart.js 4 · No frameworks
═══════════════════════════════════════════════════════════ */

'use strict';

/* ══════════════════════════════════════════════════════════
   CONSTANTS & CONFIG
══════════════════════════════════════════════════════════ */
const DATA_PATH = 'expenses.json';

const PALETTE = {
  emerald   : '#2DC999',
  emeraldT  : 'rgba(45,201,153,.18)',
  blue      : '#3B82F6',
  orange    : '#F97316',
  purple    : '#A855F7',
  red       : '#EF4444',
  pink      : '#EC4899',
  yellow    : '#F59E0B',
  teal      : '#14B8A6',
  indigo    : '#6366F1',
  slate     : '#64748B',
  cyan      : '#06B6D4',
};

const CATEGORY_COLORS = {
  'Food & Dining'  : PALETTE.orange,
  'Transportation' : PALETTE.blue,
  'Groceries'      : PALETTE.emerald,
  'Entertainment'  : PALETTE.purple,
  'Shopping'       : PALETTE.pink,
  'Utilities'      : PALETTE.teal,
  'Health'         : PALETTE.red,
  'Internet'       : PALETTE.indigo,
  'Savings'        : PALETTE.yellow,
  'Other'          : PALETTE.slate,
};

const PAYMENT_COLORS = [
  '#2DC999','#3B82F6','#F97316','#A855F7',
  '#EC4899','#14B8A6','#EF4444','#6366F1',
  '#F59E0B','#06B6D4','#64748B',
];

const TYPE_COLORS = {
  Needs  : '#2DC999',
  Wants  : '#F97316',
  Savings: '#3B82F6',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let allData      = [];   // master data (JSON + session adds)
let filteredData = [];   // current filter result
let charts       = {};   // Chart.js instances keyed by id

/* ══════════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════════ */
const fmtIDR = (n) =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

const fmtIDRShort = (n) => {
  if (n >= 1_000_000_000) return 'Rp ' + (n / 1_000_000_000).toFixed(1) + 'M';
  if (n >= 1_000_000)     return 'Rp ' + (n / 1_000_000).toFixed(1) + 'Jt';
  if (n >= 1_000)         return 'Rp ' + (n / 1_000).toFixed(0) + 'K';
  return 'Rp ' + n;
};

const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const monthKey = (iso) => iso.slice(0, 7);   // 'YYYY-MM'

const monthLabel = (key) => {
  const [y, m] = key.split('-');
  return MONTH_NAMES[parseInt(m, 10) - 1] + ' ' + y;
};

const groupBy = (arr, fn) =>
  arr.reduce((acc, item) => {
    const k = fn(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});

const sumBy = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

/* unique sorted array */
const uniq = (arr) => [...new Set(arr)].sort();

/* unique days count */
const uniqueDays = (arr) => new Set(arr.map(x => x.date)).size;

/* ══════════════════════════════════════════════════════════
   CHART.JS GLOBAL DEFAULTS
══════════════════════════════════════════════════════════ */
Chart.defaults.font.family = "-apple-system, 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#94A3B8';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.plugins.tooltip.padding     = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.backgroundColor = '#1E293B';
Chart.defaults.plugins.tooltip.titleColor  = '#F8FAFC';
Chart.defaults.plugins.tooltip.bodyColor   = '#94A3B8';
Chart.defaults.plugins.tooltip.borderColor = '#334155';
Chart.defaults.plugins.tooltip.borderWidth = 1;

/* ══════════════════════════════════════════════════════════
   BOOTSTRAP — load data, populate filters, render all
══════════════════════════════════════════════════════════ */
async function init() {
  try {
    const res  = await fetch(DATA_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allData = await res.json();
  } catch (e) {
    showToast('⚠ Could not load expenses.json. Using empty dataset.', 'error');
    allData = [];
  }

  populateFilters();
  applyFilters();
  bindEvents();

  // last updated
  const lu = document.getElementById('lastUpdated');
  if (lu) lu.textContent = 'Updated: ' + new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

/* ══════════════════════════════════════════════════════════
   POPULATE FILTER DROPDOWNS
══════════════════════════════════════════════════════════ */
function populateFilters() {
  const months     = uniq(allData.map(x => monthKey(x.date)));
  const categories = uniq(allData.map(x => x.category));
  const payments   = uniq(allData.map(x => x.payment_method));

  fillSelect('filterMonth',    months,     monthLabel);
  fillSelect('filterCategory', categories);
  fillSelect('filterPayment',  payments);
}

function fillSelect(id, values, labelFn) {
  const sel = document.getElementById(id);
  if (!sel) return;
  // keep first "All" option
  while (sel.options.length > 1) sel.remove(1);
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = labelFn ? labelFn(v) : v;
    sel.appendChild(opt);
  });
}

/* ══════════════════════════════════════════════════════════
   APPLY FILTERS
══════════════════════════════════════════════════════════ */
function applyFilters() {
  const month   = document.getElementById('filterMonth').value;
  const cat     = document.getElementById('filterCategory').value;
  const payment = document.getElementById('filterPayment').value;
  const type    = document.getElementById('filterType').value;

  filteredData = allData.filter(x => {
    if (month   && monthKey(x.date)    !== month)   return false;
    if (cat     && x.category          !== cat)     return false;
    if (payment && x.payment_method    !== payment) return false;
    if (type    && x.type              !== type)    return false;
    return true;
  });

  const rc = document.getElementById('resultCount');
  if (rc) rc.textContent = filteredData.length + ' transaction' + (filteredData.length !== 1 ? 's' : '');

  renderKPIs();
  renderSmartInsight();
  renderAllCharts();
  renderTable();
}

/* ══════════════════════════════════════════════════════════
   KPI CARDS
══════════════════════════════════════════════════════════ */
function renderKPIs() {
  const data = filteredData;

  /* Total Expense */
  const total = sumBy(data, x => x.amount);
  setText('valTotalExpense', fmtIDRShort(total));
  setText('subTotalExpense', data.length + ' transactions');

  /* Total Transactions */
  setText('valTotalTx', data.length.toLocaleString('id-ID'));
  const days = uniqueDays(data);
  setText('subTotalTx', days + ' unique day' + (days !== 1 ? 's' : ''));

  /* Average Daily Spend */
  const avgDaily = days > 0 ? total / days : 0;
  setText('valAvgDaily', fmtIDRShort(avgDaily));
  const months = new Set(data.map(x => monthKey(x.date))).size;
  setText('subAvgDaily', months + ' month' + (months !== 1 ? 's' : '') + ' covered');

  /* Top Category */
  if (data.length === 0) {
    setText('valTopCat', '—');
    setText('subTopCat', 'No data');
    return;
  }
  const byCat  = groupBy(data, x => x.category);
  const topCat = Object.entries(byCat)
    .map(([k, v]) => ({ name: k, total: sumBy(v, x => x.amount) }))
    .sort((a, b) => b.total - a.total)[0];
  setText('valTopCat', topCat.name);
  setText('subTopCat', fmtIDRShort(topCat.total));
}

/* ══════════════════════════════════════════════════════════
   SMART FINANCIAL INSIGHT
══════════════════════════════════════════════════════════ */
function renderSmartInsight() {
  const container = document.getElementById('smartInsightBody');
  if (!container) return;

  const data  = filteredData;
  const total = sumBy(data, x => x.amount);

  if (data.length === 0) {
    container.innerHTML = `
      <div class="insight-empty">
        <svg class="w-8 h-8 opacity-30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/>
        </svg>
        <p>No data to analyze. Try adjusting your filters.</p>
      </div>`;
    return;
  }

  /* ── Compute metrics ── */
  const byType   = groupBy(data, x => x.type);
  const needsAmt = sumBy(byType['Needs']   || [], x => x.amount);
  const wantsAmt = sumBy(byType['Wants']   || [], x => x.amount);
  const savingsAmt = sumBy(byType['Savings'] || [], x => x.amount);

  const needsPct   = total > 0 ? (needsAmt   / total * 100) : 0;
  const wantsPct   = total > 0 ? (wantsAmt   / total * 100) : 0;
  const savingsPct = total > 0 ? (savingsAmt / total * 100) : 0;

  const byCat  = groupBy(data, x => x.category);
  const catRanked = Object.entries(byCat)
    .map(([k, v]) => ({ name: k, total: sumBy(v, x => x.amount), count: v.length }))
    .sort((a, b) => b.total - a.total);

  const topCat    = catRanked[0];
  const topCatPct = total > 0 ? (topCat.total / total * 100) : 0;

  const months     = new Set(data.map(x => monthKey(x.date))).size;
  const days       = uniqueDays(data);
  const avgMonthly = months > 0 ? total / months : 0;

  /* ── Budgeting rule check (50/30/20) ── */
  const wantsOver30  = wantsPct  > 30;
  const wantsOver40  = wantsPct  > 40;
  const needsOver70  = needsPct  > 70;
  const savingsUnder10 = savingsPct < 10 && savingsAmt > 0; // only warn if Savings present

  /* ── Build insight items ── */
  const items = [];

  // 1. Spending ratio overview
  items.push({
    icon : '📊',
    type : 'info',
    title: 'Spending Ratio',
    text : `Needs <strong>${needsPct.toFixed(1)}%</strong> · Wants <strong>${wantsPct.toFixed(1)}%</strong> · Savings <strong>${savingsPct.toFixed(1)}%</strong> of total ${fmtIDRShort(total)}.`
  });

  // 2. Top category highlight
  items.push({
    icon : '🏆',
    type : 'info',
    title: 'Top Spending Category',
    text : `<strong>${escHtml(topCat.name)}</strong> is the biggest expense category — ${fmtIDRShort(topCat.total)} (${topCatPct.toFixed(1)}%) across ${topCat.count} transaction${topCat.count !== 1 ? 's' : ''}.`
  });

  // 3. Monthly average
  if (months >= 2) {
    items.push({
      icon : '📅',
      type : 'info',
      title: 'Monthly Average',
      text : `Rata-rata pengeluaran bulanan sebesar <strong>${fmtIDRShort(avgMonthly)}</strong> dari ${months} bulan data (${days} hari aktif).`
    });
  }

  // 4. Wants warning
  if (wantsOver40) {
    items.push({
      icon : '🚨',
      type : 'danger',
      title: 'High Discretionary Spending',
      text : `Porsi <em>Wants</em> mencapai <strong>${wantsPct.toFixed(1)}%</strong> — jauh melampaui batas ideal 30%. Pertimbangkan meninjau kembali pengeluaran hiburan & belanja.`
    });
  } else if (wantsOver30) {
    items.push({
      icon : '⚠️',
      type : 'warning',
      title: 'Wants Melebihi 30%',
      text : `Porsi <em>Wants</em> sebesar <strong>${wantsPct.toFixed(1)}%</strong> telah melewati batas rekomendasi 30% (aturan 50/30/20). Coba kurangi pengeluaran tidak esensial.`
    });
  } else if (wantsPct > 0) {
    items.push({
      icon : '✅',
      type : 'success',
      title: 'Wants Dalam Batas Sehat',
      text : `Porsi <em>Wants</em> ${wantsPct.toFixed(1)}% — masih di bawah ambang 30%. Pertahankan keseimbangan pengeluaran ini!`
    });
  }

  // 5. Needs overload warning
  if (needsOver70 && needsPct < 100) {
    items.push({
      icon : '💡',
      type : 'warning',
      title: 'Needs Mendominasi',
      text : `${needsPct.toFixed(1)}% pengeluaran adalah kebutuhan pokok. Cari peluang efisiensi di utilitas, transportasi, atau grocery untuk meningkatkan alokasi tabungan.`
    });
  }

  // 6. Savings note
  if (savingsAmt === 0) {
    items.push({
      icon : '💰',
      type : 'warning',
      title: 'Tidak Ada Alokasi Savings',
      text : `Data yang difilter tidak mencakup transaksi bertipe <em>Savings</em>. Idealnya alokasikan minimal 20% untuk tabungan/investasi.`
    });
  } else if (savingsPct >= 20) {
    items.push({
      icon : '🌟',
      type : 'success',
      title: 'Savings Sangat Baik',
      text : `Alokasi tabungan/investasi mencapai <strong>${savingsPct.toFixed(1)}%</strong> — melampaui target 20% dari aturan 50/30/20. Luar biasa!`
    });
  }

  /* ── Render HTML ── */
  container.innerHTML = items.map(item => `
    <div class="insight-item insight-${item.type}">
      <span class="insight-icon">${item.icon}</span>
      <div class="insight-content">
        <strong class="insight-title">${item.title}</strong>
        <p class="insight-text">${item.text}</p>
      </div>
    </div>
  `).join('');
}


/* ══════════════════════════════════════════════════════════
   CHART RENDERERS
══════════════════════════════════════════════════════════ */
function renderAllCharts() {
  renderMonthlyTrend();
  renderCategoryPolar();
  renderPaymentDoughnut();
  renderTypePie();
}

/* ── 1. Monthly Spending Trend (Line) ── */
function renderMonthlyTrend() {
  const months    = uniq(allData.map(x => monthKey(x.date)));
  const byMonth   = groupBy(filteredData, x => monthKey(x.date));

  const labels  = months.map(monthLabel);
  const totals  = months.map(m => sumBy(byMonth[m] || [], x => x.amount));
  const counts  = months.map(m => (byMonth[m] || []).length);

  const data = {
    labels,
    datasets: [
      {
        label       : 'Total (IDR)',
        data        : totals,
        borderColor : PALETTE.emerald,
        backgroundColor: PALETTE.emeraldT,
        fill        : true,
        tension     : 0.4,
        pointRadius : 5,
        pointHoverRadius: 7,
        pointBackgroundColor: PALETTE.emerald,
        pointBorderColor    : '#fff',
        pointBorderWidth    : 2,
        yAxisID     : 'y',
      },
      {
        label       : 'Transactions',
        data        : counts,
        borderColor : PALETTE.blue,
        backgroundColor: 'rgba(59,130,246,.0)',
        fill        : false,
        tension     : 0.4,
        pointRadius : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: PALETTE.blue,
        pointBorderColor    : '#fff',
        pointBorderWidth    : 2,
        yAxisID     : 'y2',
        borderDash  : [4, 3],
      }
    ]
  };

  const cfg = {
    type: 'line',
    data,
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) return ' ' + fmtIDR(ctx.parsed.y);
              return ' ' + ctx.parsed.y + ' transactions';
            }
          }
        }
      },
      scales: {
        x:  { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 } } },
        y:  {
          position: 'left',
          grid: { color: '#F1F5F9' },
          ticks: { callback: (v) => fmtIDRShort(v), font: { size: 10 } }
        },
        y2: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { stepSize: 1, font: { size: 10 } }
        }
      }
    }
  };

  recreateChart('chartMonthlyTrend', cfg);
}

/* ── 2. Expense by Category (Bar) ── */
/* ── 2. Expense by Category (Polar Area) ── */
function renderCategoryPolar() {
  const byCat = groupBy(filteredData, x => x.category);
  const entries = Object.entries(byCat)
    .map(([k, v]) => ({ name: k, total: sumBy(v, x => x.amount) }))
    .sort((a, b) => b.total - a.total);

  const labels = entries.map(e => e.name);
  const values = entries.map(e => e.total);
  const colors = labels.map(l => CATEGORY_COLORS[l] || PALETTE.slate);

  const cfg = {
    type: 'polarArea',
    data: {
      labels,
      datasets: [{
        label          : 'Total (IDR)',
        data           : values,
        backgroundColor: colors.map(c => c + 'B3'),   // ~70% opacity
        borderColor    : colors,
        borderWidth    : 1.5,
      }]
    },
    options: {
      responsive  : true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels  : { font: { size: 10 }, padding: 10, usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = values.reduce((a, b) => a + b, 0);
              const pct   = total > 0 ? ((ctx.parsed.r / total) * 100).toFixed(1) : '0.0';
              return ' ' + fmtIDR(ctx.parsed.r) + '  (' + pct + '%)';
            }
          }
        }
      },
      scales: {
        r: {
          ticks: {
            callback    : fmtIDRShort,
            font        : { size: 9 },
            backdropColor: 'transparent',
            color       : '#94A3B8',
          },
          grid : { color: '#F1F5F9' },
          angleLines: { color: '#E2E8F0' },
        }
      }
    }
  };

  recreateChart('chartCategory', cfg);
}

/* ── 3. Payment Method Distribution (Doughnut) ── */
function renderPaymentDoughnut() {
  const byPay = groupBy(filteredData, x => x.payment_method);
  const entries = Object.entries(byPay)
    .map(([k, v]) => ({ name: k, total: sumBy(v, x => x.amount) }))
    .sort((a, b) => b.total - a.total);

  const labels = entries.map(e => e.name);
  const values = entries.map(e => e.total);
  const colors = PAYMENT_COLORS.slice(0, labels.length);

  const cfg = {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 3, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 } } },
        tooltip: { callbacks: {
          label: (ctx) => {
            const pct = ((ctx.parsed / values.reduce((a, b) => a + b, 0)) * 100).toFixed(1);
            return ' ' + fmtIDR(ctx.parsed) + '  (' + pct + '%)';
          }
        }}
      }
    }
  };

  recreateChart('chartPayment', cfg);
}

/* ── 4. Needs vs Wants vs Savings (Pie) ── */
function renderTypePie() {
  const types  = ['Needs', 'Wants', 'Savings'];
  const byType = groupBy(filteredData, x => x.type);
  const values = types.map(t => sumBy(byType[t] || [], x => x.amount));
  const colors = types.map(t => TYPE_COLORS[t]);

  const cfg = {
    type: 'pie',
    data: {
      labels: types,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + 'DD'),
        borderColor    : colors,
        borderWidth    : 2,
        hoverOffset    : 6,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 } } },
        tooltip: { callbacks: {
          label: (ctx) => {
            const total = values.reduce((a, b) => a + b, 0);
            const pct   = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
            return ' ' + fmtIDR(ctx.parsed) + '  (' + pct + '%)';
          }
        }}
      }
    }
  };

  recreateChart('chartType', cfg);
}

/* ── Helper: destroy + recreate a chart ── */
function recreateChart(canvasId, cfg) {
  if (charts[canvasId]) {
    charts[canvasId].destroy();
    delete charts[canvasId];
  }
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  charts[canvasId] = new Chart(canvas, cfg);
}

/* ══════════════════════════════════════════════════════════
   TOP 10 TABLE
══════════════════════════════════════════════════════════ */
function renderTable() {
  const tbody = document.getElementById('tableTop10');
  if (!tbody) return;

  const top10 = [...filteredData]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  if (top10.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-slate-400 text-sm">No transactions match the current filters.</td></tr>`;
    return;
  }

  const maxAmt = top10[0].amount;

  tbody.innerHTML = top10.map((item, i) => {
    const rank   = i + 1;
    const rClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
    const tClass = 'type-' + item.type.toLowerCase();
    const barW   = Math.round((item.amount / maxAmt) * 100);
    const catColor = CATEGORY_COLORS[item.category] || PALETTE.slate;

    return `<tr>
      <td class="td-cell"><span class="rank-badge ${rClass}">${rank}</span></td>
      <td class="td-cell whitespace-nowrap text-slate-500">${fmtDate(item.date)}</td>
      <td class="td-cell max-w-[200px]">
        <div class="font-medium text-slate-700 truncate leading-snug" title="${escHtml(item.description)}">${escHtml(item.description)}</div>
      </td>
      <td class="td-cell">
        <span class="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style="background:${catColor}18; color:${catColor};">${escHtml(item.category)}</span>
      </td>
      <td class="td-cell text-slate-500 whitespace-nowrap">${escHtml(item.payment_method)}</td>
      <td class="td-cell text-center"><span class="type-badge ${tClass}">${item.type}</span></td>
      <td class="td-cell text-right">
        <div class="amount-bar-wrap">
          <span class="font-bold text-slate-800">${fmtIDR(item.amount)}</span>
          <span class="amount-bar" style="width:${barW}%"></span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════
   QUICK ADD EXPENSE (MODAL)
══════════════════════════════════════════════════════════ */
function openModal() {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // set today as default date
  const today = new Date().toISOString().slice(0, 10);
  const inpDate = document.getElementById('inpDate');
  if (inpDate && !inpDate.value) inpDate.value = today;
  document.getElementById('inpDesc')?.focus();
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  clearFormErrors();
}

function clearFormErrors() {
  document.querySelectorAll('.form-input.invalid').forEach(el => el.classList.remove('invalid'));
  const err = document.getElementById('formError');
  if (err) { err.classList.add('hidden'); err.textContent = ''; }
}

function handleFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();

  const date    = document.getElementById('inpDate').value.trim();
  const amount  = parseFloat(document.getElementById('inpAmount').value);
  const desc    = document.getElementById('inpDesc').value.trim();
  const cat     = document.getElementById('inpCategory').value;
  const payment = document.getElementById('inpPayment').value;
  const typeEl  = document.querySelector('input[name="inpType"]:checked');

  const errors = [];
  if (!date)              { markInvalid('inpDate');    errors.push('Date is required.'); }
  if (!amount || amount < 1){ markInvalid('inpAmount'); errors.push('Enter a valid amount > 0.'); }
  if (!desc)              { markInvalid('inpDesc');    errors.push('Description is required.'); }
  if (!cat)               { markInvalid('inpCategory');errors.push('Select a category.'); }
  if (!payment)           { markInvalid('inpPayment'); errors.push('Select a payment method.'); }
  if (!typeEl)            { errors.push('Select a type (Needs / Wants / Savings).'); }

  if (errors.length > 0) {
    const err = document.getElementById('formError');
    if (err) { err.textContent = errors[0]; err.classList.remove('hidden'); }
    return;
  }

  const newEntry = {
    id            : Date.now(),
    date,
    category      : cat,
    description   : desc,
    payment_method: payment,
    type          : typeEl.value,
    amount        : Math.round(amount),
  };

  allData.push(newEntry);

  // refresh filter dropdowns to include any new categories/methods
  populateFilters();
  applyFilters();

  // reset form
  document.getElementById('formAddExpense').reset();
  closeModal();
  showToast('✓ Expense added successfully!', 'success');
}

function markInvalid(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('invalid');
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
let _toastTimer = null;

function showToast(msg, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = 'toast ' + type;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

/* ══════════════════════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════════════════════ */
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = val;
    // re-trigger animation
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════
   EVENT BINDINGS
══════════════════════════════════════════════════════════ */
function bindEvents() {
  /* Filters */
  ['filterMonth', 'filterCategory', 'filterPayment', 'filterType'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilters);
  });

  document.getElementById('btnResetFilter')?.addEventListener('click', () => {
    ['filterMonth', 'filterCategory', 'filterPayment', 'filterType'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    applyFilters();
  });

  /* Modal open / close */
  document.getElementById('btnAddExpense')?.addEventListener('click',  openModal);
  document.getElementById('btnCloseModal')?.addEventListener('click',  closeModal);
  document.getElementById('btnCancelModal')?.addEventListener('click', closeModal);

  document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  /* Form submit */
  document.getElementById('formAddExpense')?.addEventListener('submit', handleFormSubmit);

  /* Keyboard ESC */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

/* ══════════════════════════════════════════════════════════
   KICK OFF
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', init);
