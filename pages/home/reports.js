// Relatórios das contas profissionais: Resumo Mensal e Fechamento por cliente.
// Usam o mesmo mês do seletor da home (do dia 1 até antes do dia 1 do mês seguinte).

let currentReport = 'summary';
let closingGroupId = '';

function renderReportsAccess() {
    const professional = isProfessional();
    reportPage.button().hidden = !professional;
    if (!professional) {
        toggleReports(false);
        return;
    }
    const terms = getTerms(getActiveAccount());
    reportPage.closingTab().textContent = `Fechamento por ${terms.client.toLowerCase()}`;
    if (!reportPage.view().hidden) {
        renderReport();
    }
}

function toggleReports(open) {
    const view = reportPage.view();
    const show = typeof open === 'boolean' ? open : view.hidden;
    view.hidden = !show;
    page.app().classList.toggle('reports-open', show);
    reportPage.button().classList.toggle('active', show);
    if (show) {
        renderReport();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function showReport(report) {
    currentReport = report;
    renderReport();
}

function renderReport() {
    document.querySelectorAll('.report-tab').forEach(tab => {
        const active = tab.dataset.report === currentReport;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', String(active));
    });
    if (currentReport === 'closing') {
        renderClosing();
    } else {
        renderSummaryReport();
    }
}

// Cabeçalho que aparece também no PDF
function reportHeader(title, subtitle) {
    const account = getActiveAccount();
    return `
        <header class="report-header">
            <div>
                <span class="eyebrow-small"></span>
                <h2></h2>
                <p class="muted"></p>
            </div>
            <div class="report-actions no-print">
                <button type="button" class="outline-dark small" onclick="exportReportCsv()">Exportar CSV</button>
                <button type="button" class="primary small" onclick="window.print()">Salvar PDF</button>
            </div>
        </header>
    `.replace('<span class="eyebrow-small"></span>', `<span class="eyebrow-small">${escapeHtml(account.name)}</span>`)
        .replace('<h2></h2>', `<h2>${escapeHtml(title)}</h2>`)
        .replace('<p class="muted"></p>', `<p class="muted">${escapeHtml(subtitle)}</p>`);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sumValues(items) {
    return items.reduce((total, item) => total + item.value, 0);
}

// Resumo mensal ---------------------------------------------------------------

function buildSummary() {
    const transactions = getMonthTransactions();
    const incomes = transactions.filter(transaction => transaction.type === 'income');
    const expenses = transactions.filter(transaction => transaction.type === 'expense');

    const groups = new Map();
    incomes.forEach(transaction => {
        const group = getIncomeGroup(transaction);
        if (!groups.has(group.id)) {
            groups.set(group.id, { ...group, items: [] });
        }
        groups.get(group.id).items.push(transaction);
    });

    const categories = new Map();
    expenses.forEach(transaction => {
        if (!categories.has(transaction.categoryId)) {
            categories.set(transaction.categoryId, { category: findCategory(transaction.categoryId), items: [] });
        }
        categories.get(transaction.categoryId).items.push(transaction);
    });

    const income = sumValues(incomes);
    const expense = sumValues(expenses);
    return {
        income,
        expense,
        net: income - expense,
        pending: sumValues(incomes.filter(transaction => transaction.status === 'pending')),
        incomeCount: incomes.length,
        groups: [...groups.values()].sort((a, b) => sumValues(b.items) - sumValues(a.items)),
        categories: [...categories.values()].sort((a, b) => sumValues(b.items) - sumValues(a.items))
    };
}

function renderSummaryReport() {
    const terms = getTerms(getActiveAccount());
    const summary = buildSummary();
    const month = formatMonth(currentMonth);

    const groupRows = summary.groups.map(group => {
        const pending = sumValues(group.items.filter(item => item.status === 'pending'));
        return `<tr>
            <td>${escapeHtml(group.name)}</td>
            <td class="num">${group.items.length}</td>
            <td class="num">${formatCurrency(sumValues(group.items))}</td>
            <td class="num ${pending ? 'pending-text' : 'muted'}">${pending ? formatCurrency(pending) : '—'}</td>
        </tr>`;
    }).join('');

    const categoryRows = summary.categories.map(entry => `<tr>
            <td>${escapeHtml(entry.category.name)}</td>
            <td class="num">${entry.items.length}</td>
            <td class="num">${formatCurrency(sumValues(entry.items))}</td>
        </tr>`).join('');

    reportPage.content().innerHTML = `
        ${reportHeader(`Resumo de ${month}`, `${terms.incomePlural}, ${terms.expensePlural.toLowerCase()} e resultado líquido do mês`)}

        <div class="report-kpis">
            <div><span>Faturamento</span><strong class="income">${formatCurrency(summary.income)}</strong><small>${summary.incomeCount} ${summary.incomeCount === 1 ? terms.income.toLowerCase() : terms.incomePlural.toLowerCase()}</small></div>
            <div><span>${terms.expensePlural}</span><strong class="expense">${formatCurrency(summary.expense)}</strong></div>
            <div class="net"><span>Resultado líquido</span><strong class="${summary.net < 0 ? 'expense' : 'income'}">${formatCurrency(summary.net)}</strong></div>
            <div><span>A receber</span><strong class="${summary.pending ? 'pending-text' : ''}">${formatCurrency(summary.pending)}</strong><small>já incluído no faturamento</small></div>
        </div>

        <h3>Faturamento por ${terms.client.toLowerCase()} e local</h3>
        ${summary.groups.length ? `<div class="table-wrap"><table class="report-table">
            <thead><tr><th>Origem</th><th class="num">${terms.incomePlural}</th><th class="num">Total cobrado</th><th class="num">Pendente</th></tr></thead>
            <tbody>${groupRows}</tbody>
            <tfoot><tr><td>Faturamento total</td><td class="num">${summary.incomeCount}</td><td class="num">${formatCurrency(summary.income)}</td><td class="num">${summary.pending ? formatCurrency(summary.pending) : '—'}</td></tr></tfoot>
        </table></div>` : `<p class="muted">Nenhum ${terms.income.toLowerCase()} em ${month.toLowerCase()}.</p>`}

        <h3>${terms.expensePlural} por categoria</h3>
        ${summary.categories.length ? `<div class="table-wrap"><table class="report-table">
            <thead><tr><th>Categoria</th><th class="num">Lançamentos</th><th class="num">Total</th></tr></thead>
            <tbody>${categoryRows}</tbody>
            <tfoot><tr><td>Total de ${terms.expensePlural.toLowerCase()}</td><td class="num">${summary.categories.reduce((n, entry) => n + entry.items.length, 0)}</td><td class="num">${formatCurrency(summary.expense)}</td></tr></tfoot>
        </table></div>` : `<p class="muted">Nenhum ${terms.expense.toLowerCase()} em ${month.toLowerCase()}.</p>`}

        <div class="report-result">
            <span>${formatCurrency(summary.income)} − ${formatCurrency(summary.expense)} =</span>
            <strong class="${summary.net < 0 ? 'expense' : 'income'}">Resultado líquido ${formatCurrency(summary.net)}</strong>
        </div>
        <p class="report-footnote muted">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
    `;
}

// Fechamento por cliente --------------------------------------------------------

// Colunas da tabela: os campos de atendimento que fazem sentido para esse grupo
// (ex.: no Domicílio entra o endereço; na clínica, não). Cliente e local já estão no título.
function getClosingColumns(group) {
    const fields = getFieldsFor('income');
    const { clientField, locationField, clientLocation } = getLocationSetup();
    const values = {};
    if (locationField) {
        values[locationField.key] = group.kind === 'location' ? group.name : clientLocation;
    }
    return fields.filter(field =>
        field !== clientField && field !== locationField && field.type !== 'receipt' &&
        isFieldVisible(field, values, fields));
}

function getClosingItems(groupId) {
    return getMonthTransactions()
        .filter(transaction => transaction.type === 'income' && getIncomeGroup(transaction).id === groupId)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function renderClosing() {
    const terms = getTerms(getActiveAccount());
    const groups = getGroupOptions();
    if (!groups.some(group => group.id === closingGroupId)) {
        closingGroupId = groups.length ? groups[0].id : '';
    }

    const month = formatMonth(currentMonth);
    const options = groups.map(group =>
        `<option value="${escapeHtml(group.id)}" ${group.id === closingGroupId ? 'selected' : ''}>${escapeHtml(group.name)}</option>`).join('');

    if (!groups.length) {
        reportPage.content().innerHTML = `
            ${reportHeader(`Fechamento por ${terms.client.toLowerCase()}`, month)}
            <p class="muted">Cadastre ${clientWord('uma', 'um')} ${terms.client.toLowerCase()} no painel para gerar o fechamento.</p>`;
        return;
    }

    const group = groups.find(item => item.id === closingGroupId);
    const items = getClosingItems(closingGroupId);
    const columns = getClosingColumns(group);
    const total = sumValues(items);
    const pending = sumValues(items.filter(item => item.status === 'pending'));

    const rows = items.map(item => `<tr>
        <td>${formatDate(item.date)}</td>
        ${columns.map(field => `<td>${escapeHtml((item.details || {})[field.key] || '')}</td>`).join('')}
        <td class="num">${formatCurrency(item.value)}</td>
        <td>${escapeHtml(item.paymentMethod || '')}</td>
        <td><span class="status-badge ${item.status === 'pending' ? 'pending' : 'received'}">${STATUS_LABELS[item.status || 'received']}</span></td>
    </tr>`).join('');

    const clientNotes = group.kind === 'client' ? (findClient(group.id) || {}).notes : '';

    reportPage.content().innerHTML = `
        ${reportHeader(`Fechamento · ${group.name.replace(/ \(arquivad[ao]\)$/, '')}`, month + (clientNotes ? ` · ${clientNotes}` : ''))}

        <div class="closing-controls no-print">
            <label for="closing-group"><b>${terms.client} ou local</b></label>
            <select id="closing-group" onchange="closingGroupId = this.value; renderClosing()">${options}</select>
        </div>

        <div class="report-kpis compact">
            <div><span>${terms.incomePlural}</span><strong>${items.length}</strong></div>
            <div><span>Total cobrado</span><strong class="income">${formatCurrency(total)}</strong></div>
            <div><span>Recebido</span><strong>${formatCurrency(total - pending)}</strong></div>
            <div><span>Pendente</span><strong class="${pending ? 'pending-text' : ''}">${formatCurrency(pending)}</strong></div>
        </div>

        ${items.length ? `<div class="table-wrap"><table class="report-table closing-table">
            <thead><tr><th>Data</th>${columns.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}<th class="num">Valor</th><th>Pagamento</th><th>Situação</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><td colspan="${columns.length + 1}">Total (${items.length} ${items.length === 1 ? terms.income.toLowerCase() : terms.incomePlural.toLowerCase()})</td><td class="num">${formatCurrency(total)}</td><td colspan="2"></td></tr></tfoot>
        </table></div>` : `<p class="muted">Nenhum ${terms.income.toLowerCase()} para ${escapeHtml(group.name)} em ${month.toLowerCase()}.</p>`}

        ${pending ? `<div class="closing-pending no-print">
            <span>${items.filter(item => item.status === 'pending').length} pendente(s) somando ${formatCurrency(pending)}.</span>
            <button type="button" class="outline-dark small" onclick="markClosingAsReceived()">Marcar todos como recebidos</button>
        </div>` : ''}
        <p class="report-footnote muted">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
    `;
}

async function markClosingAsReceived() {
    const pending = getClosingItems(closingGroupId).filter(item => item.status === 'pending');
    if (!pending.length || !confirm(`Marcar ${pending.length} lançamento(s) como recebido(s)?`)) {
        return;
    }
    const updated = pending.map(item => ({ ...item, status: 'received' }));
    try {
        await saveItems('transactions', updated);
    } catch (error) {
        alert('Não foi possível atualizar. Tente novamente.');
        return;
    }
    const ids = updated.map(item => item.id);
    state.transactions = state.transactions.filter(item => !ids.includes(item.id)).concat(updated);
    render();
}

// CSV --------------------------------------------------------------------------

function exportReportCsv() {
    const terms = getTerms(getActiveAccount());
    const money = value => value.toFixed(2).replace('.', ',');
    let rows;
    let name;

    if (currentReport === 'closing') {
        const group = getGroupOptions().find(item => item.id === closingGroupId);
        if (!group) {
            return;
        }
        const columns = getClosingColumns(group);
        const items = getClosingItems(closingGroupId);
        rows = [['Data', ...columns.map(field => field.label), 'Valor', 'Forma de pagamento', 'Situação'],
            ...items.map(item => [formatDate(item.date), ...columns.map(field => (item.details || {})[field.key] || ''),
                money(item.value), item.paymentMethod || '', STATUS_LABELS[item.status || 'received']]),
            ['Total', ...columns.map(() => ''), money(sumValues(items)), '', '']];
        name = `fechamento-${group.name}`;
    } else {
        const summary = buildSummary();
        rows = [['Seção', 'Item', 'Quantidade', 'Total', 'Pendente'],
            ...summary.groups.map(group => [terms.incomePlural, group.name, group.items.length, money(sumValues(group.items)),
                money(sumValues(group.items.filter(item => item.status === 'pending')))]),
            [terms.incomePlural, 'Faturamento total', summary.incomeCount, money(summary.income), money(summary.pending)],
            ...summary.categories.map(entry => [terms.expensePlural, entry.category.name, entry.items.length, money(sumValues(entry.items)), '']),
            [terms.expensePlural, `Total de ${terms.expensePlural.toLowerCase()}`, '', money(summary.expense), ''],
            ['Resultado', 'Resultado líquido', '', money(summary.net), '']];
        name = 'resumo';
    }

    const csv = rows.map(row => row.map(toCsvField).join(';')).join('\r\n');
    const slug = `${name}-${currentMonth}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
    downloadFile('﻿' + csv, `${slug}.csv`, 'text/csv;charset=utf-8');
}

const reportPage = {
    button: () => document.getElementById('reports-button'),
    view: () => document.getElementById('reports-view'),
    content: () => document.getElementById('report-content'),
    closingTab: () => document.getElementById('closing-tab')
}
