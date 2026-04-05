async function submitForm() {
    const formData = new FormData();
    formData.append('input_image', document.getElementById('input_image').files[0]);
    formData.append('message', document.getElementById('message').value);

    const response = await fetch('/embed', {
        method: 'POST',
        body: formData
    });

    const result = await response.json();
    document.getElementById('output').innerText = result.status;
}