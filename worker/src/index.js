import AdjMeanStegoWasm from './AdjMeanStego.wasm';
import UPNG from 'upng-js';

export default {
    async fetch(request, env, ctx) {
        // 1. Handle CORS (Allow your frontend to talk to this worker)
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "https://adjmeanstego.len3rvz.workers.dev",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                }
            });
        }

        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/embed') {
            try {
                // 2. Extract Data from Frontend Request
                const formData = await request.formData();
                const imageFile = formData.get('image');
                const message = formData.get('message');

                if (!imageFile || !message) {
                    return new Response("Missing image or message", { status: 400 });
                }

                // 3. Decode the PNG
                const arrayBuffer = await imageFile.arrayBuffer();
                const img = UPNG.decode(arrayBuffer);
                const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]); 

                // 4. Initialize WebAssembly
                const wasmInstance = await WebAssembly.instantiate(AdjMeanStegoWasm, {
                    env: {
                        memory: new WebAssembly.Memory({ initial: 256 }),
                        emscripten_resize_heap: () => false 
                    },
                    wasi_snapshot_preview1: {
                        fd_close: () => 0, fd_seek: () => 0, fd_write: () => 0,
                    }
                });
                const exports = wasmInstance.exports;


                // --- THIS IS WHERE YOUR CODE GOES ---
                
                // STEP 1: ALLOCATE MEMORY IN WASM
                const imgByteLength = img.width * img.height * 4;
                const imgPointer = exports.create_buffer(img.width, img.height); // Use your C function

                const encoder = new TextEncoder();
                const msgBytes = encoder.encode(message);
                const msgPointer = exports.malloc(msgBytes.length);

                // STEP 2: WRITE DATA FROM JS -> WASM
                const wasmMemoryView = new Uint8Array(exports.memory.buffer);
                wasmMemoryView.set(rgba, imgPointer);
                wasmMemoryView.set(msgBytes, msgPointer);

                // STEP 3: EXECUTE C CODE
                exports.process_stego(
                    imgPointer, 
                    img.width, 
                    img.height, 
                    msgPointer, 
                    msgBytes.length
                );

                // STEP 4: READ DATA FROM WASM -> JS
                const modifiedPixels = wasmMemoryView.slice(imgPointer, imgPointer + imgByteLength);

                // STEP 5: CLEANUP
                exports.free(imgPointer);
                exports.free(msgPointer);
                
                // --- END OF YOUR CODE ---


                // 5. Encode the modified pixels back into a PNG
                const outBuffer = UPNG.encode([modifiedPixels.buffer], img.width, img.height, 0);

                // 6. Send the final image back to the browser
                return new Response(outBuffer, {
                    headers: {
                        'Content-Type': 'image/png',
                        'Access-Control-Allow-Origin': 'https://adjmeanstego.len3rvz.workers.dev'
                    }
                });

            } catch (err) {
                console.error("Worker error:", err);
                return new Response("Server error processing image", { status: 500 });
            }
        }

        return new Response("Not found", { status: 404 });
    }
};