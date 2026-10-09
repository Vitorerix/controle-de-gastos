// Configurações da conta: perfil, segurança e sessão

const PROFILE_PHOTO_SIZE = 160;
const LOAD_TIMEOUT = 15000;
// Depois de confirmar a senha, outras ações sensíveis ficam liberadas por este tempo
const REAUTH_WINDOW = 5 * 60 * 1000;
const DELETE_CONFIRM_WORD = 'EXCLUIR';

let profile = {};
let lastReauthAt = 0;
let pendingReauth = null;

firebase.auth().onAuthStateChanged(user => {
    if (!user) {
        window.location.href = '../../index.html';
        return;
    }
    start(user);
});

async function start(user) {
    try {
        profile = await Promise.race([
            getProfile(),
            new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT))
        ]);
    } catch (error) {
        // Sem o perfil a página funciona; só a foto não aparece
        console.error(error);
        profile = {};
        showToast('Não foi possível carregar sua foto agora.', true);
    }

    el('loading').hidden = true;
    el('app').hidden = false;
    renderAccount(user);
    renderSession(user);
    showSection();
    loadAccountsSettings();
}

function currentUser() {
    return firebase.auth().currentUser;
}

// Navegação entre seções ------------------------------------------------------

window.addEventListener('hashchange', showSection);

function showSection() {
    const section = ['#seguranca', '#contas'].includes(location.hash) ? location.hash.slice(1) : 'conta';
    document.querySelectorAll('.settings-section').forEach(element => {
        element.hidden = element.id !== `section-${section}`;
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
        item.setAttribute('aria-current', item.dataset.section === section ? 'page' : 'false');
    });
}

// Minha conta ----------------------------------------------------------------

function renderAccount(user) {
    const name = user.displayName || '';
    el('nav-name').textContent = name || 'Sem nome';
    el('nav-email').textContent = user.email;
    el('display-name').value = name;
    el('save-name-button').disabled = true;

    renderAvatar(el('nav-avatar'), user);
    renderAvatar(el('profile-avatar'), user);
    el('remove-photo-button').hidden = !profile.photo;

    el('account-email').textContent = user.email;
    el('current-email').value = user.email;
    el('account-created').textContent = formatDateTime(user.metadata.creationTime, false);

    const badge = el('email-verified-badge');
    badge.textContent = user.emailVerified ? 'Verificado' : 'Não verificado';
    badge.className = `badge ${user.emailVerified ? 'ok' : 'pending'}`;
    el('send-verification-button').hidden = user.emailVerified;
}

// Foto do perfil ou, sem foto, as iniciais do nome
function renderAvatar(element, user) {
    element.style.backgroundImage = profile.photo ? `url("${profile.photo}")` : '';
    element.classList.toggle('has-photo', !!profile.photo);
    element.textContent = profile.photo ? '' : getInitials(user.displayName || user.email);
}

function getInitials(text) {
    const words = text.split('@')[0].split(/[\s._-]+/).filter(Boolean);
    return ((words[0] || '?')[0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
}

function onChangeDisplayName() {
    const name = el('display-name').value.trim();
    el('display-name-error').style.display = name ? 'none' : 'block';
    el('save-name-button').disabled = !name || name === (currentUser().displayName || '');
}

async function saveDisplayName(event) {
    event.preventDefault();
    const name = el('display-name').value.trim();
    if (!name) {
        return;
    }

    el('save-name-button').disabled = true;
    try {
        await currentUser().updateProfile({ displayName: name });
    } catch (error) {
        onChangeDisplayName();
        return showToast(getAuthErrorMessage(error), true);
    }
    renderAccount(currentUser());
    showToast('Nome atualizado.');
}

async function onChangePhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) {
        return;
    }
    if (!file.type.startsWith('image/')) {
        return showToast('Escolha um arquivo de imagem (JPG ou PNG).', true);
    }
    if (file.size > MAX_UPLOAD_SIZE) {
        return showToast('A imagem deve ter no máximo 5 MB.', true);
    }

    try {
        const photo = await resizeImage(file, PROFILE_PHOTO_SIZE);
        await saveProfile({ photo });
        profile.photo = photo;
    } catch (error) {
        return showToast('Não foi possível salvar a foto. Tente outra imagem.', true);
    }
    renderAccount(currentUser());
    showToast('Foto atualizada.');
}

async function removePhoto() {
    try {
        await saveProfile({ photo: null });
        profile.photo = null;
    } catch (error) {
        return showToast('Não foi possível remover a foto. Tente novamente.', true);
    }
    renderAccount(currentUser());
    showToast('Foto removida.');
}

async function sendVerification() {
    el('send-verification-button').disabled = true;
    try {
        firebase.auth().useDeviceLanguage();
        await currentUser().sendEmailVerification();
        showToast(`Enviamos um link de verificação para ${currentUser().email}.`);
    } catch (error) {
        showToast(getAuthErrorMessage(error), true);
    } finally {
        el('send-verification-button').disabled = false;
    }
}

// Exclusão da conta ----------------------------------------------------------

function openDeleteDialog() {
    el('delete-confirm-text').value = '';
    el('delete-error').style.display = 'none';
    el('delete-button').disabled = true;
    el('delete-dialog').showModal();
}

function closeDeleteDialog() {
    el('delete-dialog').close();
}

function onChangeDeleteConfirm() {
    el('delete-button').disabled = el('delete-confirm-text').value.trim().toUpperCase() !== DELETE_CONFIRM_WORD;
}

async function deleteAccount(event) {
    event.preventDefault();
    if (el('delete-confirm-text').value.trim().toUpperCase() !== DELETE_CONFIRM_WORD) {
        return;
    }

    const confirmed = await requireRecentAuth('Para excluir sua conta, confirme a senha.');
    if (!confirmed) {
        return;
    }

    el('delete-button').disabled = true;
    el('delete-button').textContent = 'Excluindo…';
    try {
        await deleteAllUserData();
        await currentUser().delete();
    } catch (error) {
        el('delete-button').textContent = 'Excluir para sempre';
        onChangeDeleteConfirm();
        el('delete-error').textContent = getAuthErrorMessage(error);
        el('delete-error').style.display = 'block';
        return;
    }

    try {
        localStorage.removeItem('rememberMe');
    } catch (error) {
        // Sem localStorage não há nada para limpar
    }
    alert('Sua conta e todos os seus dados foram excluídos.');
    window.location.href = '../../index.html';
}

// Segurança: senha -----------------------------------------------------------

function onChangePasswordForm() {
    const current = el('current-password').value;
    const next = el('new-password').value;
    const confirm = el('confirm-new-password').value;

    el('new-password-error').style.display = next && next.length < 6 ? 'block' : 'none';
    el('confirm-password-error').style.display = confirm && confirm !== next ? 'block' : 'none';
    el('change-password-button').disabled = !current || next.length < 6 || next !== confirm;
}

async function changePassword(event) {
    event.preventDefault();
    const current = el('current-password').value;
    const next = el('new-password').value;
    if (!current || next.length < 6 || next !== el('confirm-new-password').value) {
        return;
    }
    if (next === current) {
        return showToast('A nova senha precisa ser diferente da atual.', true);
    }

    el('change-password-button').disabled = true;
    try {
        // A senha atual digitada no formulário já serve como confirmação
        await reauthenticate(current);
        await currentUser().updatePassword(next);
    } catch (error) {
        onChangePasswordForm();
        return showToast(getAuthErrorMessage(error, 'Senha atual incorreta.'), true);
    }

    event.target.reset();
    onChangePasswordForm();
    showToast('Senha alterada. Use a nova senha no próximo login.');
}

async function sendResetEmail() {
    el('reset-password-button').disabled = true;
    try {
        firebase.auth().useDeviceLanguage();
        await firebase.auth().sendPasswordResetEmail(currentUser().email);
        showToast(`Enviamos um link para criar uma nova senha em ${currentUser().email}.`);
    } catch (error) {
        showToast(getAuthErrorMessage(error), true);
    } finally {
        el('reset-password-button').disabled = false;
    }
}

// Segurança: e-mail ----------------------------------------------------------

function getNewEmailProblem() {
    const email = el('new-email').value.trim();
    if (!email) {
        return '';
    }
    if (!validateEmail(email)) {
        return 'Esse e-mail não parece válido. Confira se tem @ e domínio.';
    }
    if (email.toLowerCase() === currentUser().email.toLowerCase()) {
        return 'Esse já é o seu e-mail atual.';
    }
    return null;
}

function onChangeNewEmail() {
    const problem = getNewEmailProblem();
    el('new-email-error').textContent = problem || '';
    el('new-email-error').style.display = problem ? 'block' : 'none';
    el('change-email-button').disabled = problem !== null;
}

async function changeEmail(event) {
    event.preventDefault();
    if (getNewEmailProblem() !== null) {
        return;
    }
    const newEmail = el('new-email').value.trim();

    const confirmed = await requireRecentAuth('Para alterar o e-mail de acesso, confirme a senha.');
    if (!confirmed) {
        return;
    }

    el('change-email-button').disabled = true;
    try {
        firebase.auth().useDeviceLanguage();
        await currentUser().verifyBeforeUpdateEmail(newEmail);
    } catch (error) {
        onChangeNewEmail();
        return showToast(getAuthErrorMessage(error), true);
    }

    el('new-email').value = '';
    onChangeNewEmail();
    showToast(`Enviamos um link para ${newEmail}. Clique nele para concluir a troca.`);
}

// Nova autenticação para ações sensíveis --------------------------------------

async function reauthenticate(password) {
    const user = currentUser();
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);
    lastReauthAt = Date.now();
}

// Pede a senha de novo, a não ser que ela tenha sido confirmada há pouco.
// Resolve true quando confirmada e false quando o usuário cancela.
function requireRecentAuth(reason) {
    if (Date.now() - lastReauthAt < REAUTH_WINDOW) {
        return Promise.resolve(true);
    }
    el('reauth-reason').textContent = reason;
    el('reauth-password').value = '';
    el('reauth-error').style.display = 'none';
    el('reauth-dialog').showModal();
    el('reauth-password').focus();

    return new Promise(resolve => {
        pendingReauth = resolve;
    });
}

function finishReauth(confirmed) {
    if (pendingReauth) {
        pendingReauth(confirmed);
        pendingReauth = null;
    }
    if (el('reauth-dialog').open) {
        el('reauth-dialog').close();
    }
}

async function submitReauth(event) {
    event.preventDefault();
    const password = el('reauth-password').value;
    if (!password) {
        el('reauth-error').textContent = 'Digite sua senha.';
        el('reauth-error').style.display = 'block';
        return;
    }

    el('reauth-button').disabled = true;
    try {
        await reauthenticate(password);
    } catch (error) {
        el('reauth-error').textContent = getAuthErrorMessage(error, 'Senha incorreta.');
        el('reauth-error').style.display = 'block';
        return;
    } finally {
        el('reauth-button').disabled = false;
    }
    finishReauth(true);
}

function cancelReauth() {
    finishReauth(false);
}

// Esc fecha a janela: conta como cancelar
el('reauth-dialog').addEventListener('cancel', () => finishReauth(false));

// Sessão ---------------------------------------------------------------------

function renderSession(user) {
    el('session-device').textContent = describeDevice(navigator.userAgent);
    el('session-last-login').textContent = formatDateTime(user.metadata.lastSignInTime, true);

    const providers = user.providerData.map(provider => provider.providerId);
    el('session-provider').textContent = providers.includes('password') ? 'E-mail e senha' : providers.join(', ');

    let remember = null;
    try {
        remember = localStorage.getItem('rememberMe');
    } catch (error) {
        // Sem localStorage mostramos o padrão
    }
    el('session-remember').textContent = remember === 'false'
        ? 'Não. A sessão termina quando o navegador for fechado.'
        : 'Sim, neste navegador.';
}

function describeDevice(userAgent) {
    const browsers = [
        [/Edg\//, 'Edge'], [/OPR\//, 'Opera'], [/SamsungBrowser/, 'Samsung Internet'],
        [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari']
    ];
    const systems = [
        [/Windows/, 'Windows'], [/Android/, 'Android'], [/iPhone|iPad|iPod/, 'iOS'],
        [/Mac OS X|Macintosh/, 'macOS'], [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux']
    ];
    const find = (list) => (list.find(([pattern]) => pattern.test(userAgent)) || [null, 'desconhecido'])[1];
    return `${find(browsers)} no ${find(systems)}`;
}

function formatDateTime(value, withTime) {
    if (!value) {
        return '—';
    }
    const options = withTime
        ? { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'long', year: 'numeric' };
    return new Date(value).toLocaleString('pt-BR', options);
}

// Utilitários ----------------------------------------------------------------

function logout() {
    firebase.auth().signOut().then(() => {
        window.location.href = '../../index.html';
    });
}

function getAuthErrorMessage(error, wrongPasswordMessage = 'Senha incorreta.') {
    switch (error.code) {
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
        case 'auth/invalid-login-credentials':
            return wrongPasswordMessage;
        case 'auth/too-many-requests':
            return 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.';
        case 'auth/weak-password':
            return 'Essa senha é fraca. Use pelo menos 6 caracteres.';
        case 'auth/email-already-in-use':
            return 'Esse e-mail já está em uso por outra conta.';
        case 'auth/invalid-email':
            return 'Esse e-mail não é válido.';
        case 'auth/requires-recent-login':
            lastReauthAt = 0;
            return 'Por segurança, confirme sua senha de novo e repita a ação.';
        case 'auth/network-request-failed':
            return 'Sem conexão. Verifique a internet e tente de novo.';
        default:
            return error.message || 'Algo deu errado. Tente novamente.';
    }
}

let toastTimer = null;

function showToast(message, isError = false) {
    const toast = el('toast');
    toast.textContent = message;
    toast.classList.toggle('error-toast', isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function el(id) {
    return document.getElementById(id);
}
