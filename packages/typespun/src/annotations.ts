type InertDecorator = (...args: readonly unknown[]) => undefined;

const inertDecorator: InertDecorator = () => {};

export const Config = (): InertDecorator => inertDecorator;

export const Default = (_value: unknown): InertDecorator => inertDecorator;

export const Env = (_name: string): InertDecorator => inertDecorator;

export const Ignore = (): InertDecorator => inertDecorator;

export const Key = (_name: string): InertDecorator => inertDecorator;

export const Secret = (): InertDecorator => inertDecorator;
