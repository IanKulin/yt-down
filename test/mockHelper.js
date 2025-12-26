// Mock helper for Deno tests - provides Node.js-like mock.fn() functionality

const allMocks = new Set();

export function createMockFn(impl) {
  const calls = [];
  let implementation = impl;
  const onceImplementations = [];

  const fn = (...args) => {
    calls.push({ arguments: args });

    // Check if there's a one-time implementation queued
    if (onceImplementations.length > 0) {
      const onceImpl = onceImplementations.shift();
      return onceImpl ? onceImpl(...args) : undefined;
    }

    return implementation ? implementation(...args) : undefined;
  };

  fn.mock = {
    calls,
    callCount: () => calls.length,
    mockImplementation: (newImpl) => {
      implementation = newImpl;
      return fn;
    },
    mockImplementationOnce: (onceImpl) => {
      onceImplementations.push(onceImpl);
      return fn;
    },
  };

  allMocks.add(fn);
  return fn;
}

export function createMethodSpy(object, methodName, impl) {
  const originalMethod = object[methodName];
  const calls = [];
  let implementation = impl || originalMethod;
  const onceImplementations = [];

  const spyFn = (...args) => {
    calls.push({ arguments: args });

    // Check if there's a one-time implementation queued
    if (onceImplementations.length > 0) {
      const onceImpl = onceImplementations.shift();
      return onceImpl ? onceImpl.call(object, ...args) : undefined;
    }

    return implementation ? implementation.call(object, ...args) : undefined;
  };

  spyFn.mock = {
    calls,
    callCount: () => calls.length,
    mockImplementation: (newImpl) => {
      implementation = newImpl;
      return spyFn;
    },
    mockImplementationOnce: (onceImpl) => {
      onceImplementations.push(onceImpl);
      return spyFn;
    },
  };

  object[methodName] = spyFn;
  spyFn.restore = () => {
    object[methodName] = originalMethod;
  };

  allMocks.add(spyFn);
  return spyFn;
}

export function resetAllMocks() {
  allMocks.forEach((mockFn) => {
    if (mockFn.mock && mockFn.mock.calls) {
      mockFn.mock.calls.length = 0;
    }
    if (mockFn.restore) {
      mockFn.restore();
    }
  });
  allMocks.clear();
}

export const mock = {
  fn: createMockFn,
  method: createMethodSpy,
  reset: resetAllMocks,
};
