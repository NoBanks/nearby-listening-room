import { CloudHost } from './cloud-host.js';
import type { HostOutput, RadioHost } from './host.js';
import { ScriptedHost } from './scripted-host.js';

export const hostEndpoint = import.meta.env.VITE_HOST_ENDPOINT as string | undefined;

/** The cloud agent when an endpoint is configured, the local scripted host otherwise. */
export function createHost(output: HostOutput): RadioHost {
  return hostEndpoint ? new CloudHost(hostEndpoint, output) : new ScriptedHost(output);
}
