function onChangeName() {
    form.nameRequiredError().style.display = form.name().value.trim() ? "none" : "block";
    toggleRegisterButtonDisable();
}

function onChangeEmail() {
    const email = form.email().value;
    form.emailRequiredError().style.display = email ? "none" : "block";
    form.emailInvalidError().style.display = !email || validateEmail(email) ? "none" : "block";
    toggleRegisterButtonDisable();
}

function onChangePassword() {
    const password = form.password().value;
    form.passwordRequiredError().style.display = password ? "none" : "block";
    form.passwordMinLengthError().style.display = !password || password.length >= 6 ? "none" : "block";
    validatePasswordsMatch();
    toggleRegisterButtonDisable();
}

function onChangeConfirmPassword() {
    validatePasswordsMatch();
    toggleRegisterButtonDisable();
}

function validatePasswordsMatch() {
    const confirmPassword = form.confirmPassword().value;
    form.passwordDoesntMatchError().style.display =
        !confirmPassword || confirmPassword === form.password().value ? "none" : "block";
}

function isFormValid() {
    const email = form.email().value;
    const password = form.password().value;

    return form.name().value.trim() &&
        email && validateEmail(email) &&
        password.length >= 6 &&
        password === form.confirmPassword().value;
}

function toggleRegisterButtonDisable() {
    form.registerButton().disabled = !isFormValid();
}

function register() {
    if (!isFormValid()) {
        return;
    }
    form.registerButton().disabled = true;

    firebase.auth().createUserWithEmailAndPassword(
        form.email().value, form.password().value
    ).then(response => {
        return response.user.updateProfile({ displayName: form.name().value.trim() });
    }).then(() => {
        window.location.href = "../home/home.html";
    }).catch(error => {
        toggleRegisterButtonDisable();
        alert(getErrorMessage(error));
    });
}

function getErrorMessage(error) {
    if (error.code === "auth/email-already-in-use") {
        return "Este e-mail já está cadastrado";
    }
    if (error.code === "auth/weak-password") {
        return "Senha muito fraca";
    }
    if (error.code === "auth/invalid-email") {
        return "E-mail inválido";
    }
    return error.message;
}

function goToLogin() {
    window.location.href = "../../index.html";
}

const form = {
    name: () => document.getElementById('name'),
    email: () => document.getElementById('email'),
    password: () => document.getElementById('password'),
    confirmPassword: () => document.getElementById('confirm-password'),
    registerButton: () => document.getElementById('register-button'),
    nameRequiredError: () => document.getElementById('name-required-error'),
    emailRequiredError: () => document.getElementById('email-required-error'),
    emailInvalidError: () => document.getElementById('email-invalid-error'),
    passwordRequiredError: () => document.getElementById('password-required-error'),
    passwordMinLengthError: () => document.getElementById('password-min-length-error'),
    passwordDoesntMatchError: () => document.getElementById('password-doesnt-match-error')
}
