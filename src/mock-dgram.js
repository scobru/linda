export const createSocket = () => {
  return {
    bind: (opt, cb) => { if (cb) setTimeout(cb, 0); },
    on: () => {},
    send: () => {},
    close: () => {},
    setBroadcast: () => {},
    setMulticastTTL: () => {},
    addMembership: () => {},
    address: () => ({ address: '0.0.0.0', port: 0 }),
  };
};

export default {
  createSocket,
};
