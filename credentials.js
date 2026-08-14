// Copyright 2026 Matt Hall, Equinor // MIT license
//
// Adds C2PA "content credentials" to an image entirely in the browser, using
// @contentauth/c2pa-web (WASM). Signing uses a bundled SELF-SIGNED developer
// certificate (certs/cert.pem + certs/key.pem): the signature is cryptographically
// valid but the signer is NOT on the C2PA trust list, so verifiers correctly show it
// as an "unknown / untrusted source". The key is public by design and vouches for
// nothing — see C2PA-UPSTREAM-NOTES.md for the details behind this implementation.
//
// c2pa-web uses "direct COSE handling": the sign() callback is handed the claim bytes
// and must return a complete COSE_Sign1 (with the signing cert as x5chain). We build
// that COSE_Sign1 here with WebCrypto (ES256).

const C2PA_WEB_URL = 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.13.4/dist/inline.js/+esm';

let _signSdk = null;   // c2pa-web SDK instance
let _signerKey = null; // CryptoKey (ECDSA P-256 private key)
let _certDer = null;   // Uint8Array of the signing cert (DER)

function _pemToDer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, '')
                 .replace(/-----END [^-]+-----/g, '')
                 .replace(/\s+/g, '');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ---- Minimal CBOR / COSE_Sign1 encoder (only the shapes C2PA needs) ----
function _cborHead(major, n) {
  if (n < 24) return [major | n];
  if (n < 256) return [major | 24, n];
  if (n < 65536) return [major | 25, (n >> 8) & 255, n & 255];
  return [major | 26, (n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const _cborBstr = u8 => [..._cborHead(0x40, u8.length), ...u8];
const _cborTstr = s => { const b = new TextEncoder().encode(s); return [..._cborHead(0x60, b.length), ...b]; };

// Build a C2PA COSE_Sign1 (tag 18, detached payload) over the claim bytes, ES256,
// with the signing cert embedded as x5chain (protected header label 33).
async function _buildCoseSign1(claimBytes) {
  // protected header = { 1: -7 (ES256), 33: <cert DER bstr> }
  const protectedMap = [0xA2, 0x01, ..._cborHead(0x20, 6) /* -7 */, ..._cborHead(0x00, 33), ..._cborBstr(_certDer)];
  const protectedBstr = _cborBstr(Uint8Array.from(protectedMap));
  const sigStructure = Uint8Array.from([
    0x84, ..._cborTstr('Signature1'), ...protectedBstr, ..._cborBstr(new Uint8Array(0)), ..._cborBstr(claimBytes),
  ]);
  const rawSig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, _signerKey, sigStructure));
  // COSE_Sign1_Tagged = 18([ protected, {}, nil, signature ])
  return Uint8Array.from([0xD2, 0x84, ...protectedBstr, 0xA0, 0xF6, ..._cborBstr(rawSig)]);
}

// Lazily load the SDK + signing material on first use.
async function _initC2paSign() {
  if (_signSdk) return;
  const { createC2pa } = await import(C2PA_WEB_URL);
  _signSdk = await createC2pa();
  const [certPem, keyPem] = await Promise.all([
    fetch('certs/cert.pem').then(r => r.text()),
    fetch('certs/key.pem').then(r => r.text()),
  ]);
  _certDer = _pemToDer(certPem);
  _signerKey = await crypto.subtle.importKey(
    'pkcs8', _pemToDer(keyPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// Sign an image blob, embedding a C2PA manifest. `info` = { title?, attribution?, format? }.
// `format` is the image MIME type (defaults to the blob's type, or image/png). Returns a new
// Blob of the same format with the manifest embedded.
async function addContentCredentials(imageBlob, info = {}) {
  await _initC2paSign();
  const format = info.format || imageBlob.type || 'image/png';
  const builder = await _signSdk.builder.fromDefinition({
    claim_generator_info: [{ name: 'Label AI', version: '1.0.0' }],
    title: info.title || 'Signed by Label AI',
    format,
  });
  await builder.addAction({
    action: 'c2pa.created',
    softwareAgent: { name: 'Label AI', version: '1.0.0' },
  });
  if (info.attribution) {
    await builder.addAssertion('com.equinor.label-ai', { attribution: info.attribution });
  }

  const signer = {
    alg: 'es256',
    // Detached payload => COSE length is constant; return it exactly so c2pa reserves the
    // precise manifest size (otherwise the data-hash exclusion range overruns the file).
    reserveSize: async () => (await _buildCoseSign1(new Uint8Array(0))).length,
    sign: async (claimBytes) => _buildCoseSign1(claimBytes),
  };
  const signed = await builder.sign(signer, format, imageBlob);
  await builder.free();
  return new Blob([signed], { type: format });
}

// Read back a signed blob's active manifest (trust verification off, so a self-signed
// signer doesn't throw). Returns the active manifest object, or null if none.
async function readContentCredentials(blob) {
  await _initC2paSign();
  const format = blob.type || 'image/png';
  const reader = await _signSdk.reader.fromBlob(format, blob, { verify: { verifyTrust: false } });
  if (!reader) return null;
  const manifest = await reader.activeManifest();
  await reader.free();
  return manifest;
}

// Expose as globals for the page scripts (classic-script pattern, like toast.js).
window.addContentCredentials = addContentCredentials;
window.readContentCredentials = readContentCredentials;
