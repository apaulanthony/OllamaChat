const TEXT_MIME_TYPES = new Set([
    'text/plain',
    'text/markdown',
    'text/html',
    'application/json',
    'application/javascript',
    'application/xml',
    'application/x-python',
    'text/csv'
]);

const TEXT_EXTENSIONS = ['js', 'py', 'md', 'json', 'sql', 'cpp'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];

export const isTextFile = file => {
    if (file.type.startsWith('text/')) return true;
    if (TEXT_MIME_TYPES.has(file.type)) return true;

    const extension = file.name.split('.').pop().toLowerCase();
    return TEXT_EXTENSIONS.includes(extension);
};

export const isImageFile = file => {
    if (file.type.startsWith('image/')) return true;

    const fileExtension = file.name.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.includes(fileExtension);
};

export const isValidFile = file => isTextFile(file) || isImageFile(file);