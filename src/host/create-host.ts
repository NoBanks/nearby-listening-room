import { CloudHost } from './cloud-host.js';
import type { HostOutput, RadioHost } from './host.js';
import { ScriptedHost } from './scripted-host.js';

/** The cloud host when an endpoint is configured, the local scripted host otherwise. */
export function createHost(output: HostOutput): RadioHost {
  const endpoint = import.meta.env.VITE_HOST_ENDPOINT as string | undefined;
  return endpoint ? new CloudHost(endpoint, output) : new ScriptedHost(output);
}
