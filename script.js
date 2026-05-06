async function submitForm() {
    const imageInput = document.getElementById('input_image');
    const messageInput = document.getElementById('message');
    const resultImage = document.getElementById('result_image');
    const outputText = document.getElementById('output');

    // 1. Basic validation
    if (imageInput.files.length === 0) {
        outputText.innerText = "❌ Error: Please select a cover image first.";
        return;
    }
    if (messageInput.value.trim() === "") {
        outputText.innerText = "❌ Error: Please enter a message to hide.";
        return;
    }

    // 2. Package the data to send to the server
    const formData = new FormData();
    formData.append('image', imageInput.files[0]);
    formData.append('message', messageInput.value);

    outputText.innerText = "Sending to server for processing...";

    try {
        // 3. Send the data to your Cloudflare Worker / Server endpoint
        // Replace '/api/embed' with your actual server URL when deployed
        const response = await fetch('/api/embed', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        // 4. The server's C logic processes the image and returns the new image bytes
        const blob = await response.blob();
        
        // 5. Convert the raw bytes into a URL the <img> tag can display
        const imageUrl = URL.createObjectURL(blob);
        resultImage.src = imageUrl;
        
        outputText.innerText = "✅ Success! Here is your Stego Image.";

    } catch (error) {
        console.error("Upload failed:", error);
        outputText.innerText = "❌ Processing failed. Check the console for details.";
    }
}