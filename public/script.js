document.addEventListener('DOMContentLoaded', () => {
    const adjectives = ['Brave', 'Calm', 'Delightful', 'Eager', 'Fancy', 'Gentle', 'Happy', 'Jolly', 'Kind', 'Lively', 'Nice', 'Proud', 'Silly', 'Thankful', 'Witty', 'Zealous'];
    
    let userId = localStorage.getItem('userId');
    if (!userId) {
        function generateUserId() {
            const adj1 = adjectives[Math.floor(Math.random() * adjectives.length)];
            const adj2 = adjectives[Math.floor(Math.random() * adjectives.length)];
            return `${adj1}${adj2}`;
        }
        userId = generateUserId();
        localStorage.setItem('userId', userId);
    }
    document.getElementById('user-id').innerText = userId;

    const submitButton = document.getElementById('submit-button');
    const sendButton = document.getElementById('send-button');

    submitButton.addEventListener('click', () => {
        const textInput = document.getElementById('text-input').value;
        if (textInput.trim()) {
            submitText(textInput, userId);
            document.getElementById('text-input').value = ''; // Clear input field
        }
    });

    sendButton.addEventListener('click', () => {
        sendToOpenAI(); // Function to handle sending all collected texts
    });

    // Polling function to get updates from the server
    function pollForUpdates() {
        fetch(`/get-updates?userId=${encodeURIComponent(userId)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                updateCollectedTexts(data);
                updatePageWithAIOutput(data);
                updateRecipientUser(data.recipientUserId);
            })
            .catch(error => console.error('Error fetching updates:', error));
    }



    // Start polling every 5 seconds
    setInterval(pollForUpdates, 5000);
});

function submitText(text, userId) {
    fetch('/submit-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, userId })
    }).then(response => {
        if (!response.ok) {
            // Check for non-2xx status codes
            return response.json().then(errorData => {
                throw new Error(errorData.error || 'Unknown error');
            });
        }
        return response.json();
    })
    .then(data => {
        // Optionally handle success
    })
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
    if (data.submissions) {
      collectedTextsDiv.innerHTML = data.submissions.map(item => {
        const isProcessed = item.timestamp <= data.lastProcessedTimestamp;
        const style = isProcessed ? 'style="color: gray;"' : '';
        return `<p ${style}>${item.text}</p>`;
      }).join('');
    }
  }
  

// script.js

function updatePageWithAIOutput(data) {
    const aiOutputDiv = document.getElementById('ai-output');
    const recipientInfoDiv = document.getElementById('recipient-info');
    const userId = localStorage.getItem('userId');
  
    if (data.aiOutputContent) {
      // The AI output is sent to this user
      aiOutputDiv.innerHTML = data.aiOutputContent.split('\n').map(line => `<p>${line}</p>`).join('');
      recipientInfoDiv.innerText = `AI output sent to you (${userId})`;
    } else if (data.recipientUserId) {
      // AI output was sent to someone else
      recipientInfoDiv.innerText = `AI output sent to: ${data.recipientUserId}`;
      aiOutputDiv.innerHTML = ''; // Clear any previous AI output
    } else {
      // No AI output yet
      recipientInfoDiv.innerText = '';
      aiOutputDiv.innerHTML = '';
    }
  }
  

function updateRecipientUser(recipientUserId) {
    if (recipientUserId) {
        const recipientInfoDiv = document.getElementById('recipient-info');
        recipientInfoDiv.innerText = `AI output sent to: ${recipientUserId}`;
    }
}
