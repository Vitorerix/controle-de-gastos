// Dados do usuário carregados do Firestore; as telas leem daqui
const state = { transactions: [], categories: [], goals: [], clients: [] };

let editingId = null;
let currentMonth = today().slice(0, 7);

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '../../index.html';
        return;
    }
    page.greeting().textContent = `Olá, ${user.displayName || user.email}`;
    loadProfilePhoto();
    start();
});

const LOAD_TIMEOUT = 15000;

async function start() {
    try {
        // Sem conexão (ou com o Firestore desativado) o Firebase fica tentando para sempre,
        // então desistimos depois de um tempo para avisar o usuário
        await withTimeout(initAccounts(), LOAD_TIMEOUT);
        Object.assign(state, await withTimeout(loadUserData(), LOAD_TIMEOUT));
    } catch (error) {
        page.loadingMessage().textContent =
            'Não foi possível carregar seus dados. Verifique sua conexão e se o Firestore está ativado no Firebase.';
        page.loadingActions().hidden = false;
        console.error(error);
        return;
    }
    page.loading().hidden = true;
    page.app().hidden = false;
    render();
    resetForm();
}

// A foto não bloqueia a tela: se falhar, o cabeçalho continua com a folha
async function loadProfilePhoto() {
    try {
        const { photo } = await getProfile();
        if (photo) {
            const mark = page.profileMark();
            mark.style.backgroundImage = `url("${photo}")`;
            mark.classList.add('has-photo');
        }
    } catch (error) {
        console.error(error);
    }
}

function withTimeout(promise, ms) {
    const timeout = new Promise((resolve, reject) =>
        setTimeout(() => reject(new Error(`Tempo esgotado após ${ms / 1000}s`)), ms));
    return Promise.race([promise, timeout]);
}

// Troca de conta: recarrega os dados e limpa filtros e edição da conta anterior
async function reloadAccountData() {
    const data = await withTimeout(loadUserData(), LOAD_TIMEOUT);
    Object.assign(state, data);
    page.search().value = '';
    page.filterType().value = '';
    page.filterCategory().value = '';
    page.filterGroup().value = '';
    page.filterStatus().value = '';
    toggleReports(false);
    resetForm();
    render();
}

function render() {
    page.monthLabel().textContent = formatMonth(currentMonth);
    renderAccountSwitcher();
    applyAccountTerms();
    renderPaymentOptions();
    renderCategoryOptions();
    renderFilterOptions();
    renderExtraFields();
    renderClientsPanel();
    renderReportsAccess();
    renderSummary(getMonthTransactions());
    renderList();
    renderCategoriesPanel();
    renderGoals();
    renderAlerts();
    renderCharts();
}

document.addEventListener('themechange', render);

// Textos que mudam conforme a conta: "Receitas" na Pessoal, "Faturamento" na profissional
function applyAccountTerms() {
    const terms = getTerms(getActiveAccount());
    const professional = isProfessional();

    page.balanceLabel().textContent = professional ? 'Resultado líquido' : 'Saldo do mês';
    page.incomeLabel().textContent = professional ? 'Faturamento' : 'Receitas';
    page.expenseLabel().textContent = professional ? terms.expensePlural : 'Despesas';
    page.typeIncomeLabel().textContent = terms.income;
    page.typeExpenseLabel().textContent = terms.expense;
    page.transactionsTitle().textContent = professional ? 'Lançamentos' : 'Transações';
    page.filterType().options[1].textContent = terms.incomePlural;
    page.filterType().options[2].textContent = terms.expensePlural;
    if (!editingId) {
        page.formTitle().textContent = newEntryTitle();
    }
}

function newEntryTitle() {
    return isProfessional() ? 'Novo lançamento' : 'Nova transação';
}

function currentType() {
    return document.querySelector('input[name="type"]:checked').value;
}

function onChangeType() {
    renderCategoryOptions();
    renderExtraFields();
    toggleSaveButtonDisable();
}

// Filtros de clínica/local e de situação só existem nas contas profissionais
function renderFilterOptions() {
    const professional = isProfessional();
    const groupSelect = page.filterGroup();
    groupSelect.hidden = !professional;
    page.filterStatus().hidden = !professional;
    page.filters().classList.toggle('professional', professional);
    if (!professional) {
        groupSelect.value = '';
        page.filterStatus().value = '';
        return;
    }

    const terms = getTerms(getActiveAccount());
    const selected = groupSelect.value;
    groupSelect.innerHTML = '';
    groupSelect.appendChild(new Option(`${clientWord('Todas as', 'Todos os')} ${terms.clientPlural.toLowerCase()}`, ''));
    getGroupOptions().forEach(group => groupSelect.appendChild(new Option(group.name, group.id)));
    groupSelect.value = [...groupSelect.options].some(option => option.value === selected) ? selected : '';
}

// Forma de pagamento: opcional na conta Pessoal, sempre preenchida na profissional
function renderPaymentOptions() {
    const select = page.paymentMethod();
    const selected = select.value;
    const methods = getActiveAccount().paymentMethods || PAYMENT_METHODS;
    const options = isProfessional() ? methods : ['', ...methods];

    select.innerHTML = '';
    options.forEach(method => {
        const option = document.createElement('option');
        option.value = method;
        option.textContent = method || 'Não informar';
        select.appendChild(option);
    });
    if (options.includes(selected)) {
        select.value = selected;
    }
}

function getMonthTransactions(month = currentMonth) {
    return state.transactions.filter(transaction => transaction.date.startsWith(month));
}

function changeMonth(delta) {
    currentMonth = addMonths(currentMonth, delta);
    render();
}

function addMonths(month, delta) {
    const [year, monthNumber] = month.split('-').map(Number);
    const date = new Date(year, monthNumber - 1 + delta);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function renderSummary(transactions) {
    const income = sumByType(transactions, 'income');
    const expense = sumByType(transactions, 'expense');
    const balance = income - expense;

    page.totalIncome().textContent = formatCurrency(income);
    page.totalExpense().textContent = formatCurrency(expense);
    page.balance().textContent = formatCurrency(balance);
    page.balance().className = balance < 0 ? 'expense' : 'income';

    const pending = transactions.filter(transaction => transaction.type === 'income' && transaction.status === 'pending');
    const pendingTotal = pending.reduce((total, transaction) => total + transaction.value, 0);
    page.incomeNote().hidden = !isProfessional() || !pending.length;
    page.incomeNote().textContent = `${formatCurrency(pendingTotal)} a receber`;
}

function sumByType(transactions, type) {
    return transactions
        .filter(transaction => transaction.type === type)
        .reduce((total, transaction) => total + transaction.value, 0);
}

function renderList() {
    const monthTransactions = getMonthTransactions();
    const filtered = filterTransactions(monthTransactions);

    const list = page.transactionsList();
    list.innerHTML = '';

    if (!monthTransactions.length) {
        page.emptyMessage().textContent = 'Nenhuma transação neste mês.';
    } else if (!filtered.length) {
        page.emptyMessage().textContent = 'Nenhuma transação encontrada com esses filtros.';
    }
    page.emptyMessage().style.display = filtered.length ? 'none' : 'block';

    filtered
        .sort((a, b) => b.date.localeCompare(a.date))
        .forEach(transaction => list.appendChild(createTransactionItem(transaction)));
}

function filterTransactions(transactions) {
    const search = page.search().value.trim().toLowerCase();
    const type = page.filterType().value;
    const categoryId = page.filterCategory().value;
    const group = page.filterGroup().value;
    const status = page.filterStatus().value;

    return transactions.filter(transaction =>
        (!type || transaction.type === type) &&
        (!categoryId || transaction.categoryId === categoryId) &&
        (!group || (transaction.type === 'income' && getIncomeGroup(transaction).id === group)) &&
        (!status || (transaction.type === 'income' && (transaction.status || 'received') === status)) &&
        (!search || searchableText(transaction).includes(search))
    );
}

function createTransactionItem(transaction) {
    const category = findCategory(transaction.categoryId);
    const item = document.createElement('li');
    item.className = `transaction ${transaction.type}`;

    const sign = transaction.type === 'expense' ? '- ' : '+ ';
    item.innerHTML = `
        <div class="transaction-info">
            <strong></strong>
            <small>${formatDate(transaction.date)} · <span class="category"></span><span class="details"></span><span class="payment"></span>${formatRepeat(transaction)}${formatStatus(transaction)}</small>
        </div>
        <span class="transaction-value">${sign}${formatCurrency(transaction.value)}</span>
        <div class="transaction-actions">
            <button type="button" class="clear row-action" title="Editar" aria-label="Editar"><svg class="icon"><use href="#i-pencil"/></svg></button>
            <button type="button" class="clear row-action danger-action" title="Excluir" aria-label="Excluir"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>
    `;
    item.prepend(createCategoryIcon(category));
    // textContent evita que o texto digitado pelo usuário seja interpretado como HTML
    item.querySelector('strong').textContent = describeTitle(transaction, category);
    item.querySelector('.category').textContent = category.name;
    const details = describeDetails(transaction);
    item.querySelector('.details').textContent = details.length ? ` · ${details.join(' · ')}` : '';
    item.querySelector('.payment').textContent = transaction.paymentMethod ? ` · ${transaction.paymentMethod}` : '';

    const [editButton, deleteButton] = item.querySelectorAll('.transaction-actions button');
    editButton.onclick = () => startEdit(transaction.id);
    deleteButton.onclick = () => removeTransaction(transaction.id);

    // Comprovante com foto: botão de câmera para ver a imagem
    const receipt = transaction.details && transaction.details.receipt;
    if (receipt && receipt.photo) {
        const photoButton = document.createElement('button');
        photoButton.type = 'button';
        photoButton.className = 'clear row-action';
        photoButton.title = 'Ver foto do comprovante';
        photoButton.setAttribute('aria-label', photoButton.title);
        photoButton.innerHTML = '<svg class="icon"><use href="#i-camera"/></svg>';
        photoButton.onclick = () => openPhoto(receipt.photo);
        item.querySelector('.transaction-actions').prepend(photoButton);
    }

    return item;
}

function formatStatus(transaction) {
    if (!isProfessional() || transaction.type !== 'income' || transaction.status !== 'pending') {
        return '';
    }
    return ' · <span class="status-badge pending">Pendente</span>';
}

function formatRepeat(transaction) {
    if (!transaction.repeat) {
        return '';
    }
    const { kind, number, total } = transaction.repeat;
    const label = kind === 'installments' ? 'Parcela' : '🔁 Mensal';
    return ` · <span class="repeat-badge">${label} ${number}/${total}</span>`;
}

function onChangeValue() {
    toggleValueErrors();
    renderRepeatHint();
    toggleSaveButtonDisable();
}

function onChangeDate() {
    toggleDateErrors();
    renderRepeatHint();
    toggleSaveButtonDisable();
}

function isValueValid() {
    return parseAmount(page.value().value) > 0;
}

function isDateValid() {
    return !!page.date().value;
}

function toggleValueErrors() {
    const value = page.value().value;
    page.valueRequiredError().style.display = value ? 'none' : 'block';
    page.valueInvalidError().style.display = !value || isValueValid() ? 'none' : 'block';
}

function toggleDateErrors() {
    page.dateRequiredError().style.display = isDateValid() ? 'none' : 'block';
}

function toggleSaveButtonDisable() {
    page.saveButton().disabled = !isValueValid() || !isDateValid() || !isRepeatValid() || !isExtraFieldsValid();
}

function hideFormErrors() {
    page.valueRequiredError().style.display = 'none';
    page.valueInvalidError().style.display = 'none';
    page.dateRequiredError().style.display = 'none';
    page.repeatCountError().style.display = 'none';
}

async function saveTransaction(event) {
    event.preventDefault();
    if (!isValueValid() || !isDateValid()) {
        return;
    }
    if (!isExtraFieldsValid()) {
        showExtraFieldErrors();
        return;
    }

    const transaction = {
        id: editingId || createId(),
        type: document.querySelector('input[name="type"]:checked').value,
        value: parseAmount(page.value().value),
        date: page.date().value,
        categoryId: page.category().value,
        paymentMethod: page.paymentMethod().value || null,
        description: page.description().value.trim()
    };
    if (isProfessional()) {
        transaction.details = readExtraFieldValues();
        transaction.status = readEntryStatus();
    }

    // Ao editar, mantém a informação de parcela/repetição que a transação já tinha
    const original = state.transactions.find(item => item.id === editingId);
    const toSave = editingId
        ? [{ ...original, ...transaction }]
        : buildRepeatedTransactions(transaction, page.repeat().value, Number(page.repeatCount().value));

    page.saveButton().disabled = true;
    try {
        await saveItems('transactions', toSave);
    } catch (error) {
        toggleSaveButtonDisable();
        alert('Não foi possível salvar a transação. Tente novamente.');
        return;
    }

    const savedIds = toSave.map(item => item.id);
    state.transactions = state.transactions.filter(item => !savedIds.includes(item.id));
    state.transactions.push(...toSave);

    // Mostra o mês da transação salva, para o usuário ver o resultado
    currentMonth = transaction.date.slice(0, 7);
    resetForm({ keepType: true });
    render();
}

function startEdit(id) {
    const transaction = state.transactions.find(item => item.id === id);
    if (!transaction) {
        return;
    }

    editingId = id;
    document.querySelector(`input[name="type"][value="${transaction.type}"]`).checked = true;
    page.value().value = formatAmount(transaction.value);
    page.date().value = transaction.date;
    renderCategoryOptions();
    page.category().value = transaction.categoryId;
    page.paymentMethod().value = transaction.paymentMethod || (isProfessional() ? page.paymentMethod().options[0].value : '');
    page.description().value = transaction.description;
    renderSelectedCategoryIcon();
    renderExtraFields(transaction);

    // A repetição só existe na criação; ao editar, muda apenas esta transação
    page.repeat().value = 'none';
    page.repeatField().style.display = 'none';

    hideFormErrors();
    toggleSaveButtonDisable();
    page.formTitle().textContent = isProfessional() ? 'Editar lançamento' : 'Editar transação';
    page.saveButton().textContent = 'Salvar alterações';
    page.cancelEditButton().style.display = 'block';
    page.form().scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    resetForm();
}

async function removeTransaction(id) {
    const transaction = state.transactions.find(item => item.id === id);
    if (!confirm('Deseja excluir esta transação?')) {
        return;
    }

    let ids = [id];
    const nextInGroup = transaction.groupId
        ? state.transactions.filter(item => item.groupId === transaction.groupId && item.date > transaction.date)
        : [];
    if (nextInGroup.length &&
        confirm(`Excluir também as ${nextInGroup.length} repetições seguintes?\n\nOK = excluir todas · Cancelar = só esta`)) {
        ids = ids.concat(nextInGroup.map(item => item.id));
    }

    try {
        await removeItems('transactions', ids);
    } catch (error) {
        alert('Não foi possível excluir a transação. Tente novamente.');
        return;
    }
    state.transactions = state.transactions.filter(item => !ids.includes(item.id));
    if (ids.includes(editingId)) {
        resetForm();
    }
    render();
}

// Parcelas e repetições ------------------------------------------------------

function onChangeRepeat() {
    const repeat = page.repeat().value;
    page.repeatCount().style.display = repeat === 'none' ? 'none' : 'block';
    page.repeatCount().parentElement.classList.toggle('single', repeat === 'none');
    page.repeatCountError().style.display = isRepeatValid() ? 'none' : 'block';
    renderRepeatHint();
    toggleSaveButtonDisable();
}

function isRepeatValid() {
    if (page.repeat().value === 'none') {
        return true;
    }
    const count = Number(page.repeatCount().value);
    return Number.isInteger(count) && count >= 2 && count <= 60;
}

function renderRepeatHint() {
    const repeat = page.repeat().value;
    const count = Number(page.repeatCount().value);
    const value = parseAmount(page.value().value);
    const hint = page.repeatHint();

    if (repeat === 'none' || !isRepeatValid() || !value || !isDateValid()) {
        hint.textContent = '';
        return;
    }
    const first = page.date().value.slice(0, 7);
    const last = addMonths(first, count - 1);
    const period = `de ${formatShortMonth(first)} a ${formatShortMonth(last)}`;
    hint.textContent = repeat === 'installments'
        ? `${describeInstallments(splitInstallments(value, count))} ${period}`
        : `${count} meses de ${formatCurrency(value)} ${period} (total ${formatCurrency(value * count)})`;
}

// [333.34, 333.33, 333.33] -> "1x de R$ 333,34 + 2x de R$ 333,33"
function describeInstallments(values) {
    const [first, ...rest] = values;
    if (rest.every(value => value === first)) {
        return `${values.length}x de ${formatCurrency(first)}`;
    }
    return `1x de ${formatCurrency(first)} + ${rest.length}x de ${formatCurrency(rest[0])}`;
}

// Divide em centavos para a soma das parcelas bater com o total; a diferença vai na 1ª
function splitInstallments(total, count) {
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / count);
    const values = Array(count).fill(base / 100);
    values[0] = (base + cents - base * count) / 100;
    return values;
}

function buildRepeatedTransactions(transaction, repeat, count) {
    if (repeat === 'none') {
        return [transaction];
    }
    const groupId = createId();
    const values = repeat === 'installments'
        ? splitInstallments(transaction.value, count)
        : Array(count).fill(transaction.value);

    return values.map((value, index) => ({
        ...transaction,
        id: index === 0 ? transaction.id : createId(),
        value,
        date: addMonthsToDate(transaction.date, index),
        groupId,
        repeat: { kind: repeat, number: index + 1, total: count }
    }));
}

// "2026-01-31" + 1 mês -> "2026-02-28" (ajusta para o último dia quando o mês é menor)
function addMonthsToDate(date, delta) {
    const [year, month, day] = date.split('-').map(Number);
    const target = new Date(year, month - 1 + delta, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(day, lastDay));
    return [
        target.getFullYear(),
        String(target.getMonth() + 1).padStart(2, '0'),
        String(target.getDate()).padStart(2, '0')
    ].join('-');
}

// keepType: depois de salvar, continua no mesmo tipo (gasto seguido de gasto).
// Sem ele (troca de conta, abrir a tela), a conta profissional começa em atendimento.
function resetForm({ keepType = false } = {}) {
    const previousType = currentType();
    editingId = null;
    page.form().reset();
    if (keepType) {
        document.querySelector(`input[name="type"][value="${previousType}"]`).checked = true;
    } else if (isProfessional()) {
        document.querySelector('input[name="type"][value="income"]').checked = true;
    }
    renderCategoryOptions();
    receiptPhotoDraft = null;
    renderExtraFields({});
    page.date().value = today();
    page.repeatField().style.display = 'block';
    onChangeRepeat();
    renderSelectedCategoryIcon();
    hideFormErrors();
    toggleSaveButtonDisable();
    page.formTitle().textContent = newEntryTitle();
    page.saveButton().textContent = 'Adicionar';
    page.cancelEditButton().style.display = 'none';
}

function today() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
}

function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = '../../index.html';
    });
}

const page = {
    loading: () => document.getElementById('loading'),
    loadingMessage: () => document.getElementById('loading-message'),
    loadingActions: () => document.getElementById('loading-actions'),
    app: () => document.getElementById('app'),
    greeting: () => document.getElementById('greeting'),
    balanceLabel: () => document.getElementById('balance-label'),
    incomeLabel: () => document.getElementById('income-label'),
    expenseLabel: () => document.getElementById('expense-label'),
    typeIncomeLabel: () => document.getElementById('type-income-label'),
    typeExpenseLabel: () => document.getElementById('type-expense-label'),
    transactionsTitle: () => document.getElementById('transactions-title'),
    paymentMethod: () => document.getElementById('payment-method'),
    incomeNote: () => document.getElementById('income-note'),
    filters: () => document.querySelector('.filters'),
    filterGroup: () => document.getElementById('filter-group'),
    filterStatus: () => document.getElementById('filter-status'),
    profileMark: () => document.getElementById('profile-mark'),
    monthLabel: () => document.getElementById('month-label'),
    form: () => document.getElementById('transaction-form'),
    formTitle: () => document.getElementById('form-title'),
    value: () => document.getElementById('value'),
    valueRequiredError: () => document.getElementById('value-required-error'),
    valueInvalidError: () => document.getElementById('value-invalid-error'),
    date: () => document.getElementById('date'),
    dateRequiredError: () => document.getElementById('date-required-error'),
    category: () => document.getElementById('category'),
    selectedCategoryIcon: () => document.getElementById('selected-category-icon'),
    description: () => document.getElementById('description'),
    repeatField: () => document.getElementById('repeat-field'),
    repeat: () => document.getElementById('repeat'),
    repeatCount: () => document.getElementById('repeat-count'),
    repeatHint: () => document.getElementById('repeat-hint'),
    repeatCountError: () => document.getElementById('repeat-count-error'),
    saveButton: () => document.getElementById('save-button'),
    cancelEditButton: () => document.getElementById('cancel-edit-button'),
    balance: () => document.getElementById('balance'),
    totalIncome: () => document.getElementById('total-income'),
    totalExpense: () => document.getElementById('total-expense'),
    search: () => document.getElementById('search'),
    filterType: () => document.getElementById('filter-type'),
    filterCategory: () => document.getElementById('filter-category'),
    transactionsList: () => document.getElementById('transactions-list'),
    emptyMessage: () => document.getElementById('empty-message')
}
