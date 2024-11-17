let subscriber = null;
const subscriptions = new WeakMap();

export function signal(initialValue) {
  const subscribers = new Set();
  let value = initialValue;

  return {
    get value() {
      if (subscriber) {
        subscribers.add(subscriber);
      }
      return value;
    },
    set value(newValue) {
      if (value === newValue) return;
      value = newValue;
      subscribers.forEach(fn => fn());
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    }
  };
}

export function effect(fn) {
  const execute = () => {
    subscriber = fn;
    fn();
    subscriber = null;
  };
  execute();
  return () => {
    subscriptions.get(fn)?.forEach(unsubscribe => unsubscribe());
    subscriptions.delete(fn);
  };
}

export function derived(deps, fn) {
  const signal = createSignal();
  effect(() => {
    signal.value = fn(deps.map(dep => dep.value));
  });
  return signal;
}

// Nuovo: batch updates
export function batch(fn) {
  const updates = new Set();
  try {
    fn();
  } finally {
    updates.forEach(update => update());
  }
}

// Nuovo: memoized value
export function memo(deps, fn) {
  const signal = createSignal();
  let lastDeps = [];
  
  effect(() => {
    const newDeps = deps.map(dep => dep.value);
    if (depsChanged(lastDeps, newDeps)) {
      signal.value = fn(...newDeps);
      lastDeps = newDeps;
    }
  });
  
  return signal;
}

function createSignal(initialValue) {
  return signal(initialValue);
}

function depsChanged(oldDeps, newDeps) {
  if (oldDeps.length !== newDeps.length) return true;
  return oldDeps.some((dep, i) => dep !== newDeps[i]);
} 