type InertDecorator = (...args: readonly unknown[]) => undefined;

const inertDecorator: InertDecorator = () => undefined;

export function Config(): InertDecorator {
  return inertDecorator;
}

export function Default(_value: unknown): InertDecorator {
  return inertDecorator;
}

export function Env(_name: string): InertDecorator {
  return inertDecorator;
}

export function Ignore(): InertDecorator {
  return inertDecorator;
}

export function Key(_name: string): InertDecorator {
  return inertDecorator;
}

export function Secret(): InertDecorator {
  return inertDecorator;
}
