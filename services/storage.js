// Onde os dados ficam no Firestore:
//   users/{uid}                                   perfil (foto)
//   users/{uid}/{transactions|categories|goals}   conta Pessoal (o caminho de sempre, sem migração)
//   users/{uid}/accounts/{accountId}              cada conta profissional (nome, modelo, campos)
//   users/{uid}/accounts/{accountId}/{transactions|categories|goals|clients}

const DEFAULT_CATEGORIES = [
    { id: 'alimentacao', name: 'Alimentação', imageType: 'icon', image: 'utensils', color: '#f57c00' },
    { id: 'transporte', name: 'Transporte', imageType: 'icon', image: 'car', color: '#1976d2' },
    { id: 'moradia', name: 'Moradia', imageType: 'icon', image: 'house', color: '#6d4c41' },
    { id: 'lazer', name: 'Lazer', imageType: 'icon', image: 'gamepad-2', color: '#8e24aa' },
    { id: 'saude', name: 'Saúde', imageType: 'icon', image: 'heart-pulse', color: '#d81b60' },
    { id: 'educacao', name: 'Educação', imageType: 'icon', image: 'graduation-cap', color: '#3949ab' },
    { id: 'salario', name: 'Salário', imageType: 'icon', image: 'wallet', color: '#2e7d32' },
    { id: 'outros', name: 'Outros', imageType: 'icon', image: 'tag', color: '#757575' }
];

const PERSONAL_ACCOUNT = { id: 'personal', name: 'Pessoal', type: 'personal' };
const ACCOUNT_COLLECTIONS = ['transactions', 'categories', 'goals', 'clients'];

// Conta que as telas estão usando agora; todas as leituras e gravações vão para ela
let activeAccount = PERSONAL_ACCOUNT;

function setActiveAccount(account) {
    activeAccount = account;
}

function getActiveAccount() {
    return activeAccount;
}

function isProfessional(account = activeAccount) {
    return account.type === 'professional';
}

function userDoc() {
    return firebase.firestore().collection('users').doc(firebase.auth().currentUser.uid);
}

function accountsCollection() {
    return userDoc().collection('accounts');
}

// A conta Pessoal continua direto em users/{uid}; as profissionais ficam em accounts/{id}
function accountRoot(account = activeAccount) {
    return isProfessional(account) ? accountsCollection().doc(account.id) : userDoc();
}

function userCollection(name, account = activeAccount) {
    return accountRoot(account).collection(name);
}

function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function getItems(collection, account = activeAccount) {
    const snapshot = await userCollection(collection, account).get();
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
}

async function saveItem(collection, item) {
    const { id, ...data } = item;
    await userCollection(collection).doc(id).set(data);
}

async function removeItem(collection, id) {
    await userCollection(collection).doc(id).delete();
}

// Grava/apaga vários de uma vez. O Firestore aceita até 500 operações por lote.
const BATCH_LIMIT = 500;

async function saveItems(collection, items, account = activeAccount) {
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = firebase.firestore().batch();
        items.slice(i, i + BATCH_LIMIT).forEach(({ id, ...data }) => batch.set(userCollection(collection, account).doc(id), data));
        await batch.commit();
    }
}

async function removeItems(collection, ids, account = activeAccount) {
    for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = firebase.firestore().batch();
        ids.slice(i, i + BATCH_LIMIT).forEach(id => batch.delete(userCollection(collection, account).doc(id)));
        await batch.commit();
    }
}

async function loadUserData(account = activeAccount) {
    const [transactions, categories, goals, clients] = await Promise.all([
        getItems('transactions', account),
        getItems('categories', account),
        getItems('goals', account),
        isProfessional(account) ? getItems('clients', account) : []
    ]);

    // Primeiro acesso: cria as categorias padrão da conta
    if (!categories.length) {
        const defaults = isProfessional(account) ? getTemplate(account.template).categories : DEFAULT_CATEGORIES;
        await saveItems('categories', defaults, account);
        categories.push(...defaults);
    }

    return { transactions, categories, goals, clients };
}

// Contas -----------------------------------------------------------------------

async function getAccounts() {
    const snapshot = await accountsCollection().get();
    const professional = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return [PERSONAL_ACCOUNT, ...professional];
}

async function saveAccount(account) {
    const { id, ...data } = account;
    await accountsCollection().doc(id).set(data);
}

// Cria a conta profissional já com as categorias do modelo escolhido
async function createProfessionalAccount(name, templateId) {
    const template = getTemplate(templateId);
    const account = {
        id: createId(),
        name,
        type: 'professional',
        template: templateId,
        terms: template.terms,
        fields: template.fields,
        paymentMethods: PAYMENT_METHODS,
        createdAt: new Date().toISOString()
    };
    await saveAccount(account);
    await saveItems('categories', template.categories, account);
    return account;
}

// Apaga uma conta profissional com tudo o que há nela
async function deleteProfessionalAccount(account) {
    for (const collection of ACCOUNT_COLLECTIONS) {
        const items = await getItems(collection, account);
        await removeItems(collection, items.map(item => item.id), account);
    }
    await accountsCollection().doc(account.id).delete();
}

// Perfil -----------------------------------------------------------------------
// A foto fica no documento users/{uid}: no Firebase Auth só cabe um link, não a imagem.

async function getProfile() {
    const snapshot = await userDoc().get();
    return snapshot.exists ? snapshot.data() : {};
}

async function saveProfile(data) {
    await userDoc().set(data, { merge: true });
}

// Apaga tudo o que o usuário guardou, em todas as contas, e depois o perfil
async function deleteAllUserData() {
    for (const account of await getAccounts()) {
        for (const collection of ACCOUNT_COLLECTIONS) {
            const items = await getItems(collection, account);
            await removeItems(collection, items.map(item => item.id), account);
        }
        if (isProfessional(account)) {
            await accountsCollection().doc(account.id).delete();
        }
    }
    await userDoc().delete();
}
