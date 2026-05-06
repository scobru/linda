export const platform = () => 'browser';
export const arch = () => 'wasm';
export const type = () => 'Browser';
export const release = () => '1.0.0';
export const uptime = () => 0;
export const loadavg = () => [0, 0, 0];
export const totalmem = () => 0;
export const freemem = () => 0;
export const cpus = () => [];
export const networkInterfaces = () => ({});
export const homedir = () => '/';
export const tmpdir = () => '/tmp';
export const userInfo = () => ({ username: 'browser' });

export default {
  platform,
  arch,
  type,
  release,
  uptime,
  loadavg,
  totalmem,
  freemem,
  cpus,
  networkInterfaces,
  homedir,
  tmpdir,
  userInfo,
};
