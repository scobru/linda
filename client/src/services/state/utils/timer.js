export const timer = {
  setTimeout: (callback, delay) => global.setTimeout(callback, delay),
  clearTimeout: (id) => global.clearTimeout(id),
};
