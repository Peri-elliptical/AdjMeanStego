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
        document.getElementById('barClipPath').setAttribute('d',
            `M 0 0 L ${w} 0 L ${w} 5 L ${Math.trunc(w/2)} 5 A 25 25 0 0 0 ${Math.trunc(w/2) - 25} 30 A 25 25 0 0 1 ${Math.trunc(w/2) - 50} 55 L 50 55 A 25 25 0 0 1 25 30 A 25 25 0 0 0 0 5 Z`
        );
        document.getElementById('barClipPath2').setAttribute('d',
            `M 0 0 L ${w} 0 L ${w} 5 A 25 25 0 0 0 ${w - 25} 30 A 25 25 0 0 1 ${w - 50} 55 L ${Math.trunc(w/2) + 50} 55 A 25 25 0 0 1 ${Math.trunc(w/2) + 25} 30 A 25 25 0 0 0 ${Math.trunc(w/2)} 5 L 0 5 Z`
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
        if (secretTextInput.value.length > 0) {
            textWrapper.classList.add('has-text');
        } else {
            textWrapper.classList.remove('has-text');
        }
    }

    function clearField(field) {
        if (field === 'cover') {
            files.cover = null;
            document.getElementById('coverInput').value = '';
            document.getElementById('coverZone').classList.remove('has-file');
            document.getElementById('coverContent').classList.remove('hidden');
            const prev = document.getElementById('coverPreview');
            prev.src = ''; prev.classList.remove('visible');
        } else if (field === 'text') {
            secretTextInput.value = '';
            toggleTextClear();
        } else if (field === 'secretImg') {
            files.secret = null;
            document.getElementById('secretImgInput').value = '';
            document.getElementById('secretImgZone').classList.remove('has-file');
            document.getElementById('secretImgContent').classList.remove('hidden');
            const prev = document.getElementById('secretImgPreview');
            prev.src = ''; prev.classList.remove('visible');
        } else if (field === 'stego') {
            files.stego = null;
            if (stegoBlobUrl) URL.revokeObjectURL(stegoBlobUrl);
            stegoBlobUrl = null;
            document.getElementById('stegoInput').value = '';
            document.getElementById('stegoZone').classList.remove('has-file');
            document.getElementById('stegoContent').classList.remove('hidden');
            const prev = document.getElementById('stegoPreview');
            prev.src = ''; prev.classList.remove('visible');
            downloadBtn.style.display = 'none';
        }
        statusMsg.className = 'output-msg';
    }

    function handleFileSelect(inputElement, zoneId, contentId, previewId, fileKey) {
        const file = inputElement.files[0];
        if (!file) return;

        files[fileKey] = file;
        const zone = document.getElementById(zoneId);
        const content = document.getElementById(contentId);
        const preview = document.getElementById(previewId);

        zone.classList.add('has-file');
        content.classList.add('hidden');
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
    async function performEmbed() {
        if (!files.cover) { showMessage('❌ Upload a Cover Image first.', 'error'); return; }
        const depth = parseInt(document.getElementById('embedDepth').value);
        
        try {
            if (currentMode === 'text') {
                // -- TEXT MODE: USES WEBASSEMBLY (OPTION 2) --
                const message = secretTextInput.value;
                if (!message) { showMessage('❌ Enter a secret message.', 'error'); return; }
                if (!wasmExports) { showMessage('⏳ Engine still loading...', 'info'); return; }

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
                wasmExports.process_stego(imgPointer, canvas.width, canvas.height, msgPointer, msgBytes.length, depth, stringRepChecked);

                const modifiedPixels = wasmMemory.slice(imgPointer, imgPointer + imgByteLength);

                wasmExports.free(imgPointer);
                wasmExports.free(msgPointer);

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

            } else {
                // -- IMAGE MODE: PURE JS FALLBACK (Until C-Function is written) --
                if (!files.secret) { showMessage('❌ Upload a Secret Image.', 'error'); return; }
                
                // Captured state of the toggle for your future engine updates
                const isLossy = document.getElementById('lossyToggle').checked;
                
                const coverImg = await loadImage(files.cover);
                const secretImg = await loadImage(files.secret);
                
                const canvas = document.createElement('canvas');
                canvas.width = coverImg.width; canvas.height = coverImg.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(coverImg, 0, 0);
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                const capacityBits = embPixels(coverImg.width, coverImg.height) * depth;
                
                const maxPixels = Math.floor(capacityBits / 32);
                let sw = secretImg.width, sh = secretImg.height;
                if (sw * sh > maxPixels) {
                    const scale = Math.sqrt(maxPixels / (sw*sh));
                    sw = Math.max(1, Math.floor(sw * scale));
                    sh = Math.max(1, Math.floor(sh * scale));
                }
                
                const secCanvas = document.createElement('canvas');
                secCanvas.width = sw; secCanvas.height = sh;
                const sctx = secCanvas.getContext('2d', { willReadFrequently: true });
                sctx.drawImage(secretImg, 0, 0, sw, sh);
                const secPixels = sctx.getImageData(0,0,sw,sh).data;
                const totalBits = 32 + sw*sh*32;
                
                if (capacityBits < totalBits) { showMessage(`❌ Cover image too small.`, 'error'); return; }
                
                const bits = [];
                for (let i=15; i>=0; i--) bits.push((sw >> i) & 1);
                for (let i=15; i>=0; i--) bits.push((sh >> i) & 1);
                for (let i=0; i<secPixels.length; i++) {
                    for (let j=7; j>=0; j--) bits.push((secPixels[i] >> j) & 1);
                }
                
                let bitIdx = 0;
                outer: for (let y=2; y<coverImg.height; y++) {
                    for (let x=2; x<coverImg.width; x++) {
                        if (bitIdx >= totalBits) break outer;
                        const pxIdx = (y*coverImg.width + x)*4;
                        for (let d=0; d<depth && bitIdx<totalBits; d++) {
                            pixels[pxIdx+2] = (pixels[pxIdx+2] & ~1) | bits[bitIdx];
                            bitIdx++;
                        }
                    }
                }

                const outImageData = new ImageData(pixels, canvas.width, canvas.height);
                ctx.putImageData(outImageData, 0, 0);
                canvas.toBlob(blob => {
                    if(stegoBlobUrl) URL.revokeObjectURL(stegoBlobUrl);
                    stegoBlobUrl = URL.createObjectURL(blob);
                    files.stego = blob;
                    
                    document.getElementById('stegoPreview').src = stegoBlobUrl;
                    document.getElementById('stegoPreview').classList.add('visible');
                    document.getElementById('stegoContent').classList.add('hidden');
                    document.getElementById('stegoZone').classList.add('has-file');
                    downloadBtn.style.display = 'block';
                    
                    showMessage('✅ Image embedding successful!', 'success');
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
            // -- PURE JS FALLBACK (Until C-Function `extract_stego` is written) --
            const img = await loadImage(files.stego);
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const pixels = ctx.getImageData(0,0,img.width,img.height).data;
            const capacityBits = embPixels(img.width, img.height) * depth;
            
            const bits = [];
            outer: for (let y=2; y<img.height; y++) {
                for (let x=2; x<img.width; x++) {
                    if (bits.length >= capacityBits) break outer;
                    const pxIdx = (y*img.width + x)*4;
                    for (let d=0; d<depth && bits.length<capacityBits; d++) {
                        bits.push(pixels[pxIdx+2] & 1);
                    }
                }
            }

            if (currentMode === 'text') {
                const bytes = [];
                for (let i=0; i+8<=bits.length; i+=8) {
                    let byte = 0;
                    for (let j=0; j<8; j++) byte = (byte<<1) | bits[i+j];
                    bytes.push(byte);
                }
                while (bytes.length && bytes[bytes.length-1]===0) bytes.pop();
                const msg = new TextDecoder().decode(new Uint8Array(bytes));
                
                if (msg.length && /^[\x20-\x7E\s\n]*$/.test(msg)) {
                    secretTextInput.value = msg;
                    toggleTextClear(); 
                    showMessage('✅ Secret text extracted successfully!', 'success');
                } else {
                    showMessage('⚠️ No readable text found at this depth.', 'info');
                }
            } else {
                if (bits.length < 32) { showMessage('❌ Not enough data.', 'error'); return; }
                let sw=0, sh=0;
                for (let i=0; i<16; i++) sw = (sw<<1) | bits[i];
                for (let i=16; i<32; i++) sh = (sh<<1) | bits[i];
                
                const needed = 32 + sw*sh*32;
                if (bits.length < needed || sw <= 0 || sh <= 0 || sw > 5000 || sh > 5000) { 
                    showMessage('❌ Invalid or corrupted image data.', 'error'); return; 
                }
                
                const pixelsOut = new Uint8ClampedArray(sw*sh*4);
                let idx = 32;
                for (let i=0; i<sw*sh*4; i++) {
                    let byte = 0;
                    for (let b=0; b<8; b++) byte = (byte<<1) | bits[idx++];
                    pixelsOut[i] = byte;
                }
                
                const outCanvas = document.createElement('canvas');
                outCanvas.width = sw; outCanvas.height = sh;
                const outCtx = outCanvas.getContext('2d');
                const outImgData = outCtx.createImageData(sw, sh);
                outImgData.data.set(pixelsOut);
                outCtx.putImageData(outImgData, 0, 0);
                
                outCanvas.toBlob(blob => {
                    const prev = document.getElementById('secretImgPreview');
                    prev.src = URL.createObjectURL(blob);
                    prev.classList.add('visible');
                    document.getElementById('secretImgContent').classList.add('hidden');
                    document.getElementById('secretImgZone').classList.add('has-file');
                    showMessage('✅ Secret image extracted successfully!', 'success');
                }, 'image/png');
            }
        } catch (e) {
            console.error(e); showMessage('❌ Extraction failed.', 'error');
        }
    }

    // ── Event Listener Bindings ─────────────────────
    barLeft.addEventListener('click', () => setMode('text'));
    barRight.addEventListener('click', () => setMode('image'));
    secretTextInput.addEventListener('input', toggleTextClear);
    embedBtn.addEventListener('click', performEmbed);
    extractBtn.addEventListener('click', performExtract);
    downloadBtn.addEventListener('click', () => {
        if (!stegoBlobUrl) return;
        const a = document.createElement('a');
        a.href = stegoBlobUrl;
        a.download = 'stego_result.png';
        a.click();
    });

    // Upload zone clicks
    document.getElementById('coverZone').addEventListener('click', () => document.getElementById('coverInput').click());
    document.getElementById('secretImgZone').addEventListener('click', () => document.getElementById('secretImgInput').click());
    document.getElementById('stegoZone').addEventListener('click', () => document.getElementById('stegoInput').click());

    // File input changes
    document.getElementById('coverInput').addEventListener('change', (e) => handleFileSelect(e.target, 'coverZone', 'coverContent', 'coverPreview', 'cover'));
    document.getElementById('secretImgInput').addEventListener('change', (e) => handleFileSelect(e.target, 'secretImgZone', 'secretImgContent', 'secretImgPreview', 'secret'));
    document.getElementById('stegoInput').addEventListener('change', (e) => handleFileSelect(e.target, 'stegoZone', 'stegoContent', 'stegoPreview', 'stego'));

    // Clear button clicks
    document.getElementById('clearCoverBtn').addEventListener('click', (e) => { e.stopPropagation(); clearField('cover'); });
    document.getElementById('clearTextBtn').addEventListener('click', (e) => { e.stopPropagation(); clearField('text'); });
    document.getElementById('clearSecretImgBtn').addEventListener('click', (e) => { e.stopPropagation(); clearField('secretImg'); });
    document.getElementById('clearStegoBtn').addEventListener('click', (e) => { e.stopPropagation(); clearField('stego'); });

    // Initialize Default View
    setMode('text');

});