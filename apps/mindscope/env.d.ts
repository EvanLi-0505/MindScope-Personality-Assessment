/// <reference types="vite/client" />

declare const __BUILD_TARGET__: 'web' | 'desktop';

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
