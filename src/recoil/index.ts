import { useCallback, useEffect, useState } from "react";

type Disconnecter = {
  disconnect: () => void;
};

type Listener<T> = {
  callback: (value: T) => void;
};

class Stateful<T> {
  /**
   * To know who is listening to the state I use a Set of callbacks.
   */
  private listeners = new Set<Listener<T>>();

  constructor(protected value: T) {} // changed private to protected for extended class accessing

  protected _update(value: T) {
    this.value = value;
    this.emit();
  }

  snapshot(): T {
    return this.value;
  }

  /**
   * This method loops through each of the listeners and gives them the current value in the state.
   */
  emit() {
    for (const listener of this.listeners) {
      listener.callback(this.snapshot());
    }
  }

  /**
   * Adding a listener
   * @param callback
   */
  subscribe(listener: Listener<T>): Disconnecter {
    this.listeners.add(listener);
    return {
      disconnect: () => {
        this.listeners.delete(listener);
      }
    };
  }
}

class Atom<T> extends Stateful<T> {
  update(value: T) {
    super._update(value);
  }
}

/**
 * 在副作用中进行订阅、传入回调
 * @param value
 */
export function useCoiledValue<T>(value: Stateful<T>): T {
  // re-render hack code
  const [, setState] = useState({});
  useEffect(() => {
    const { disconnect } = value.subscribe({
      callback: () => setState({})
    }); // TODO 为什么不使用这里的回调中的参数呢
    return () => disconnect();
  }, [value]);
  return value.snapshot();
}

export function useCoiledState<T>(atom: Atom<T>): [T, (value: T) => void] {
  const value = useCoiledValue(atom);
  return [value, useCallback((value) => atom.update(value), [atom])];
}

// This return value is what becomes the internal state of the selector.
type SelectorGenerator<T> = (context: GeneratorContext) => T;

type GeneratorContext = {
  get: <V>(dependency: Stateful<V>) => V;
};

export class Selector<T> extends Stateful<T> {
  private registeredDeps = new Set<Stateful<any>>();

  private getDep<V>(dep: Stateful<V>): V {
    if (!this.registeredDeps.has(dep)) {
      dep.subscribe({ callback: () => this.updateSelector() });
      this.registeredDeps.add(dep);
    }
    return dep.snapshot();
  }

  private updateSelector() {
    const context: GeneratorContext = {
      get: (dep) => this.getDep(dep)
    };
    this._update(this.generate(context));
  }

  constructor(private readonly generate: SelectorGenerator<T>) {
    super(undefined);
    const context: GeneratorContext = {
      get: (dep) => this.getDep(dep)
    };
    this.value = generate(context);
  }
}

export function atom<V>(value: { key: String; default: V }): Atom<V> {
  return new Atom(value.default);
}

export function selector<V>(value: {
  key: string;
  get: SelectorGenerator<V>;
}): Selector<V> {
  return new Selector(value.get);
}
