// Dados de cada usuário ficam em users/{uid}/{transactions|categories|goals} no Firestore

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

function userCollection(name) {
    const uid = firebase.auth().currentUser.uid;
    return firebase.firestore().collection('users').doc(uid).collection(name);
}

function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function getItems(collection) {
    const snapshot = await userCollection(collection).get();
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

async function saveItems(collection, items) {
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = firebase.firestore().batch();
        items.slice(i, i + BATCH_LIMIT).forEach(({ id, ...data }) => batch.set(userCollection(collection).doc(id), data));
        await batch.commit();
    }
}

async function removeItems(collection, ids) {
    for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = firebase.firestore().batch();
        ids.slice(i, i + BATCH_LIMIT).forEach(id => batch.delete(userCollection(collection).doc(id)));
        await batch.commit();
    }
}

async function loadUserData() {
    const [transactions, categories, goals] = await Promise.all([
        getItems('transactions'),
        getItems('categories'),
        getItems('goals')
    ]);

    // Primeiro acesso: cria as categorias padrão para o usuário
    if (!categories.length) {
        const batch = firebase.firestore().batch();
        DEFAULT_CATEGORIES.forEach(({ id, ...data }) => batch.set(userCollection('categories').doc(id), data));
        await batch.commit();
        categories.push(...DEFAULT_CATEGORIES);
    }

    return { transactions, categories, goals };
}
