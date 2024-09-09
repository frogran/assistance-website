document.addEventListener('DOMContentLoaded', () => {
    fetch('/get-user-id')
        .then(response => response.json())
        .then(data => {
            const userId = data.userId;
            document.getElementById('user-id').innerText = userId;
        });

    const submitButton = document.getElementById('submit-button');
    const sendButton = document.getElementById('send-button'); // New Send button

    submitButton.addEventListener('click', () => {
        const textInput = document.getElementById('text-input').value;
        if (textInput.trim()) {
            submitText(textInput);
            document.getElementById('text-input').value = ''; // Clear input field
        }
    });

    // New event listener for the "Send to OpenAI" button
    sendButton.addEventListener('click', () => {
        sendToOpenAI(); // Function to handle sending all collected texts
    });
});

// Function to submit text to the server
function submitText(text) {
    fetch('/submit-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    }).then(response => response.json())
      .then(data => updateCollectedTexts(data))
      .catch(error => console.error('Error:', error));
}

// Function to handle sending collected texts to OpenAI
function sendToOpenAI() {
    fetch('/send-to-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(response => response.json())
      .then(data => updatePageWithAIOutput(data))
      .catch(error => console.error('Error:', error));
}

// Function to update collected texts on the page
function updateCollectedTexts(data) {
    const collectedTextsDiv = document.getElementById('collected-texts');
    collectedTextsDiv.innerHTML = data.texts.map(item => `<p>${item}</p>`).join('');
}

// Function to update the page with AI output and recipient info
function updatePageWithAIOutput(data) {
    const aiOutputDiv = document.getElementById('ai-output');
    
    if (data.aiOutput && data.recipientUserId) {
        aiOutputDiv.innerHTML = `<p>AI Output: ${data.aiOutput}</p><p>Output sent to: ${data.recipientUserId}</p>`;
    }

    const collectedTextsDiv = document.getElementById('collected-texts');
    collectedTextsDiv.innerHTML = data.texts.map(item => `<p>${item}</p>`).join('');
}
