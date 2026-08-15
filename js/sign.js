// Copyright 2026 Matt Hall, Equinor // MIT license
$('.collapse').collapse();

const imageFrame = document.getElementById('imageFrame');
const placeholderText = document.getElementById('placeholderText');
const sourcePreview = document.getElementById('sourcePreview');
const previewWrap = document.getElementById('previewWrap');
const attributionInput = document.getElementById('attributionInput');
const signButton = document.getElementById('signButton');
const signStatus = document.getElementById('signStatus');
const existingCreds = document.getElementById('existingCreds');
const credBadge = document.getElementById('credBadge');
const credPanel = document.getElementById('credPanel');
const sourceTypeSelect = document.getElementById('sourceTypeSelect');
const uploadImageLink = document.getElementById('uploadImageLink');

// The image to sign, and its MIME type. We sign the original bytes for JPEG/PNG so their
// format is preserved; anything else is converted to PNG first.
let sourceBlob = null;
let sourceMime = null;

// Convert an arbitrary image blob to a PNG blob via an offscreen canvas.
function toPngBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas conversion failed')), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

function hideExistingCreds() {
  existingCreds.className = 'alert d-none mb-4';
  existingCreds.textContent = '';
  credBadge.className = 'cred-badge d-none';
  credBadge.textContent = '';
  credPanel.classList.add('d-none');
  credPanel.innerHTML = '';
}

// Map a verify result to a verdict: alert card + on-image badge styling/label.
function verdictInfo(v) {
  if (v.validationState === 'Invalid' || v.error) {
    const reason = (v.failures && v.failures[0] && (v.failures[0].explanation || v.failures[0].code)) || v.error;
    return {
      alertClass: 'alert-danger', badgeClass: 'state-invalid', badgeLabel: '⛔ Invalid',
      alertText: '⛔ This image already has Content Credentials, but they are INVALID — it may have been altered since signing.'
        + (reason ? ' (' + reason + ')' : ''),
    };
  }
  if (v.validationState === 'Trusted') {
    return {
      alertClass: 'alert-success', badgeClass: 'state-trusted', badgeLabel: '🛡️ Trusted',
      alertText: '✅ This image has valid Content Credentials from a recognised signer: '
        + (v.issuer ? v.issuer : '') + '.',
    };
  }
  // validationState === "Valid"
  if (v.trustChecked) {
    return {
      alertClass: 'alert-warning', badgeClass: 'state-warning', badgeLabel: '⚠️ Untrusted',
      alertText: '⚠️ This image has valid Content Credentials, but the signer is not on the C2PA trust list: '
        + (v.issuer ? v.issuer : '') + '.',
    };
  }
  // Trust list unavailable (offline / fetch failed): integrity verified, trust not checked.
  return {
    alertClass: 'alert-info', badgeClass: 'state-warning', badgeLabel: '🛡️ Unchecked',
    alertText: 'ℹ️ This image has Content Credentials (integrity verified; trust not checked).'
      + (v.issuer ? ' Signer: ' + v.issuer + '.' : ''),
  };
}

// Build the credential details table (shown as soon as an image with credentials loads).
function buildCredPanel(v) {
  credPanel.innerHTML = '';
  const body = document.createElement('div');
  body.className = 'card-body';
  const h = document.createElement('h5');
  h.className = 'mb-3';
  h.textContent = 'Content Credentials';
  body.appendChild(h);

  const table = document.createElement('table');
  const addRow = (key, val) => {
    if (val == null || val === '') return;
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = key;
    const td = document.createElement('td');
    td.textContent = val;
    tr.appendChild(th);
    tr.appendChild(td);
    table.appendChild(tr);
  };

  const m = v.manifest || {};
  const si = m.signature_info || {};
  const stateText = v.validationState === 'Trusted' ? 'Trusted (recognised signer)'
    : v.validationState === 'Valid' ? (v.trustChecked ? 'Valid — signer not recognised' : 'Valid (integrity only; trust not checked)')
    : 'Invalid';
  addRow('Status', stateText);
  addRow('Title', m.title);
  addRow('Signer', si.common_name || si.issuer);
  addRow('Algorithm', si.alg);
  addRow('Claim generator', (m.claim_generator_info && m.claim_generator_info[0] && m.claim_generator_info[0].name) || m.claim_generator);
  (m.assertions || []).forEach(a => {
    if (!a || !a.label) return;
    if (a.label.startsWith('c2pa.actions')) {
      ((a.data && a.data.actions) || []).forEach(act => {
        const dst = act.digitalSourceType ? act.digitalSourceType.split('/').pop() : '';
        addRow('Action', act.action + (dst ? ' · ' + dst : ''));
      });
    } else if (a.label === 'com.equinor.label-ai') {
      if (a.data && a.data.attribution) addRow('Attribution', a.data.attribution);
    } else {
      addRow('Assertion', a.label);
    }
  });
  (m.ingredients || []).forEach(ing => {
    const rel = ing.relationship ? ' (' + ing.relationship + ')' : '';
    addRow('Ingredient', (ing.title || ing.instance_id || 'ingredient') + rel);
  });
  (v.failures || []).forEach(f => addRow('Issue', (f.code || '') + (f.explanation ? ' — ' + f.explanation : '')));

  body.appendChild(table);
  credPanel.appendChild(body);
}

// Check the loaded image for EXISTING Content Credentials and show the verdict + details.
async function showExistingCreds(blob) {
  if (typeof verifyContentCredentials !== 'function') return;
  try {
    const v = await verifyContentCredentials(blob);
    if (!v.hasCredentials) {
      existingCreds.className = 'alert alert-dark mb-4';
      existingCreds.textContent = 'ℹ️ No existing Content Credentials on this image.';
      credBadge.className = 'cred-badge d-none';
      credPanel.classList.add('d-none');
      credPanel.innerHTML = '';
      return;
    }
    const info = verdictInfo(v);
    existingCreds.className = 'alert mb-4 ' + info.alertClass;
    existingCreds.textContent = info.alertText;
    credBadge.className = 'cred-badge ' + info.badgeClass;
    credBadge.textContent = info.badgeLabel;
    buildCredPanel(v);
    credPanel.classList.remove('d-none'); // show the details table right away
  } catch (err) {
    console.error('Error checking existing credentials:', err);
    hideExistingCreds();
  }
}

// Bring an image into the tool: preview it, show any existing credentials, and enable signing.
async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  signStatus.textContent = '';
  hideExistingCreds();
  try {
    if (file.type === 'image/jpeg' || file.type === 'image/png') {
      sourceBlob = file;
      sourceMime = file.type;
    } else {
      sourceBlob = await toPngBlob(file); // e.g. webp, gif → png
      sourceMime = 'image/png';
    }
  } catch (err) {
    console.error(err);
    signStatus.textContent = '⚠️ Could not read that image: ' + (err?.message || err);
    return;
  }
  placeholderText.classList.add('d-none');
  sourcePreview.src = URL.createObjectURL(sourceBlob);
  previewWrap.classList.remove('d-none');
  signButton.disabled = false;
  showExistingCreds(file); // check the ORIGINAL bytes (conversion to PNG would strip any manifest)
}

// --- Image input: click, drag/drop, paste (mirrors the Images tab) ---
uploadImageLink.addEventListener('click', (event) => {
  event.preventDefault();
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.onchange = (e) => handleFile(e.target.files[0]);
  fileInput.click();
});

imageFrame.addEventListener('dragover', (event) => {
  event.preventDefault();
  imageFrame.classList.add('dragover');
});
imageFrame.addEventListener('dragleave', () => imageFrame.classList.remove('dragover'));
imageFrame.addEventListener('drop', (event) => {
  event.preventDefault();
  imageFrame.classList.remove('dragover');
  handleFile(event.dataTransfer.files[0]);
});

document.addEventListener('paste', (event) => {
  const items = event.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      handleFile(items[i].getAsFile());
      break;
    }
  }
});

// --- Sign and download in one step ---
signButton.addEventListener('click', async () => {
  if (!sourceBlob || typeof addContentCredentials !== 'function') return;
  signButton.disabled = true;
  signButton.textContent = 'Signing…';
  signStatus.textContent = '';
  try {
    const attribution = attributionInput.value.trim();
    const signedBlob = await addContentCredentials(sourceBlob, {
      format: sourceMime,
      attribution: attribution || undefined,
      digitalSourceType: sourceTypeSelect.value || undefined,
    });

    const url = URL.createObjectURL(signedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sourceMime === 'image/jpeg' ? 'signed.jpg' : 'signed.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showToast('Signed image downloaded');
  } catch (err) {
    console.error('Failed to add Content Credentials:', err);
    signStatus.textContent = '⚠️ Could not add Content Credentials: ' + (err?.message || err);
  } finally {
    signButton.disabled = false;
    signButton.textContent = 'Sign and download image';
  }
});
