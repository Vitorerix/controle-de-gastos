// Contas: seletor do cabeçalho, troca de conta e criação de conta profissional

let accounts = [PERSONAL_ACCOUNT];

function activeAccountKey() {
    return `activeAccount:${firebase.auth().currentUser.uid}`;
}

function getSavedAccountId() {
    try {
        return localStorage.getItem(activeAccountKey());
    } catch (error) {
        return null;
    }
}

function rememberActiveAccount(id) {
    try {
        localStorage.setItem(activeAccountKey(), id);
    } catch (error) {
        // Sem localStorage o app só volta para a conta Pessoal ao recarregar
    }
}

// Carrega as contas e reabre a última usada neste navegador
async function initAccounts() {
    accounts = await getAccounts();
    setActiveAccount(accounts.find(account => account.id === getSavedAccountId()) || PERSONAL_ACCOUNT);
}

function describeAccount(account) {
    return isProfessional(account) ? `Profissional · ${getTemplate(account.template).label}` : 'Gastos pessoais';
}

function renderAccountSwitcher() {
    const active = getActiveAccount();
    accountPage.name().textContent = active.name;
    accountPage.icon().querySelector('use').setAttribute('href', isProfessional(active) ? '#i-briefcase' : '#i-wallet');

    const list = accountPage.list();
    list.innerHTML = '';
    accounts.forEach(account => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'account-option';
        option.setAttribute('role', 'menuitemradio');
        option.setAttribute('aria-checked', String(account.id === active.id));
        option.innerHTML = `
            <svg class="icon"><use href="${isProfessional(account) ? '#i-briefcase' : '#i-wallet'}"/></svg>
            <span><strong></strong><small></small></span>
            <svg class="icon check"><use href="#i-check"/></svg>
        `;
        option.querySelector('strong').textContent = account.name;
        option.querySelector('small').textContent = describeAccount(account);
        option.onclick = () => switchAccount(account.id);
        list.appendChild(option);
    });
}

function toggleAccountMenu(open) {
    const menu = accountPage.menu();
    const show = typeof open === 'boolean' ? open : menu.hidden;
    menu.hidden = !show;
    accountPage.button().setAttribute('aria-expanded', String(show));
}

// Fecha o menu ao clicar fora ou apertar Esc
document.addEventListener('click', event => {
    if (!event.target.closest('.account-switcher')) {
        toggleAccountMenu(false);
    }
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        toggleAccountMenu(false);
    }
});

async function switchAccount(id) {
    toggleAccountMenu(false);
    const previous = getActiveAccount();
    if (id === previous.id) {
        return;
    }

    setActiveAccount(accounts.find(account => account.id === id));
    page.app().classList.add('switching');
    try {
        await reloadAccountData();
    } catch (error) {
        console.error(error);
        setActiveAccount(previous);
        alert('Não foi possível abrir essa conta agora. Verifique sua conexão e tente de novo.');
        return;
    } finally {
        page.app().classList.remove('switching');
    }
    rememberActiveAccount(id);
}

// Janela de nova conta ---------------------------------------------------------

function openAccountDialog() {
    toggleAccountMenu(false);
    accountPage.nameInput().value = '';
    accountPage.error().style.display = 'none';

    const options = accountPage.templates();
    options.innerHTML = '';
    Object.entries(ACCOUNT_TEMPLATES).forEach(([id, template], index) => {
        const label = document.createElement('label');
        label.className = 'template-option';
        label.innerHTML = `
            <input type="radio" name="account-template" value="${id}" ${index === 0 ? 'checked' : ''}>
            <span><strong></strong><small></small></span>
        `;
        label.querySelector('strong').textContent = template.label;
        label.querySelector('small').textContent = template.description;
        options.appendChild(label);
    });

    accountPage.dialog().showModal();
    accountPage.nameInput().focus();
}

function closeAccountDialog() {
    accountPage.dialog().close();
}

async function createAccount(event) {
    event.preventDefault();
    const name = accountPage.nameInput().value.trim();
    const templateId = document.querySelector('input[name="account-template"]:checked').value;

    if (!name) {
        return showAccountError('Dê um nome para a conta, por exemplo "Veterinária".');
    }
    if (accounts.some(account => account.name.toLowerCase() === name.toLowerCase())) {
        return showAccountError('Você já tem uma conta com esse nome.');
    }

    accountPage.createButton().disabled = true;
    let account;
    try {
        account = await createProfessionalAccount(name, templateId);
    } catch (error) {
        console.error(error);
        return showAccountError('Não foi possível criar a conta. Tente novamente.');
    } finally {
        accountPage.createButton().disabled = false;
    }

    accounts.push(account);
    closeAccountDialog();
    await switchAccount(account.id);
}

function showAccountError(message) {
    accountPage.error().textContent = message;
    accountPage.error().style.display = 'block';
}

const accountPage = {
    button: () => document.getElementById('account-button'),
    name: () => document.getElementById('account-name'),
    icon: () => document.getElementById('account-icon'),
    menu: () => document.getElementById('account-menu'),
    list: () => document.getElementById('account-list'),
    dialog: () => document.getElementById('account-dialog'),
    nameInput: () => document.getElementById('account-name-input'),
    templates: () => document.getElementById('template-options'),
    error: () => document.getElementById('account-error'),
    createButton: () => document.getElementById('create-account-button')
}
