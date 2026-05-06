export const fileURLToPath = (url) => {
  try {
    if (!url) return '';
    if (typeof url === 'string') {
      if (url.startsWith('file://')) {
        // Basic conversion for the mock
        let p = url.replace(/^file:\/\/\//, '').replace(/^file:\/\//, '');
        // On windows, might need to handle drive letters
        return p;
      }
      return url;
    }
    if (typeof url === 'object' && url.href) {
      if (url.protocol === 'file:') {
        return url.pathname || '';
      }
      return url.pathname || url.href || '';
    }
    return String(url);
  } catch (e) {
    return '';
  }
};

export const pathToFileURL = (path) => {
  try {
    return new URL(`file://${path}`);
  } catch (e) {
    return { href: '' };
  }
};

export default {
  fileURLToPath,
  pathToFileURL,
};
