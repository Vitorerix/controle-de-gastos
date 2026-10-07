// Gráficos com Chart.js (https://www.chartjs.org)

const MAX_CHART_CATEGORIES = 7;
const HISTORY_MONTHS = 6;
const charts = {};

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderCharts() {
    if (typeof Chart === 'undefined') {
        return;
    }
    Chart.defaults.color = cssVar('--muted');
    Chart.defaults.font.family = cssVar('--font');
    renderCategoryChart();
    renderHistoryChart();
}

function replaceChart(key, canvas, config) {
    if (charts[key]) {
        charts[key].destroy();
    }
    charts[key] = new Chart(canvas, config);
}

const currencyTooltip = {
    callbacks: {
        label: context => ` ${context.dataset.label || context.label}: ${formatCurrency(context.parsed.y ?? context.parsed)}`
    }
};

function renderCategoryChart() {
    const totals = {};
    getMonthTransactions()
        .filter(transaction => transaction.type === 'expense')
        .forEach(transaction => {
            totals[transaction.categoryId] = (totals[transaction.categoryId] || 0) + transaction.value;
        });

    let slices = Object.entries(totals)
        .map(([categoryId, value]) => ({ category: findCategory(categoryId), value }))
        .sort((a, b) => b.value - a.value);

    // Muitas fatias ficam ilegíveis: as menores viram "Outras"
    if (slices.length > MAX_CHART_CATEGORIES) {
        const rest = slices.slice(MAX_CHART_CATEGORIES - 1);
        slices = slices.slice(0, MAX_CHART_CATEGORIES - 1);
        slices.push({
            category: { name: 'Outras', color: '#9e9e9e' },
            value: rest.reduce((total, slice) => total + slice.value, 0)
        });
    }

    const isEmpty = !slices.length;
    document.getElementById('category-chart-empty').style.display = isEmpty ? 'block' : 'none';
    document.getElementById('category-chart-box').style.display = isEmpty ? 'none' : 'block';
    if (isEmpty) {
        return;
    }

    replaceChart('category', document.getElementById('category-chart'), {
        type: 'doughnut',
        data: {
            labels: slices.map(slice => slice.category.name),
            datasets: [{
                data: slices.map(slice => slice.value),
                backgroundColor: slices.map(slice => slice.category.color),
                borderColor: cssVar('--surface'),
                borderWidth: 2,
                hoverOffset: 6
            }]
        },
        options: {
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                // No celular a legenda vai para baixo, para não espremer o gráfico
                legend: { position: window.innerWidth < 500 ? 'bottom' : 'right', labels: { boxWidth: 12, boxHeight: 12 } },
                tooltip: {
                    callbacks: {
                        label: context => {
                            const total = context.dataset.data.reduce((sum, value) => sum + value, 0);
                            const percent = Math.round(context.parsed / total * 100);
                            return ` ${context.label}: ${formatCurrency(context.parsed)} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderHistoryChart() {
    const months = [];
    for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
        months.push(addMonths(currentMonth, -i));
    }

    const income = months.map(month => sumByType(getMonthTransactions(month), 'income'));
    const expense = months.map(month => sumByType(getMonthTransactions(month), 'expense'));

    const barStyle = { borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 28 };

    replaceChart('history', document.getElementById('history-chart'), {
        type: 'bar',
        data: {
            labels: months.map(formatShortMonth),
            datasets: [
                { label: 'Receitas', data: income, backgroundColor: cssVar('--chart-income'), ...barStyle },
                { label: 'Despesas', data: expense, backgroundColor: cssVar('--chart-expense'), ...barStyle }
            ]
        },
        options: {
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12 } },
                tooltip: currencyTooltip
            },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: cssVar('--border') },
                    ticks: {
                        maxTicksLimit: 5,
                        callback: value => new Intl.NumberFormat('pt-BR', {
                            style: 'currency', currency: 'BRL', notation: 'compact'
                        }).format(value)
                    }
                }
            }
        }
    });
}

// "2026-10" -> "out/26"
function formatShortMonth(month) {
    const [year, monthNumber] = month.split('-');
    const name = new Date(year, monthNumber - 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `${name}/${year.slice(2)}`;
}
