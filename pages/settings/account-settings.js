// Configurações das contas profissionais: nome, formas de pagamento, campos e exclusão.
// Os campos ficam salvos na própria conta; o painel monta o formulário a partir deles.

const FIELD_TYPE_LABELS = {
    text: 'Texto curto',
    textarea: 'Texto longo',
    select: 'Lista de opções',
    client: 'Cadastro de clientes',
    receipt: 'Comprovante (texto e foto)'
};

let professionalAccounts = [];
let deletingAccount = null;

async function loadAccountsSettings() {
    try {
        professionalAccounts = (await getAccounts()).filter(account => isProfessional(account));
    } catch (error) {
        console.error(error);
        el('accounts-settings').innerHTML = '<article class="panel"><p class="muted">Não foi possível carregar suas contas agora. Recarregue a página para tentar de novo.</p></article>';
        return;
    }
    renderAccountsSettings();
}

function renderAccountsSettings() {
    const container = el('accounts-settings');
    container.innerHTML = '';

    if (!professionalAccounts.length) {
        container.innerHTML = `
            <article class="panel">
                <h2><svg class="icon"><use href="#i-briefcase"/></svg>Nenhuma conta profissional</h2>
                <p>Crie uma no painel, pelo seletor de conta abaixo do nome do app, em <strong>Nova conta profissional</strong>.</p>
                <a class="primary" href="../home/home.html">Ir para o painel</a>
            </article>`;
        return;
    }

    professionalAccounts.forEach(account => container.appendChild(createAccountCard(account)));
}

function createAccountCard(account, fields = account.fields || []) {
    const terms = getTerms(account);
    const card = document.createElement('article');
    card.className = 'panel account-card';
    card.dataset.id = account.id;
    card.innerHTML = `
        <h2><svg class="icon"><use href="#i-briefcase"/></svg><span class="account-title"></span></h2>
        <p class="muted hint template-hint"></p>

        <div class="form-grid">
            <div class="form-field">
                <label>Nome da conta</label>
                <input type="text" class="account-name" maxlength="40">
            </div>
            <div class="form-field">
                <label>Formas de pagamento</label>
                <input type="text" class="account-payments" placeholder="Separadas por vírgula">
            </div>
        </div>

        <h3 class="fields-title">Campos dos lançamentos</h3>
        <p class="muted hint">Desmarque "Mostrar" para esconder um campo do formulário. Os valores já salvos continuam guardados.</p>
        <div class="fields-table" role="table">
            <div class="fields-row fields-head" role="row">
                <span role="columnheader">Mostrar</span>
                <span role="columnheader">Nome do campo</span>
                <span role="columnheader">Tipo</span>
                <span role="columnheader">Usado em</span>
                <span role="columnheader"></span>
            </div>
            <div class="fields-body"></div>
        </div>

        <details class="add-field">
            <summary>+ Adicionar campo</summary>
            <div class="add-field-form">
                <div class="form-field">
                    <label>Nome</label>
                    <input type="text" class="new-field-label" maxlength="40" placeholder="Ex.: Raça">
                </div>
                <div class="form-field">
                    <label>Tipo</label>
                    <select class="new-field-type">
                        <option value="text">Texto curto</option>
                        <option value="textarea">Texto longo</option>
                        <option value="select">Lista de opções</option>
                    </select>
                </div>
                <div class="form-field">
                    <label>Usado em</label>
                    <select class="new-field-applies"></select>
                </div>
                <div class="form-field new-field-options-wrap" hidden>
                    <label>Opções</label>
                    <input type="text" class="new-field-options" placeholder="Separadas por vírgula">
                </div>
                <button type="button" class="outline-dark add-field-button">Adicionar</button>
            </div>
        </details>

        <div class="error account-card-error"></div>
        <div class="form-actions account-card-actions">
            <button type="button" class="primary save-account-button">Salvar alterações</button>
            <button type="button" class="link-button danger-link delete-account-link">Excluir esta conta</button>
        </div>
    `;

    card.querySelector('.account-title').textContent = account.name;
    card.querySelector('.template-hint').textContent = `Modelo: ${getTemplate(account.template).label}. Criada em ${formatDateTime(account.createdAt, false)}.`;
    card.querySelector('.account-name').value = account.name;
    card.querySelector('.account-payments').value = (account.paymentMethods || PAYMENT_METHODS).join(', ');

    const appliesSelect = card.querySelector('.new-field-applies');
    [['income', terms.income], ['expense', terms.expense], ['both', 'Os dois']].forEach(([value, label]) =>
        appliesSelect.appendChild(new Option(label, value)));

    const body = card.querySelector('.fields-body');
    fields.forEach(field => body.appendChild(createFieldRow(field, terms)));

    card.querySelector('.new-field-type').onchange = event => {
        card.querySelector('.new-field-options-wrap').hidden = event.target.value !== 'select';
    };
    card.querySelector('.add-field-button').onclick = () => addField(card, account);
    card.querySelector('.save-account-button').onclick = () => saveAccountSettings(card, account);
    card.querySelector('.delete-account-link').onclick = () => openDeleteAccountDialog(account);
    return card;
}

function createFieldRow(field, terms) {
    const appliesLabels = { income: terms.income, expense: terms.expense, both: 'Os dois' };
    const row = document.createElement('div');
    row.className = 'fields-row';
    row.setAttribute('role', 'row');
    row.dataset.field = JSON.stringify(field);
    row.innerHTML = `
        <span role="cell"><input type="checkbox" class="field-visible" aria-label="Mostrar campo"></span>
        <span role="cell" class="field-name-cell">
            <input type="text" class="field-label" maxlength="40" aria-label="Nome do campo">
            <input type="text" class="field-options" placeholder="Opções separadas por vírgula" aria-label="Opções" hidden>
        </span>
        <span role="cell" class="muted"></span>
        <span role="cell" class="muted"></span>
        <span role="cell"></span>
    `;
    row.querySelector('.field-visible').checked = !field.hidden;
    row.querySelector('.field-label').value = field.label;
    const cells = row.querySelectorAll('[role="cell"]');
    cells[2].textContent = FIELD_TYPE_LABELS[field.type] || field.type;
    cells[3].textContent = appliesLabels[field.appliesTo] || field.appliesTo;

    if (field.type === 'select') {
        const options = row.querySelector('.field-options');
        options.hidden = false;
        options.value = (field.options || []).join(', ');
    }
    // Só os campos criados por você podem ser removidos; os do modelo podem ser escondidos
    if (field.custom) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'clear row-action danger-action';
        remove.title = 'Remover campo';
        remove.setAttribute('aria-label', 'Remover campo');
        remove.innerHTML = '<svg class="icon"><use href="#i-trash"/></svg>';
        remove.onclick = () => row.remove();
        cells[4].appendChild(remove);
    }
    return row;
}

function splitList(text) {
    return text.split(',').map(item => item.trim()).filter(Boolean);
}

// Lê os campos como estão na tela (inclusive alterações ainda não salvas)
function readFieldsFromCard(card) {
    return [...card.querySelectorAll('.fields-body .fields-row')].map(row => {
        const field = { ...JSON.parse(row.dataset.field) };
        field.label = row.querySelector('.field-label').value.trim();
        field.hidden = !row.querySelector('.field-visible').checked;
        if (field.type === 'select') {
            field.options = splitList(row.querySelector('.field-options').value);
        }
        return field;
    });
}

function slugify(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campo';
}

function addField(card, account) {
    const label = card.querySelector('.new-field-label').value.trim();
    const type = card.querySelector('.new-field-type').value;
    const options = splitList(card.querySelector('.new-field-options').value);
    if (!label) {
        return showCardError(card, 'Dê um nome para o novo campo.');
    }
    if (type === 'select' && options.length < 2) {
        return showCardError(card, 'Uma lista de opções precisa de pelo menos duas opções.');
    }

    const fields = readFieldsFromCard(card);
    let key = `custom-${slugify(label)}`;
    let suffix = 2;
    while (fields.some(field => field.key === key)) {
        key = `custom-${slugify(label)}-${suffix++}`;
    }
    const field = { key, label, type, appliesTo: card.querySelector('.new-field-applies').value, custom: true };
    if (type === 'select') {
        field.options = options;
    }

    // Campo novo entra antes de "Observações", que costuma ser o último
    const notesIndex = fields.findIndex(item => item.key === 'notes');
    fields.splice(notesIndex >= 0 ? notesIndex : fields.length, 0, field);
    replaceCard(card, account, fields);
    showToast(`Campo "${label}" adicionado. Clique em Salvar alterações para gravar.`);
}

// Redesenha o cartão mantendo nome e formas de pagamento ainda não salvos
function replaceCard(card, account, fields) {
    const draft = {
        ...account,
        name: card.querySelector('.account-name').value,
        paymentMethods: splitList(card.querySelector('.account-payments').value)
    };
    const fresh = createAccountCard(draft, fields);
    fresh.querySelector('.account-title').textContent = account.name;
    card.replaceWith(fresh);
}

function validateFields(fields) {
    if (fields.some(field => !field.label)) {
        return 'Todo campo precisa de um nome.';
    }
    const badSelect = fields.find(field => field.type === 'select' && (!field.options || !field.options.length));
    if (badSelect) {
        return `A lista "${badSelect.label}" precisa de pelo menos uma opção.`;
    }
    // Um campo que só aparece com certa opção (ex.: Clínica) quebraria se a opção sumisse
    for (const field of fields.filter(item => item.showWhen)) {
        const controller = fields.find(item => item.key === field.showWhen.field);
        if (controller && controller.type === 'select' && !controller.options.includes(field.showWhen.equals)) {
            return `A opção "${field.showWhen.equals}" de "${controller.label}" é usada para mostrar "${field.label}". Mantenha essa opção.`;
        }
    }
    return null;
}

async function saveAccountSettings(card, account) {
    const name = card.querySelector('.account-name').value.trim();
    const paymentMethods = splitList(card.querySelector('.account-payments').value);
    const fields = readFieldsFromCard(card);

    if (!name) {
        return showCardError(card, 'Dê um nome para a conta.');
    }
    if (name.toLowerCase() === PERSONAL_ACCOUNT.name.toLowerCase() ||
        professionalAccounts.some(item => item.id !== account.id && item.name.toLowerCase() === name.toLowerCase())) {
        return showCardError(card, 'Você já tem uma conta com esse nome.');
    }
    if (!paymentMethods.length) {
        return showCardError(card, 'Informe pelo menos uma forma de pagamento.');
    }
    const problem = validateFields(fields);
    if (problem) {
        return showCardError(card, problem);
    }

    const updated = { ...account, name, paymentMethods, fields };
    const button = card.querySelector('.save-account-button');
    button.disabled = true;
    try {
        await saveAccount(updated);
    } catch (error) {
        button.disabled = false;
        return showCardError(card, 'Não foi possível salvar. Tente novamente.');
    }
    professionalAccounts = professionalAccounts.map(item => item.id === account.id ? updated : item);
    card.replaceWith(createAccountCard(updated));
    showToast(`Conta "${name}" atualizada.`);
}

function showCardError(card, message) {
    const error = card.querySelector('.account-card-error');
    error.textContent = message;
    error.style.display = 'block';
}

// Exclusão de uma conta profissional ---------------------------------------------

function openDeleteAccountDialog(account) {
    deletingAccount = account;
    el('delete-account-name').textContent = account.name;
    el('delete-account-confirm').value = '';
    el('delete-account-error').style.display = 'none';
    el('delete-account-button').disabled = true;
    el('delete-account-dialog').showModal();
}

function closeDeleteAccountDialog() {
    el('delete-account-dialog').close();
}

function onChangeDeleteAccountConfirm() {
    el('delete-account-button').disabled =
        el('delete-account-confirm').value.trim().toLowerCase() !== deletingAccount.name.toLowerCase();
}

async function deleteProfessional(event) {
    event.preventDefault();
    if (!deletingAccount || el('delete-account-button').disabled) {
        return;
    }
    const confirmed = await requireRecentAuth(`Para excluir a conta "${deletingAccount.name}", confirme sua senha.`);
    if (!confirmed) {
        return;
    }

    el('delete-account-button').disabled = true;
    try {
        await deleteProfessionalAccount(deletingAccount);
    } catch (error) {
        console.error(error);
        el('delete-account-error').textContent = 'Não foi possível excluir a conta. Tente novamente.';
        el('delete-account-error').style.display = 'block';
        onChangeDeleteAccountConfirm();
        return;
    }

    // Se era a conta aberta no painel, o painel volta para a Pessoal
    try {
        const key = `activeAccount:${currentUser().uid}`;
        if (localStorage.getItem(key) === deletingAccount.id) {
            localStorage.removeItem(key);
        }
    } catch (error) {
        // Sem localStorage não há nada para limpar
    }

    const name = deletingAccount.name;
    professionalAccounts = professionalAccounts.filter(item => item.id !== deletingAccount.id);
    deletingAccount = null;
    closeDeleteAccountDialog();
    renderAccountsSettings();
    showToast(`Conta "${name}" excluída.`);
}
