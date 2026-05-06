export const open = () => {};
export const readFile = () => {};
export const readFileSync = () => "";
export const writeFile = () => {};
export const writeFileSync = () => {};
export const mkdir = () => {};
export const mkdirSync = () => {};
export const stat = () => {};
export const statSync = () => ({});
export const unlink = () => {};
export const unlinkSync = () => {};
export const readdir = () => [];
export const readdirSync = () => [];
export const access = () => {};
export const accessSync = () => {};
export const existsSync = () => false;
export const constants = {};

const fs = {
  open,
  readFile,
  readFileSync,
  writeFile,
  writeFileSync,
  mkdir,
  mkdirSync,
  stat,
  statSync,
  unlink,
  unlinkSync,
  readdir,
  readdirSync,
  access,
  accessSync,
  existsSync,
  constants,
};

export default fs;
