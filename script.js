const result = await response.json();
document.getElementById('output').innerText = result.status;
document.getElementById('result_image').src = 'data:image/png;base64,' + result.image;