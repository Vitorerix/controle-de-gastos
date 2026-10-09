// Campos extras das contas profissionais (local, clínica, paciente, comprovante...).
// O formulário é montado a partir da lista "fields" salva em cada conta, então outro
// tipo de profissional pode ter campos diferentes sem mudar o código.
// Os valores ficam em transaction.details[key]; o status fica em transaction.status.

const RECEIPT_MAX_SIDE = 1400;
const RECEIPT_MAX_BYTES = 700 * 1024;
const STATUS_LABELS = { received: 'Recebido', pending: 'Pendente' };

// Foto de comprovante escolhida no formulário, antes de salvar
let receiptPhotoDraft = null;

function getAccountFields() {
    return isProfessional() ? (getActiveAccount().fields || []) : [];
}

function getFieldsFor(type) {
    return getAccountFields().filter(field => !field.hidden && (field.appliesTo === 'both' || field.appliesTo === type));
}

// Campo com showWhen só aparece quando o campo "controlador" tem o valor pedido.
// Se o controlador estiver oculto ou não existir, o campo aparece sempre.
function isFieldVisible(field, values, fields) {
    if (!field.showWhen) {
        return true;
    }
    const controller = fields.find(item => item.key === field.showWhen.field);
    return !controller || values[field.showWhen.field] === field.showWhen.equals;
}

// Formulário ------------------------------------------------------------------

function renderExtraFields(transaction) {
    const container = fieldPage.container();
    const type = currentType();
    const details = transaction ? (transaction.details || {}) : readExtraFieldValues({ includeHidden: true });
    container.innerHTML = '';

    if (!isProfessional()) {
        return;
    }

    if (type === 'income') {
        const status = transaction ? (transaction.status || 'received') : (fieldPage.statusValue() || 'received');
        container.appendChild(createStatusField(status));
    }

    getFieldsFor(type).forEach(field => container.appendChild(createFieldElement(field, details[field.key])));
    receiptPhotoDraft = details.receipt && details.receipt.photo ? details.receipt.photo : null;
    renderReceiptPreview();
    updateFieldVisibility();
}

function createStatusField(status) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field status-field';
    wrapper.innerHTML = `
        <b>Situação</b>
        <div class="segmented" role="radiogroup" aria-label="Situação do pagamento">
            <label><input type="radio" name="entry-status" value="received"> Recebido</label>
            <label><input type="radio" name="entry-status" value="pending"> Pendente</label>
        </div>
    `;
    wrapper.querySelector(`input[value="${status}"]`).checked = true;
    return wrapper;
}

function createFieldElement(field, value) {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field extra-field';
    wrapper.dataset.key = field.key;
    const id = `field-${field.key}`;
    wrapper.innerHTML = `<div><label for="${id}"><b></b></label></div>`;
    wrapper.querySelector('b').textContent = field.label + (field.required ? '' : ' (opcional)');

    let control;
    if (field.type === 'select') {
        control = document.createElement('select');
        field.options.forEach(option => control.appendChild(new Option(option, option)));
        control.value = value || field.options[0];
        control.onchange = onChangeExtraField;
    } else if (field.type === 'client') {
        control = createClientSelect(value);
        const row = document.createElement('div');
        row.className = 'category-row';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'outline-dark';
        add.textContent = '+';
        add.title = `Cadastrar ${getTerms(getActiveAccount()).client.toLowerCase()}`;
        add.onclick = () => openClientDialog();
        row.append(control, add);
        wrapper.appendChild(row);
    } else if (field.type === 'textarea') {
        control = document.createElement('textarea');
        control.rows = 2;
        control.value = value || '';
    } else if (field.type === 'receipt') {
        wrapper.appendChild(createReceiptControl(id, value || {}));
        return wrapper;
    } else {
        control = document.createElement('input');
        control.type = 'text';
        control.value = value || '';
        if (field.suggestions) {
            control.setAttribute('list', `${id}-suggestions`);
            wrapper.appendChild(createSuggestions(`${id}-suggestions`, field.key));
        }
    }

    control.id = id;
    control.oninput = control.oninput || onChangeExtraField;
    if (field.type !== 'client') {
        wrapper.appendChild(control);
    }
    if (field.required) {
        const error = document.createElement('div');
        error.className = 'error';
        error.textContent = `Informe ${field.label.toLowerCase()}`;
        wrapper.appendChild(error);
    }
    return wrapper;
}

function createClientSelect(value) {
    const terms = getTerms(getActiveAccount());
    const select = document.createElement('select');
    select.appendChild(new Option(`Selecione a ${terms.client.toLowerCase()}`, ''));
    // Arquivados só aparecem quando já estão no lançamento sendo editado
    getClients({ includeArchived: true })
        .filter(client => !client.archived || client.id === value)
        .forEach(client => select.appendChild(new Option(client.name, client.id)));
    select.value = value || '';
    select.onchange = onChangeExtraField;
    return select;
}

// Sugestões com o que já foi digitado antes (ex.: tipos de atendimento)
function createSuggestions(id, key) {
    const list = document.createElement('datalist');
    list.id = id;
    const values = new Set(state.transactions
        .map(transaction => transaction.details && transaction.details[key])
        .filter(Boolean));
    [...values].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(value => list.appendChild(new Option(value)));
    return list;
}

function createReceiptControl(id, receipt) {
    const box = document.createElement('div');
    box.className = 'receipt-control';
    box.innerHTML = `
        <input type="text" id="${id}" placeholder="Nº da nota, link ou onde está guardado">
        <div class="receipt-actions">
            <label class="outline-dark receipt-photo-button">
                <svg class="icon"><use href="#i-camera"/></svg>
                <span>Anexar foto</span>
                <input type="file" accept="image/*" capture="environment" onchange="onChangeReceiptPhoto(event)" hidden>
            </label>
            <div class="receipt-preview" id="receipt-preview" hidden>
                <button type="button" class="receipt-thumb" onclick="openPhoto(receiptPhotoDraft)" title="Ver foto"></button>
                <button type="button" class="link-button danger-link" onclick="removeReceiptPhoto()">Remover foto</button>
            </div>
        </div>
        <small class="muted">A foto é comprimida para caber no seu armazenamento (até ~700 KB).</small>
        <div class="error" id="receipt-error"></div>
    `;
    box.querySelector('input[type="text"]').value = receipt.text || '';
    return box;
}

async function onChangeReceiptPhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    const error = document.getElementById('receipt-error');
    error.style.display = 'none';
    if (!file) {
        return;
    }
    if (!file.type.startsWith('image/')) {
        error.textContent = 'Escolha uma foto (JPG ou PNG).';
        error.style.display = 'block';
        return;
    }
    try {
        receiptPhotoDraft = await compressImage(file, RECEIPT_MAX_SIDE, RECEIPT_MAX_BYTES);
    } catch (e) {
        error.textContent = e.message === 'too-big'
            ? 'Essa foto continua grande demais mesmo comprimida. Tente uma foto mais simples ou recortada.'
            : 'Não foi possível ler essa imagem.';
        error.style.display = 'block';
        return;
    }
    renderReceiptPreview();
}

function removeReceiptPhoto() {
    receiptPhotoDraft = null;
    renderReceiptPreview();
}

function renderReceiptPreview() {
    const preview = document.getElementById('receipt-preview');
    if (!preview) {
        return;
    }
    preview.hidden = !receiptPhotoDraft;
    preview.querySelector('.receipt-thumb').style.backgroundImage = receiptPhotoDraft ? `url("${receiptPhotoDraft}")` : '';
    preview.parentElement.querySelector('.receipt-photo-button span').textContent = receiptPhotoDraft ? 'Trocar foto' : 'Anexar foto';
}

function onChangeExtraField() {
    updateFieldVisibility();
    toggleSaveButtonDisable();
}

function updateFieldVisibility() {
    const fields = getFieldsFor(currentType());
    const values = readExtraFieldValues({ includeHidden: true });
    fields.forEach(field => {
        const element = fieldPage.container().querySelector(`[data-key="${field.key}"]`);
        if (element) {
            element.hidden = !isFieldVisible(field, values, fields);
        }
    });
}

// Lê os valores do formulário. Por padrão ignora campos escondidos pelo showWhen
// (ex.: endereço quando o local é "Clínica"), para não salvar lixo.
function readExtraFieldValues({ includeHidden = false } = {}) {
    const values = {};
    getFieldsFor(currentType()).forEach(field => {
        const element = fieldPage.container().querySelector(`[data-key="${field.key}"]`);
        if (!element || (!includeHidden && element.hidden)) {
            return;
        }
        if (field.type === 'receipt') {
            const text = element.querySelector('input[type="text"]').value.trim();
            if (text || receiptPhotoDraft) {
                values[field.key] = { text, photo: receiptPhotoDraft };
            }
            return;
        }
        const control = element.querySelector('input, select, textarea');
        const value = control.value.trim();
        if (value) {
            values[field.key] = value;
        }
    });
    return values;
}

function isExtraFieldsValid() {
    const values = readExtraFieldValues();
    return getFieldsFor(currentType()).every(field => {
        const element = fieldPage.container().querySelector(`[data-key="${field.key}"]`);
        return !field.required || !element || element.hidden || !!values[field.key];
    });
}

function showExtraFieldErrors() {
    const values = readExtraFieldValues();
    fieldPage.container().querySelectorAll('.extra-field').forEach(element => {
        const error = element.querySelector(':scope > .error');
        if (error) {
            error.style.display = element.hidden || values[element.dataset.key] ? 'none' : 'block';
        }
    });
}

function readEntryStatus() {
    return isProfessional() && currentType() === 'income' ? (fieldPage.statusValue() || 'received') : null;
}

// Lista ------------------------------------------------------------------------

// Resumo dos campos extras para a linha da lista: "Clínica Vida · Thor · Ana"
function describeDetails(transaction) {
    if (!isProfessional() || !transaction.details) {
        return [];
    }
    const details = transaction.details;
    const fields = getAccountFields().filter(field =>
        !field.hidden && (field.appliesTo === 'both' || field.appliesTo === transaction.type));
    const parts = [];
    fields.forEach(field => {
        const value = details[field.key];
        if (!value || ['notes', 'receipt', 'serviceType'].includes(field.key)) {
            return;
        }
        if (field.type === 'client') {
            const client = findClient(value);
            parts.push(client ? client.name : 'Cliente removido');
        } else if (field.key === 'location' && details.clientId) {
            // "Clínica" é redundante quando o nome da clínica já aparece
        } else {
            parts.push(value);
        }
    });
    return parts;
}

// Título da linha: descrição, senão o tipo de atendimento, senão a categoria
function describeTitle(transaction, category) {
    return transaction.description || (transaction.details && transaction.details.serviceType) || category.name;
}

// Texto pesquisável de um lançamento (descrição + todos os campos extras)
function searchableText(transaction) {
    const details = transaction.details || {};
    const client = details.clientId ? findClient(details.clientId) : null;
    return [transaction.description, client && client.name,
        ...Object.values(details).filter(value => typeof value === 'string'),
        details.receipt && details.receipt.text]
        .filter(Boolean).join(' ').toLowerCase();
}

// Agrupamento por origem do atendimento -----------------------------------------
// Na veterinária: cada clínica é um grupo e "Domicílio" é outro. No modelo genérico: só clientes.

function getLocationSetup() {
    const fields = getAccountFields();
    const clientField = fields.find(field => field.type === 'client' && !field.hidden);
    const locationField = clientField && clientField.showWhen
        ? fields.find(field => field.key === clientField.showWhen.field && !field.hidden)
        : null;
    return {
        clientField,
        locationField,
        clientLocation: locationField ? clientField.showWhen.equals : null
    };
}

function getIncomeGroup(transaction) {
    const details = transaction.details || {};
    const { clientField, locationField, clientLocation } = getLocationSetup();
    const location = locationField ? details[locationField.key] : null;

    if (location && location !== clientLocation) {
        return { id: `location:${location}`, name: location, kind: 'location' };
    }
    const clientId = clientField ? details[clientField.key] : null;
    if (clientId) {
        const client = findClient(clientId);
        return { id: clientId, name: client ? client.name : 'Cadastro removido', kind: 'client', client };
    }
    const terms = getTerms(getActiveAccount());
    return { id: 'none', name: `Sem ${terms.client.toLowerCase()}`, kind: 'none' };
}

// Opções para filtros e fechamento: clínicas/clientes (inclusive arquivados) + locais sem cliente
function getGroupOptions() {
    const { locationField, clientLocation } = getLocationSetup();
    const groups = getClients({ includeArchived: true }).map(client => ({
        id: client.id,
        name: client.archived ? `${client.name} (${clientWord('arquivada', 'arquivado')})` : client.name,
        kind: 'client'
    }));
    if (locationField) {
        locationField.options
            .filter(option => option !== clientLocation)
            .forEach(option => groups.push({ id: `location:${option}`, name: option, kind: 'location' }));
    }
    return groups;
}

// Janela de foto ---------------------------------------------------------------

function openPhoto(photo) {
    if (!photo) {
        return;
    }
    document.getElementById('photo-view').src = photo;
    document.getElementById('photo-dialog').showModal();
}

const fieldPage = {
    container: () => document.getElementById('extra-fields'),
    statusValue: () => {
        const checked = document.querySelector('input[name="entry-status"]:checked');
        return checked ? checked.value : null;
    }
}
