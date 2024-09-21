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
    const pickExtremeButton = document.getElementById('pick-extreme-button');
    const sendAllButton = document.getElementById('send-all-button');
    const addPrepromptButton = document.getElementById('add-preprompt-button');

    addPrepromptButton.addEventListener('click', () => {
        const prepromptInput = document.getElementById('preprompt-input').value;
        if (prepromptInput.trim()) {
            addPreprompt(prepromptInput);
            document.getElementById('preprompt-input').value = ''; // Clear input field
        }
    });

    sendAllButton.addEventListener('click', () => {
        const messageInput = document.getElementById('admin-message-input').value;
        if (messageInput.trim()) {
            sendAdminMessage(messageInput);
            document.getElementById('admin-message-input').value = ''; // Clear input field
        }
    });

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

    pickExtremeButton.addEventListener('click', () => {
        pickExtremeSubmission(); // Function to handle picking extreme submission
    });

    let selectedPreprompt = null;

    function addPreprompt(prepromptText) {
        fetch('/add-preprompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prepromptText })
        }).then(response => response.json())
        .then(data => {
            updatePrepromptButtons(data.preprompts);
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        });
    }

    function updatePrepromptButtons(preprompts) {
        const prepromptButtonsDiv = document.getElementById('preprompt-buttons');
        prepromptButtonsDiv.innerHTML = '';
    
        preprompts.forEach(preprompt => {
            const button = document.createElement('button');
            button.innerText = preprompt.text;
            button.classList.add('preprompt-button');
            if (preprompt.id === selectedPreprompt) {
                button.classList.add('selected');
            }
            button.addEventListener('click', () => {
                selectPreprompt(preprompt.id);
            });
            prepromptButtonsDiv.appendChild(button);
        });
    }
    
    function selectPreprompt(prepromptId) {
        fetch('/select-preprompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prepromptId })
        }).then(response => response.json())
        .then(data => {
            selectedPreprompt = data.selectedPreprompt;
            updatePrepromptButtons(data.preprompts);
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        });
    }


    // Modify the polling function to include preprompts
    function pollForUpdates() {
        fetch(`/get-updates?userId=${encodeURIComponent(userId)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                selectedPreprompt = data.selectedPreprompt;
                updatePrepromptButtons(data.preprompts);
                updateCollectedTexts(data);
                updatePageWithAIOutput(data);
                updateAdminMessages(data);
            })
            .catch(error => console.error('Error fetching updates:', error));
    }
    
      
    function sendAdminMessage(message) {
        fetch('/send-admin-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        }).then(response => {
          if (!response.ok) {
            return response.json().then(errorData => {
              throw new Error(errorData.error || 'Unknown error');
            });
          }
          return response.json();
        })
        .then(data => {
          // Optionally handle success
          console.log('Admin message sent:', data);
        })
        .catch(error => {
          console.error('Error:', error);
          alert('Error: ' + error.message);
        });
    }
      
    function updateAdminMessages(data) {
        const adminMessagesDiv = document.getElementById('admin-messages');
        if (data.adminMessages && data.adminMessages.length > 0) {
          // Display the latest admin message
          const latestAdminMessage = data.adminMessages[data.adminMessages.length - 1];
          adminMessagesDiv.innerHTML = `<p><strong>Admin Message:</strong> ${latestAdminMessage.message}</p>`;
        } else {
          adminMessagesDiv.innerHTML = '';
        }
    }

    // Start polling every 5 seconds
    setInterval(pollForUpdates, 4000);
});

function submitText(text, userId) {
    fetch('/submit-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, userId })
    }).then(response => {
        if (!response.ok) {
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
        alert('Error: ' + error.message);
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

function pickExtremeSubmission() {
    fetch('/pick-extreme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(response => response.json())
      .then(data => updateExtremeSubmission(data))
      .catch(error => console.error('Error:', error));
}

function updateCollectedTexts(data) {
    const collectedTextsDiv = document.getElementById('collected-texts');
    if (data.submissions && data.submissions.length > 0) {
      // Reverse the submissions array to display newest first
      const submissions = data.submissions.slice().reverse();
  
      collectedTextsDiv.innerHTML = submissions.map(item => {
        const isProcessed = item.timestamp <= data.lastProcessedTimestamp;
        const className = isProcessed ? 'processed' : '';
        return `<p class="${className}">${item.text}</p>`;
      }).join('');
    } else {
      collectedTextsDiv.innerHTML = '<p>No submissions yet.</p>';
    }
  }
  


function updatePageWithAIOutput(data) {
    const aiOutputDiv = document.getElementById('ai-output');
    const recipientInfoDiv = document.getElementById('recipient-info');
    const userId = localStorage.getItem('userId');

    if (data.adminMessage && data.adminMessage.message) {
        // Display the admin message in the ai-output section
        aiOutputDiv.innerHTML = `<p>${data.adminMessage.message}</p>`;
        recipientInfoDiv.innerText = 'Admin Message';
    } else if (data.aiOutputContent) {
        // The AI output is sent to this user
        aiOutputDiv.innerHTML = data.aiOutputContent.split('\n').map(line => `<p>${line}</p>`).join('');
        recipientInfoDiv.innerText = `AI output sent to you (${userId})`;
    } else if (data.recipientUserId) {
        // AI output was sent to someone else
        recipientInfoDiv.innerText = `AI output sent to: ${data.recipientUserId}`;
        aiOutputDiv.innerHTML = '';
    } else {
        // No AI output or admin message
        recipientInfoDiv.innerText = '';
        aiOutputDiv.innerHTML = '';
    }
}


function updateExtremeSubmission(data) {
    const extremeOutputDiv = document.getElementById('extreme-output');
    if (data.extremeSubmission) {
        extremeOutputDiv.innerHTML = `<p><strong>Extreme Submission:</strong> ${data.extremeSubmission.text}</p>`;
    } else if (data.message) {
        extremeOutputDiv.innerHTML = `<p>${data.message}</p>`;
    } else {
        extremeOutputDiv.innerHTML = `<p>Failed to retrieve extreme submission.</p>`;
    }
}
