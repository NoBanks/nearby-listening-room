/// <reference types="vite/client" />
/// <reference types="@iwsdk/vite-plugin-dev/client" />

interface ImportMetaEnv {
  /** Cloud host proxy URL. Unset: the local scripted host. See src/host/cloud-host.ts. */
  readonly VITE_HOST_ENDPOINT?: string;
  /** "1" to speak host lines with the browser voice by default. */
  readonly VITE_HOST_VOICE?: string;
}
