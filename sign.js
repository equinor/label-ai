// Copyright 2026 Matt Hall, Equinor // MIT license
$('.collapse').collapse();

const imageFrame = document.getElementById('imageFrame');
const placeholderText = document.getElementById('placeholderText');
const sourcePreview = document.getElementById('sourcePreview');
const attributionInput = document.getElementById('attributionInput');
const signButton = document.getElementById('signButton');
const signStatus = document.getElementById('signStatus');
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

// Bring an image into the tool: preview it and enable signing.
async function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  signStatus.textContent = '';
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
  sourcePreview.classList.remove('d-none');
  signButton.disabled = false;
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
