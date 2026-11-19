import type { MarketoApi } from '@shared/types';

declare global {
  interface Window {
    marketo: MarketoApi;
  }
}

export {};
