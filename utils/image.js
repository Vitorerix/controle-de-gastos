const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

// Recorta a imagem no centro em um quadrado pequeno, para caber no Firestore sem pesar
function resizeImage(file, size) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            const side = Math.min(image.width, image.height);
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            canvas.getContext('2d').drawImage(
                image,
                (image.width - side) / 2, (image.height - side) / 2, side, side,
                0, 0, size, size
            );
            URL.revokeObjectURL(url);
            resolve(file.type === 'image/jpeg'
                ? canvas.toDataURL('image/jpeg', 0.85)
                : canvas.toDataURL('image/png'));
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject();
        };
        image.src = url;
    });
}

// Comprime uma foto mantendo a proporção (para comprovantes, que precisam continuar legíveis).
// O Firestore aceita até 1 MB por documento, então reduz a qualidade até caber em maxBytes.
function compressImage(file, maxSide, maxBytes) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            const context = canvas.getContext('2d');
            // Fundo branco: PNG com transparência ficaria preto em JPEG
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);

            for (const quality of [0.75, 0.6, 0.45, 0.3]) {
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                if (dataUrl.length <= maxBytes) {
                    return resolve(dataUrl);
                }
            }
            reject(new Error('too-big'));
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('unreadable'));
        };
        image.src = url;
    });
}
