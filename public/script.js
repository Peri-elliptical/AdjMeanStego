document.addEventListener('DOMContentLoaded', () => {

    // ── Module State ────────────────────────────────
    let currentMode = 'text'; 
    let files = { cover: null, secret: null, stego: null };
    let stegoBlobUrl = null;
    let wasmExports = null;

    // ── DOM Elements ────────────────────────────────
    const barLeft = document.getElementById('barLeft');
    const barRight = document.getElementById('barRight');
    const statusMsg = document.getElementById('statusMsg');
    const textWrapper = document.getElementById('textWrapper');
    const secretTextInput = document.getElementById('secretTextInput');
    const embedBtn = document.getElementById('embedBtn');
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    // ── Initialize WebAssembly ──────────────────────
    async function loadWasm() {
        try {
            const response = await fetch('AdjMeanStego.wasm');
            const wasmBytes = await response.arrayBuffer();
            const wasmModule = await WebAssembly.instantiate(wasmBytes, {
                env: { emscripten_resize_heap: () => 0 }
            });
            wasmExports = wasmModule.instance.exports;
            console.log("✅ WebAssembly Engine Loaded!");
        } catch (error) {
            console.error("❌ Failed to load WebAssembly:", error);
            showMessage("❌ Error: Could not load the WebAssembly engine.", "error");
        }
    }
    loadWasm();

    // ── UI Interactions ─────────────────────────────
    function updateClip() {
        const w = window.innerWidth;
        const mid = Math.trunc(w / 2);
        
        // Left bar gets a sharp diagonal cut on its right edge
        document.getElementById('barClipPath').setAttribute('d',
            `M 0 0 L ${mid + 30} 0 L ${mid - 30} 60 L 0 60 Z`
        );
        // Right bar gets a matching diagonal cut on its left edge
        document.getElementById('barClipPath2').setAttribute('d',
            `M ${mid + 30} 0 L ${w} 0 L ${w} 60 L ${mid - 30} 60 Z`
        );
    }
    window.addEventListener('resize', updateClip);
    updateClip();

    function setMode(mode) {
        currentMode = mode;
        barLeft.classList.toggle('active', mode === 'text');
        barRight.classList.toggle('active', mode === 'image');
        
        textWrapper.style.display = mode === 'text' ? 'block' : 'none';
        document.getElementById('secretImgZone').style.display = mode === 'image' ? 'flex' : 'none';
        
        // Show/Hide specific settings based on the mode
        document.getElementById('stringRepGroup').style.display = mode === 'text' ? 'flex' : 'none';
        document.getElementById('imageModeGroup').style.display = mode === 'image' ? 'flex' : 'none';
    }

    function showMessage(text, type) {
        statusMsg.textContent = text;
        statusMsg.className = `output-msg visible ${type}`;
    }

    function toggleTextClear() {
        textWrapper.classList.toggle('has-text', secretTextInput.value.length > 0);
    }

    function clearField(field) {
        if (field === 'text') {
            secretTextInput.value = '';
            toggleTextClear();
        } else {
            const map = {
                cover:     { fileKey: 'cover',  prefix: 'cover',     input: 'coverInput' },
                secretImg: { fileKey: 'secret', prefix: 'secretImg', input: 'secretImgInput' },
                stego:     { fileKey: 'stego',  prefix: 'stego',     input: 'stegoInput' },
            };
            const { fileKey, prefix, input } = map[field];

            files[fileKey] = null;
            document.getElementById(input).value = '';
            document.getElementById(prefix + 'Zone').classList.remove('has-file');
            document.getElementById(prefix + 'Content').classList.remove('hidden');
            const prev = document.getElementById(prefix + 'Preview');
            prev.src = '';
            prev.classList.remove('visible');

            if (field === 'stego') {
                URL.revokeObjectURL(stegoBlobUrl);
                stegoBlobUrl = null;
                downloadBtn.style.display = 'none';
            }
        }
        statusMsg.className = 'output-msg';
    }

    function handleFileSelect(inputElement, prefix, fileKey) {
        const file = inputElement.files[0];
        if (!file) return;
        files[fileKey] = file;
        document.getElementById(prefix + 'Zone').classList.add('has-file');
        document.getElementById(prefix + 'Content').classList.add('hidden');
        const preview = document.getElementById(prefix + 'Preview');
        preview.src = URL.createObjectURL(file);
        preview.classList.add('visible');
        if (fileKey === 'stego') {
            downloadBtn.style.display = 'none';
            showMessage('Stego image loaded for extraction.', 'info');
        }
    }

    // ── Utilities ───────────────────────────────────
    function embPixels(x, y) {
        x -= 2; y -= 2;
        if (x < 0 || y < 0) return 0;
        return (x * y + (x & 1) * (y & 1)) >> 1;
    }

    function loadImage(fileOrBlob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = fileOrBlob instanceof Blob ? URL.createObjectURL(fileOrBlob) : fileOrBlob;
        });
    }

    // ── Core Engine: Embed ──────────────────────────
    async function textEmbed() {
        if (!files.cover) { showMessage('❌ Upload a Cover Image first.', 'error'); return; }
        const depth = parseInt(document.getElementById('embedDepth').value);
        
        try {
            if (currentMode === 'text') {
                const message = secretTextInput.value;
                if (!message) { showMessage('❌ Enter a secret message.', 'error'); return; }
                if (!wasmExports) { showMessage('⏳ The engine is still loading...', 'info'); return; }

                for (let i = 0; i < message.length; i++) {
                    if (message.charCodeAt(i) > 127) { showMessage('❌ ASCII characters only.', 'error'); return; }
                }

                const coverImg = await loadImage(files.cover);
                if (embPixels(coverImg.width, coverImg.height) * depth < message.length * 7) {
                    showMessage('❌ Cover image too small for this text.', 'error'); return;
                }

                showMessage("Processing directly on your device...", "info");
                
                const canvas = document.createElement('canvas');
                canvas.width = coverImg.width; canvas.height = coverImg.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(coverImg, 0, 0);

                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data; 

                const imgByteLength = canvas.width * canvas.height * 4;
                const imgPointer = wasmExports.create_buffer(canvas.width, canvas.height);
                
                const msgBytes = new TextEncoder().encode(message);
                const msgPointer = wasmExports.malloc(msgBytes.length);

                const wasmMemory = new Uint8Array(wasmExports.memory.buffer);
                wasmMemory.set(pixels, imgPointer);
                wasmMemory.set(msgBytes, msgPointer);

                const stringRepChecked = document.getElementById('stringRep').checked;
                wasmExports.text_embed(imgPointer, canvas.width, canvas.height, msgPointer, msgBytes.length, depth, stringRepChecked);

                const modifiedPixels = wasmMemory.slice(imgPointer, imgPointer + imgByteLength);

                wasmExports.free_buffer(imgPointer);
                wasmExports.free_buffer(msgPointer);

                imageData.data.set(modifiedPixels);
                ctx.putImageData(imageData, 0, 0);

                canvas.toBlob(blob => {
                    if(stegoBlobUrl) URL.revokeObjectURL(stegoBlobUrl);
                    stegoBlobUrl = URL.createObjectURL(blob);
                    files.stego = blob;
                    
                    document.getElementById('stegoPreview').src = stegoBlobUrl;
                    document.getElementById('stegoPreview').classList.add('visible');
                    document.getElementById('stegoContent').classList.add('hidden');
                    document.getElementById('stegoZone').classList.add('has-file');
                    downloadBtn.style.display = 'block';
                    
                    showMessage('✅ Embedding successful!', 'success');
                }, 'image/png');

            }
        } catch (e) {
            console.error(e); showMessage('❌ Embedding failed.', 'error');
        }
    }

    // ── Core Engine: Extract ────────────────────────
    async function performExtract() {
        if (!files.stego) { showMessage('❌ No stego image to extract from.', 'error'); return; }
        const depth = parseInt(document.getElementById('embedDepth').value);
        
        try {
            if (!wasmExports) { showMessage('⏳ The engine is still loading...', 'info'); return; }
        } catch (e) {
            console.error(e); showMessage('❌ Extraction failed.', 'error');
        }
    }

    // ── Event Listener Bindings ─────────────────────
    barLeft.addEventListener('click', () => setMode('text'));
    barRight.addEventListener('click', () => setMode('image'));
    secretTextInput.addEventListener('input', toggleTextClear);
    embedBtn.addEventListener('click', textEmbed);
    extractBtn.addEventListener('click', performExtract);
    downloadBtn.addEventListener('click', () => {
        if (!stegoBlobUrl) return;
        const a = document.createElement('a');
        a.href = stegoBlobUrl;
        a.download = 'stego_result.png';
        a.click();
    });

    // Upload zone clicks
    ['cover', 'secretImg', 'stego'].forEach(prefix => {
        document.getElementById(prefix + 'Zone').addEventListener('click', () =>
            document.getElementById(prefix + 'Input').click()
        );
    });

    // File input changes
    const inputMap = [
        ['coverInput',     'cover',     'cover'],
        ['secretImgInput', 'secretImg', 'secret'],
        ['stegoInput',     'stego',     'stego'],
    ];
    inputMap.forEach(([id, prefix, fileKey]) => {
        document.getElementById(id).addEventListener('change', (e) => handleFileSelect(e.target, prefix, fileKey));
    });

    // Clear button clicks
    const clearMap = [
        ['clearCoverBtn',     'cover'],
        ['clearTextBtn',      'text'],
        ['clearSecretImgBtn', 'secretImg'],
        ['clearStegoBtn',     'stego'],
    ];
    clearMap.forEach(([id, field]) => {
        document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); clearField(field); });
    });
    
    // Initialize Default View
    setMode('text');

});