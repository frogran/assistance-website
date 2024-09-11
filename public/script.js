document.addEventListener('DOMContentLoaded', () => {
    fetch('/get-user-id')
        .then(response => response.json())
        .then(data => {
            const userId = data.userId;
            document.getElementById('user-id').innerText = userId;
        });

    const submitButton = document.getElementById('submit-button');
    const sendButton = document.getElementById('send-button');

    submitButton.addEventListener('click', () => {
        const textInput = document.getElementById('text-input').value;
        if (textInput.trim()) {
            submitText(textInput);
            document.getElementById('text-input').value = ''; // Clear input field
        }
    });

    sendButton.addEventListener('click', () => {
        sendToOpenAI(); // Function to handle sending all collected texts
    });

    // Polling function to get updates from the server
    function pollForUpdates() {
        fetch('/get-updates')
            .then(response => response.json())
            .then(data => {
                updatePageWithAIOutput({ aiOutput: data.logData });
            })
            .catch(error => console.error('Error fetching updates:', error));
    }

    // Start polling every 5 seconds
    setInterval(pollForUpdates, 5000);
});

function submitText(text) {
    fetch('/submit-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
    }).then(response => {
        if (!response.ok) {
            // Check for non-2xx status codes
            return response.json().then(errorData => {
                throw new Error(errorData.error || 'Unknown error');
            });
        }
        return response.json();
    })
    .then(data => updateCollectedTexts(data))
    .catch(error => {
        console.error('Error:', error);
        alert('Error: ' + error.message); // Display a user-friendly error message
    });
}


function sendToOpenAI() {
    fetch('/send-to-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(response => response.json())
      .then(data => updatePageWithAIOutput(data))
      .catch(error => console.error('Error:', error));
}

function updateCollectedTexts(data) {
    const collectedTextsDiv = document.getElementById('collected-texts');
    collectedTextsDiv.innerHTML = data.texts.map(item => `<p>${item}</p>`).join('');
}

function updatePageWithAIOutput(data) {
    const aiOutputDiv = document.getElementById('ai-output');
    if (data.aiOutput) {
        aiOutputDiv.innerHTML = data.aiOutput.split('\n').map(line => `<p>${line}</p>`).join('');
    }
}
