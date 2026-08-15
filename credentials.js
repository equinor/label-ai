// Copyright 2026 Matt Hall, Equinor // MIT license
//
// Adds C2PA "content credentials" to an image entirely in the browser, using
// @contentauth/c2pa-web (WASM). Signing uses a bundled SELF-SIGNED developer
// certificate (certs/cert.pem + certs/key.pem): the signature is cryptographically
// valid but the signer is NOT on the C2PA trust list, so verifiers correctly show it
// as an "unknown / untrusted source". The key is public by design and vouches for
// nothing.
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

// Lazily load the c2pa-web SDK on first use (enough for reading/verifying).
async function _initSdk() {
  if (_signSdk) return;
  const { createC2pa } = await import(C2PA_WEB_URL);
  _signSdk = await createC2pa();
}

// Additionally load the signing material (cert + key). Only needed for signing.
async function _initSigner() {
  await _initSdk();
  if (_signerKey) return;
  const [certPem, keyPem] = await Promise.all([
    fetch('certs/cert.pem').then(r => r.text()),
    fetch('certs/key.pem').then(r => r.text()),
  ]);
  _certDer = _pemToDer(certPem);
  _signerKey = await crypto.subtle.importKey(
    'pkcs8', _pemToDer(keyPem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

const DEFAULT_DIGITAL_SOURCE_TYPE = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';

// Sign an image blob, embedding a C2PA manifest. `info` = { title?, attribution?, format?,
// digitalSourceType? }. If the asset ALREADY has a manifest, it is preserved as a parent
// ingredient (a provenance chain, "update" intent) instead of being replaced; otherwise a new
// "c2pa.created" manifest is written. Returns a new Blob of the same format.
async function addContentCredentials(imageBlob, info = {}) {
  await _initSigner();
  const format = info.format || imageBlob.type || 'image/png';

  // Detect an existing manifest on the exact bytes we're about to sign (parse only, no verify).
  let hasParent = false;
  try {
    const existing = await _signSdk.reader.fromBlob(format, imageBlob, {
      verify: { verifyTrust: false, verifyAfterReading: false },
    });
    if (existing) { hasParent = true; await existing.free(); }
  } catch (_) { /* unreadable → treat as no existing manifest */ }

  const builder = await _signSdk.builder.fromDefinition({
    claim_generator_info: [{ name: 'Label AI', version: '1.0.0' }],
    title: info.title || 'Signed by Label AI',
    format,
  });

  if (hasParent) {
    // Adding credentials to an existing asset without altering its pixels = "update" intent.
    // The builder retains the incoming manifest as the parent and auto-adds a c2pa.opened action.
    await builder.setIntent('update');
    await builder.addIngredientFromBlob(
      { title: 'Original image', relationship: 'parentOf', label: 'parent' },
      format,
      imageBlob,
    );
  } else {
    // New creation: C2PA 2.x requires a digitalSourceType on c2pa.created. Defaults to
    // AI-generated (pairs with an AI attribution statement); override via info.digitalSourceType.
    await builder.addAction({
      action: 'c2pa.created',
      softwareAgent: { name: 'Label AI', version: '1.0.0' },
      digitalSourceType: info.digitalSourceType || DEFAULT_DIGITAL_SOURCE_TYPE,
    });
  }

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

// C2PA trust list — CORS-open, fetched once and cached. When available, verification can
// distinguish a recognised ("Trusted") signer from an unrecognised but otherwise-valid one.
// Falls back to integrity-only if the list can't be fetched.
//   - trustAnchors: the CURRENT official C2PA trust list (the CAI interim list was frozen
//     2026-01-01, so it misses newer signers like Google — use conformance-public instead).
//   - trustConfig: the CAI store's allowed-EKU config (small, stable).
const TRUST_ANCHORS_URL = 'https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.pem';
const TRUST_CONFIG_URL = 'https://verify.contentauthenticity.org/trust/store.cfg';
let _trust = null;
let _trustTried = false;
async function _getTrust() {
  if (_trustTried) return _trust;
  _trustTried = true;
  try {
    const [trustAnchors, trustConfig] = await Promise.all([
      fetch(TRUST_ANCHORS_URL).then(r => r.text()),
      fetch(TRUST_CONFIG_URL).then(r => r.text()),
    ]);
    _trust = { trustAnchors, trustConfig };
  } catch (e) {
    console.warn('C2PA trust list unavailable — falling back to integrity-only verify:', e);
    _trust = null;
  }
  return _trust;
}

// Verify an image's Content Credentials. When the trust list is available this reports trust
// too; otherwise it is integrity-only. Returns:
//   { hasCredentials, validationState, trustChecked, successes, failures, manifest, issuer, title }
//   - hasCredentials:false  -> no C2PA manifest present
//   - validationState       -> "Trusted" | "Valid" | "Invalid"
// A tampered asset comes back as validationState:"Invalid" (it does not throw).
async function verifyContentCredentials(blob) {
  await _initSdk();
  const format = blob.type || 'image/png';
  const trust = await _getTrust();
  const withTrust = trust
    ? { trust, verify: { verifyTrust: true, verifyAfterReading: true } }
    : { verify: { verifyTrust: false, verifyAfterReading: true } };

  let reader;
  try {
    reader = await _signSdk.reader.fromBlob(format, blob, withTrust);
  } catch (e) {
    // If a trust-enabled read failed, retry integrity-only before giving up.
    if (trust) {
      try {
        reader = await _signSdk.reader.fromBlob(format, blob, { verify: { verifyTrust: false, verifyAfterReading: true } });
      } catch (e2) {
        return { hasCredentials: true, validationState: 'Invalid', trustChecked: false, error: e2?.message || String(e2) };
      }
      if (!reader) return { hasCredentials: false };
      return await _readerVerdict(reader, false);
    }
    return { hasCredentials: true, validationState: 'Invalid', trustChecked: false, error: e?.message || String(e) };
  }
  if (!reader) return { hasCredentials: false };
  return await _readerVerdict(reader, !!trust);
}

async function _readerVerdict(reader, trustChecked) {
  const store = await reader.manifestStore();
  const manifest = await reader.activeManifest();
  await reader.free();
  const results = store?.validation_results?.activeManifest;
  const failures = results?.failure || (store?.validation_status || []).filter(s => s && s.success === false) || [];
  const successes = results?.success || [];
  return {
    hasCredentials: true,
    validationState: store?.validation_state || null,
    trustChecked,
    successes,
    failures,
    manifest,
    issuer: manifest?.signature_info?.common_name || manifest?.signature_info?.issuer || null,
    title: manifest?.title || null,
  };
}

// Expose as globals for the page scripts (classic-script pattern, like toast.js).
window.addContentCredentials = addContentCredentials;
window.verifyContentCredentials = verifyContentCredentials;
