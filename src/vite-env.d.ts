/// <reference types="vite/client" />

// Some setups in this repo don't automatically pick up Vite's `ImportMetaEnv` typing.
// Declare the minimal shape we need so `import.meta.env.DEV` type-checks reliably.
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


