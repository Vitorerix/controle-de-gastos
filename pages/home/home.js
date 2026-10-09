// Dados do usuário carregados do Firestore; as telas leem daqui
const state = { transactions: [], categories: [], goals: [] };

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

function render() {
    page.monthLabel().textContent = formatMonth(currentMonth);
    renderCategoryOptions();
    renderSummary(getMonthTransactions());
    renderList();
    renderCategoriesPanel();
    renderGoals();
    renderAlerts();
    renderCharts();
}

document.addEventListener('themechange', render);

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

    return transactions.filter(transaction =>
        (!type || transaction.type === type) &&
        (!categoryId || transaction.categoryId === categoryId) &&
        (!search || transaction.description.toLowerCase().includes(search))
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
            <small>${formatDate(transaction.date)} · <span class="category"></span>${formatRepeat(transaction)}</small>
        </div>
        <span class="transaction-value">${sign}${formatCurrency(transaction.value)}</span>
        <div class="transaction-actions">
            <button type="button" class="clear row-action" title="Editar" aria-label="Editar"><svg class="icon"><use href="#i-pencil"/></svg></button>
            <button type="button" class="clear row-action danger-action" title="Excluir" aria-label="Excluir"><svg class="icon"><use href="#i-trash"/></svg></button>
        </div>
    `;
    item.prepend(createCategoryIcon(category));
    // textContent evita que o texto digitado pelo usuário seja interpretado como HTML
    item.querySelector('strong').textContent = transaction.description || category.name;
    item.querySelector('.category').textContent = category.name;

    const [editButton, deleteButton] = item.querySelectorAll('button');
    editButton.onclick = () => startEdit(transaction.id);
    deleteButton.onclick = () => removeTransaction(transaction.id);

    return item;
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
    page.saveButton().disabled = !isValueValid() || !isDateValid() || !isRepeatValid();
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

    const transaction = {
        id: editingId || createId(),
        type: document.querySelector('input[name="type"]:checked').value,
        value: parseAmount(page.value().value),
        date: page.date().value,
        categoryId: page.category().value,
        description: page.description().value.trim()
    };

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
    resetForm();
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
    page.category().value = transaction.categoryId;
    page.description().value = transaction.description;
    renderSelectedCategoryIcon();

    // A repetição só existe na criação; ao editar, muda apenas esta transação
    page.repeat().value = 'none';
    page.repeatField().style.display = 'none';

    hideFormErrors();
    toggleSaveButtonDisable();
    page.formTitle().textContent = 'Editar transação';
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

function resetForm() {
    editingId = null;
    page.form().reset();
    page.date().value = today();
    page.repeatField().style.display = 'block';
    onChangeRepeat();
    renderSelectedCategoryIcon();
    hideFormErrors();
    toggleSaveButtonDisable();
    page.formTitle().textContent = 'Nova transação';
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
