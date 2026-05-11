// 1. GLOBAL VARIABLE: Holds your C functions
let wasmExports = null;

function embPixels(x, y) {
    x -= 2;
    y -= 2;
    if (x < 0 || y < 0) {
        return 0;
    }
    return (x * y + (x & 1) * (y & 1)) >> 1;
}

// 2. LOAD WASM ON BOOT: Fetches the file the moment the website loads
async function loadWasm() {
    try {
        const response = await fetch('AdjMeanStego.wasm');
        const wasmBytes = await response.arrayBuffer();
        
        // Instantiate the C code
        const wasmModule = await WebAssembly.instantiate(wasmBytes, {
            env: {
                emscripten_resize_heap: () => 0 // Failsafe for Emscripten memory
            }
        });
        
        wasmExports = wasmModule.instance.exports;
        console.log("✅ WebAssembly Engine Loaded!");
    } catch (error) {
        console.error("❌ Failed to load WebAssembly:", error);
        document.getElementById('output').innerText = "❌ Error: Could not load the steganography engine.";
    }
}

// Call this immediately
loadWasm();

// 3. THE MAIN ENGINE
async function submitForm() {
    const imageInput = document.getElementById('input_image');
    const messageInput = document.getElementById('message');
    const depthInput = document.getElementById('EmbDepth');
    const resultImage = document.getElementById('result_image');
    const outputText = document.getElementById('output');

    if (!wasmExports) {
        outputText.innerText = "⏳ Please wait a second, the WebAssembly engine is still loading...";
        return;
    }

    if (imageInput.files.length === 0 || messageInput.value === "") {
        outputText.innerText = "❌ Error: Please select an image and enter a message.";
        return;
    }

    for (let i = 0; i < messageInput.value.length; i++) {
        if (messageInput.value.charCodeAt(i) > 127) {
            outputText.innerText = "❌ Error: Message contains non-ASCII characters.";
            return;
        }
    }

    outputText.innerText = "Processing directly on your device...";
    const file = imageInput.files[0];

    try {
        // --- A. BROWSER DECODING (Replaces upng-js) ---
        const img = new Image();
        img.src = URL.createObjectURL(file);
        
        // Wait for image to load
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        if (embPixels(img.width, img.height) * depthInput.value < messageInput.value.length * 7) {
            outputText.innerText = "❌ Error: The entire message cannot be embedded in the selected image. Please choose a larger image, reduce the message length or increase the embedding depth.";
            return;
        }

        // Draw to invisible canvas to strip formatting
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Extract the raw RGBA pixel array!
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data; 

        // --- B. WEBASSEMBLY MEMORY MANAGEMENT ---
        const imgByteLength = canvas.width * canvas.height * 4;
        
        // Ask C for memory space
        const imgPointer = wasmExports.create_buffer(canvas.width, canvas.height);
        
        const encoder = new TextEncoder();
        const msgBytes = encoder.encode(messageInput.value);
        const msgPointer = wasmExports.malloc(msgBytes.length);

        const embDepth = parseInt(depthInput.value);

        // Create a Javascript "window" into C's memory
        const wasmMemory = new Uint8Array(wasmExports.memory.buffer);
        
        // Copy our pixels and text INTO C's memory
        wasmMemory.set(pixels, imgPointer);
        wasmMemory.set(msgBytes, msgPointer);

        // --- C. EXECUTE C CODE ---
        wasmExports.process_stego(imgPointer, canvas.width, canvas.height, msgPointer, msgBytes.length, embDepth);

        // --- D. RETRIEVE AND RENDER ---
        // Grab the modified pixels BACK from C
        const modifiedPixels = wasmMemory.slice(imgPointer, imgPointer + imgByteLength);

        // FREE THE MEMORY (Crucial so the browser doesn't crash on multiple uploads)
        wasmExports.free(imgPointer);
        wasmExports.free(msgPointer);

        // Shove the modified pixels back into the canvas
        imageData.data.set(modifiedPixels);
        ctx.putImageData(imageData, 0, 0);

        // Export the canvas as a new PNG and show the user
        canvas.toBlob((blob) => {
            const imageUrl = URL.createObjectURL(blob);
            resultImage.src = imageUrl;
            outputText.innerText = "✅ Success! Processing complete.";
        }, 'image/png');

    } catch (error) {
        console.error("Processing error:", error);
        outputText.innerText = "❌ Processing failed. Check console for details.";
    }
}