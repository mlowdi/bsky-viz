/**
 * Handle resolution: if input doesn't start with 'did:', resolve via
 * GET https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle={handle}
 */
export async function resolveDidOrHandle(input: string): Promise<string> {
  if (input.startsWith('did:')) {
    return input;
  }

  const url = `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(input)}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to resolve handle ${input}: ${resp.statusText}`);
  }

  const data = (await resp.json()) as { did: string };
  return data.did;
}

/**
 * PDS discovery: given a DID, fetch the DID document:
 * - did:plc:* → GET https://plc.directory/{did}
 * - did:web:* → GET https://{domain}/.well-known/did.json
 * Extract the PDS endpoint from service array: find entry with id '#atproto_pds', return serviceEndpoint
 */
export async function discoverPds(did: string): Promise<string> {
  let url: string;
  if (did.startsWith('did:plc:')) {
    url = `https://plc.directory/${did}`;
  } else if (did.startsWith('did:web:')) {
    const domain = did.slice('did:web:'.length);
    url = `https://${domain}/.well-known/did.json`;
  } else {
    throw new Error(`Unsupported DID method: ${did}`);
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch DID document for ${did}: ${resp.statusText}`);
  }

  const doc = await resp.json();
  const services = doc.service || [];
  const pdsService = services.find((s: any) => s.id === '#atproto_pds' || s.id === `${did}#atproto_pds`);
  
  if (!pdsService || !pdsService.serviceEndpoint) {
    throw new Error(`Could not find PDS endpoint in DID document for ${did}`);
  }

  return pdsService.serviceEndpoint;
}

/**
 * CAR download: GET https://{pds}/xrpc/com.atproto.sync.getRepo?did={did}
 * Returns raw bytes (application/vnd.ipld.car)
 */
export async function fetchCarBytes(pdsUrl: string, did: string): Promise<Uint8Array> {
  const url = new URL('/xrpc/com.atproto.sync.getRepo', pdsUrl);
  url.searchParams.set('did', did);

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Failed to fetch CAR for ${did}: ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Convenience: resolves + discovers + fetches
 */
export async function fetchRepo(didOrHandle: string): Promise<{ did: string; carBytes: Uint8Array }> {
  const did = await resolveDidOrHandle(didOrHandle);
  const pdsUrl = await discoverPds(did);
  const carBytes = await fetchCarBytes(pdsUrl, did);
  return { did, carBytes };
}
