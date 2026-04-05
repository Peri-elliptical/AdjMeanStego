async function submitForm() {
    const input = document.getElementById('input_image').value;

    const response = await fetch('/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input })
    });

    const result = await response.json();
    document.getElementById('output').innerText = result.output;
}