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
