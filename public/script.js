// NEW HELPER FUNCTION: Converts any image to a PNG using the browser's Canvas
function convertImageToPng(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        // When the image loads, draw it to a canvas
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            // Export the canvas as a pure PNG file (Blob)
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        };
        
        img.onerror = () => reject(new Error("Failed to load image for conversion."));
        
        // Feed the uploaded file to the Image object
        img.src = URL.createObjectURL(file);
    });
}

async function submitForm() {
    const imageInput = document.getElementById('input_image');
    const messageInput = document.getElementById('message');
    const resultImage = document.getElementById('result_image');
    const outputText = document.getElementById('output');

    if (imageInput.files.length === 0) {
        outputText.innerText = "❌ Error: Please select a cover image first.";
        return;
    }
    if (messageInput.value.trim() === "") {
        outputText.innerText = "❌ Error: Please enter a message to hide.";
        return;
    }

    outputText.innerText = "Processing image...";

    try {
        // 1. CONVERT THE IMAGE BEFORE SENDING
        // No matter what the user uploaded (JPG, WebP), this turns it into a PNG
        const originalFile = imageInput.files[0];
        const pngBlob = await convertImageToPng(originalFile);

        // 2. Package the newly converted PNG
        const formData = new FormData();
        // We pass the new blob and give it a dummy filename ending in .png
        formData.append('image', pngBlob, 'cover.png'); 
        formData.append('message', messageInput.value);

        outputText.innerText = "Sending to server...";

        // 3. Send to Cloudflare Worker
        const response = await fetch('https://adjmeanstego.len3rvz.workers.dev/api/embed', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        resultImage.src = imageUrl;
        
        outputText.innerText = "✅ Success! Here is your Stego Image.";

    } catch (error) {
        console.error("Upload failed:", error);
        outputText.innerText = "❌ Processing failed. Check the console for details.";
    }
}