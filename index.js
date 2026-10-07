function onChangeEmail() {
    toggleButtonsDisable();
    toggleEmailErrors();
}

function onChangePassword() {
    togglePasswordErrors();
    toggleButtonsDisable();
}

// Quem já está logado vai direto para a home
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        window.location.href = "pages/home/home.html";
    }
});

function login() {
    if (!isEmailValid() || !isPasswordValid()) {
        return;
    }
    form.loginButton().disabled = true;

    // "Lembrar de mim" desmarcado: a sessão acaba quando o navegador fecha
    const persistence = form.rememberMe().checked
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;

    firebase.auth().setPersistence(persistence).then(() =>
        firebase.auth().signInWithEmailAndPassword(form.email().value, form.password().value)
    ).then(() => {
        window.location.href = "pages/home/home.html";
    }).catch(error => {
        form.loginButton().disabled = false;
        alert(getErrorMessage(error));
    });
}

function recoverPassword() {
    if (!isEmailValid()) {
        toggleEmailErrors();
        form.email().focus();
        alert("Digite seu e-mail no campo acima para receber o link de nova senha.");
        return;
    }
    form.recoverPassword().disabled = true;
    firebase.auth().useDeviceLanguage();

    firebase.auth().sendPasswordResetEmail(form.email().value).then(() => {
        alert("Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também a caixa de spam.");
    }).catch(error => {
        alert(getErrorMessage(error));
    }).finally(() => {
        form.recoverPassword().disabled = false;
    });
}

function getErrorMessage(error) {
    if (error.code === "auth/invalid-credential" ||
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password") {
        return "E-mail ou senha incorretos";
    }
    if (error.code === "auth/too-many-requests") {
        return "Muitas tentativas. Tente novamente mais tarde";
    }
    if (error.code === "auth/invalid-email") {
        return "E-mail inválido";
    }
    return error.message;
}

function register() {
    window.location.href = "pages/register/register.html"
}

function isEmailValid() {
        const email = form.email().value;
        if (!email) {
            return false;
        }
        return validateEmail(email);
}

function isPasswordValid() {
        const password = form.password().value;
        if (!password) {
            return false;
        }
        return true;
}

function toggleEmailErrors() {
    const email = form.email().value;
    form.emailRequiredError().style.display = email ? "none" : "block";

    form.emailInvalidError().style.display = !email || validateEmail(email) ? "none" : "block";
}

function togglePasswordErrors() {
    const password = form.password().value;
    form.passwordInvalidError().style.display = password ? "none" : "block";

}

function toggleButtonsDisable() {
    form.loginButton().disabled = !isEmailValid() || !isPasswordValid();
}


const form = {
    email: () => document.getElementById('email'),
    password: () => document.getElementById('password'),
    rememberMe: () => document.getElementById('remember-me'),
    loginButton: () => document.getElementById('login-button'),
    recoverPassword: () => document.getElementById('recovery-pww-button'),
    emailInvalidError: () => document.getElementById('email-invalid-error'),
    emailRequiredError: () => document.getElementById('email-required-error'),
    passwordInvalidError: () => document.getElementById('required-password')
}
