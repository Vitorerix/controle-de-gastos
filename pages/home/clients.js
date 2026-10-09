// Clientes / pagadores das contas profissionais (na conta de veterinária, as clínicas).
// Arquivar esconde o cliente das listas de escolha, mas mantém o histórico dele.

let showArchivedClients = false;
let editingClientId = null;

// "a/o" conforme o modelo: "Nova clínica", "Novo cliente"
function clientWord(feminine, masculine) {
    return getTerms(getActiveAccount()).clientFeminine ? feminine : masculine;
}

function getClients({ includeArchived = false } = {}) {
    return [...(state.clients || [])]
        .filter(client => includeArchived || !client.archived)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function findClient(id) {
    return (state.clients || []).find(client => client.id === id);
}

function getMonthIncomeByClient(clientId) {
    const items = getMonthTransactions()
        .filter(transaction => transaction.type === 'income' && transaction.details && transaction.details.clientId === clientId);
    return { count: items.length, total: items.reduce((sum, item) => sum + item.value, 0) };
}

function renderClientsPanel() {
    const panel = clientPage.panel();
    panel.hidden = !isProfessional();
    if (panel.hidden) {
        return;
    }

    const terms = getTerms(getActiveAccount());
    clientPage.title().textContent = terms.clientPlural;
    document.getElementById('add-client-button').textContent = `+ ${clientWord('Nova', 'Novo')}`;
    clientPage.hint().textContent =
        `Cadastre quem paga pelos seus ${terms.incomePlural.toLowerCase()}. Os números são do mês selecionado.`;

    const archivedCount = getClients({ includeArchived: true }).length - getClients().length;
    const visible = getClients({ includeArchived: showArchivedClients });
    const list = clientPage.list();
    list.innerHTML = '';

    if (!visible.length) {
        list.innerHTML = '<li class="muted empty-row"></li>';
        list.firstChild.textContent = `${clientWord('Nenhuma', 'Nenhum')} ${terms.client.toLowerCase()} ${clientWord('cadastrada', 'cadastrado')} ainda.`;
    }

    visible.forEach(client => {
        const { count, total } = getMonthIncomeByClient(client.id);
        const item = document.createElement('li');
        item.className = `client-item${client.archived ? ' archived' : ''}`;
        item.innerHTML = `
            <div class="client-info">
                <strong></strong>
                <small class="muted"></small>
            </div>
            <div class="client-stats">
                <strong>${formatCurrency(total)}</strong>
                <small class="muted">${count} ${count === 1 ? terms.income.toLowerCase() : terms.incomePlural.toLowerCase()}</small>
            </div>
            <button type="button" class="clear row-action" title="Editar" aria-label="Editar"><svg class="icon"><use href="#i-pencil"/></svg></button>
        `;
        item.querySelector('strong').textContent = client.name;
        item.querySelector('.client-info small').textContent =
            client.archived ? clientWord('Arquivada', 'Arquivado') : (client.notes || '');
        item.querySelector('button').onclick = () => openClientDialog(client.id);
        list.appendChild(item);
    });

    const archivedButton = clientPage.archivedButton();
    archivedButton.hidden = !archivedCount;
    archivedButton.textContent = showArchivedClients
        ? `Esconder ${clientWord('arquivadas', 'arquivados')}`
        : `Mostrar ${clientWord('arquivadas', 'arquivados')} (${archivedCount})`;
}

function toggleArchivedClients() {
    showArchivedClients = !showArchivedClients;
    renderClientsPanel();
}

function openClientDialog(id) {
    const client = id ? findClient(id) : null;
    const terms = getTerms(getActiveAccount());
    editingClientId = client ? client.id : null;

    clientPage.dialogTitle().textContent = client ? `Editar ${terms.client.toLowerCase()}` : `${clientWord('Nova', 'Novo')} ${terms.client.toLowerCase()}`;
    clientPage.name().value = client ? client.name : '';
    clientPage.notes().value = client ? (client.notes || '') : '';
    clientPage.error().style.display = 'none';
    clientPage.archiveButton().hidden = !client;
    clientPage.archiveButton().textContent = client && client.archived ? 'Reativar' : 'Arquivar';

    clientPage.dialog().showModal();
    clientPage.name().focus();
}

function closeClientDialog() {
    clientPage.dialog().close();
}

async function saveClient(event) {
    event.preventDefault();
    const name = clientPage.name().value.trim();
    if (!name) {
        return showClientError('Informe o nome.');
    }
    if (getClients({ includeArchived: true }).some(client =>
        client.id !== editingClientId && client.name.toLowerCase() === name.toLowerCase())) {
        return showClientError('Já existe um cadastro com esse nome.');
    }

    const existing = editingClientId ? findClient(editingClientId) : {};
    const client = { ...existing, id: editingClientId || createId(), name, notes: clientPage.notes().value.trim() };
    await persistClient(client);
}

async function toggleClientArchived() {
    const client = findClient(editingClientId);
    await persistClient({ ...client, archived: !client.archived });
}

async function persistClient(client) {
    try {
        await saveItem('clients', client);
    } catch (error) {
        return showClientError('Não foi possível salvar. Tente novamente.');
    }
    state.clients = (state.clients || []).filter(item => item.id !== client.id).concat(client);
    closeClientDialog();
    render();
}

function showClientError(message) {
    clientPage.error().textContent = message;
    clientPage.error().style.display = 'block';
}

const clientPage = {
    panel: () => document.getElementById('clients-panel'),
    title: () => document.getElementById('clients-title'),
    hint: () => document.getElementById('clients-hint'),
    list: () => document.getElementById('clients-list'),
    archivedButton: () => document.getElementById('show-archived-button'),
    dialog: () => document.getElementById('client-dialog'),
    dialogTitle: () => document.getElementById('client-dialog-title'),
    name: () => document.getElementById('client-name'),
    notes: () => document.getElementById('client-notes'),
    error: () => document.getElementById('client-error'),
    archiveButton: () => document.getElementById('archive-client-button')
}
