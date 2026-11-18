import type { IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { TLSSocket } from 'node:tls';
import { parseTrustedProxies } from './environment';

let proxySource: string | undefined;
let proxyList = new BlockList();

export function isSecureWebSocketRequest(request: IncomingMessage): boolean {
  if (request.socket instanceof TLSSocket && request.socket.encrypted)
    return true;
  if (request.headers['x-forwarded-proto'] !== 'https') return false;
  const source = process.env.TRUST_PROXY;
  if (source !== proxySource) {
    const nextList = new BlockList();
    for (const proxy of parseTrustedProxies(source)) {
      const [address, prefix] = proxy.split('/');
      const family = isIP(address) === 4 ? 'ipv4' : 'ipv6';
      if (prefix === undefined) nextList.addAddress(address, family);
      else nextList.addSubnet(address, Number(prefix), family);
    }
    proxyList = nextList;
    proxySource = source;
  }
  const address = request.socket.remoteAddress;
  if (!address) return false;
  const family = isIP(address);
  return (
    family !== 0 && proxyList.check(address, family === 4 ? 'ipv4' : 'ipv6')
  );
}

export function isAllowedBrowserOrigin(
  origin: string | undefined,
  frontendUrl: string,
  nodeEnv: string | undefined,
): boolean {
  if (origin === undefined || origin === frontendUrl) return true;
  if (nodeEnv === 'production') return false;
  const parsed = URL.parse(origin);
  return (
    !!parsed &&
    parsed.origin === origin &&
    ['http:', 'https:'].includes(parsed.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  );
}

export function httpLoggerOptions(nodeEnv: string | undefined) {
  return {
    level: nodeEnv === 'production' ? 'info' : 'debug',
    serializers: {
      req: (request: { id?: unknown; method?: string; url?: string }) => ({
        id: request.id,
        method: request.method,
        url: request.url?.split(/[?#]/, 1)[0],
      }),
      res: (response: { statusCode: number }) => ({
        statusCode: response.statusCode,
      }),
      err: (error: { type?: string }) => ({ type: error.type }),
    },
  };
}
