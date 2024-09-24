document.addEventListener('DOMContentLoaded', () => {
    // Admin doesn't need a user ID, but we can generate one if necessary
    const userId = 'AdminUser';
    document.getElementById('connected-users').innerText = 'Connected Users: Loading...';

    const messageSendAllButton = document.getElementById('message-send-all-button');
    const addPrepromptButton = document.getElementById('add-preprompt-button');
    const sendButton = document.getElementById('send-button');
    const pickExtremeButton = document.getElementById('pick-extreme-button');
    const sendSingleButton = document.getElementById('send-single-button');
    const sendAllButton = document.getElementById('send-all-button');


    sendButton.addEventListener('click', () => {
        generateAIOutput();
    });
    
    sendSingleButton.addEventListener('click', () => {
        sendAIOutputToSingle();
    });
    
    sendAllButton.addEventListener('click', () => {
        sendAIOutputToAll();
    });

    messageSendAllButton.addEventListener('click', () => {
        const messageInput = document.getElementById('admin-message-input').value;
        if (messageInput.trim()) {
            sendAdminMessage(messageInput);
            document.getElementById('admin-message-input').value = ''; // Clear input field
        }
    });

    addPrepromptButton.addEventListener('click', () => {
        const prepromptInput = document.getElementById('preprompt-input').value;
        if (prepromptInput.trim()) {
            addPreprompt(prepromptInput);
            document.getElementById('preprompt-input').value = ''; // Clear input field
        }
    });

    sendButton.addEventListener('click', () => {
        sendToOpenAI(); // Function to handle sending all collected texts
    });

    pickExtremeButton.addEventListener('click', () => {
        pickExtremeSubmission(); // Function to handle picking extreme submission
    });

    // Variable to store the selected preprompt ID
    let selectedPreprompt = null;



    // Function to generate AI output
    function generateAIOutput() {
        fetch('/send-to-openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        })
            .then(response => response.json())
            .then(data => {
            alert('AI output generated and saved.');
            pollForUpdates(); // Refresh the AI outputs display
            })
            .catch(error => console.error('Error:', error));
    }
    
    // Function to send AI output to a single participant
    function sendAIOutputToSingle() {
    fetch('/send-ai-output-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
        .then(response => response.json())
        .then(data => {
        alert(data.message);
        pollForUpdates(); // Refresh the AI outputs display
        })
        .catch(error => console.error('Error:', error));
    }

    // Function to send AI output to all participants
    function sendAIOutputToAll() {
    fetch('/send-ai-output-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
    })
        .then(response => response.json())
        .then(data => {
        alert(data.message);
        pollForUpdates(); // Refresh the AI outputs display
        })
        .catch(error => console.error('Error:', error));
    }

    // Function to update the AI outputs display
    function updateAIOutputs(data) {
        const aiOutputsDiv = document.getElementById('ai-outputs');
        if (data.aiOutputs) {
            // Reverse the array to show newest first
            const aiOutputs = data.aiOutputs.slice().reverse();

            aiOutputsDiv.innerHTML = aiOutputs
            .map(item => {
                const isSent = item.sent;
                const className = isSent ? 'processed' : '';
                return `<p class="${className}">${item.output}</p>`;
            })
            .join('');
        } else {
            aiOutputsDiv.innerHTML = '<p>No AI outputs yet.</p>';
        }
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
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error: ' + error.message);
        });
    }

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

    function sendToOpenAI() {
        fetch('/send-to-openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }).then(response => response.json())
          .then(data => {
              // Optionally handle response
              alert('AI output generated and sent to a participant.');
          })
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
        if (data.submissions) {
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

    function updateConnectedUsers(count) {
        document.getElementById('user-count').innerText = count;
    }

    function updateAdminAIOutput(data) {
        const adminAIOutputDiv = document.getElementById('admin-ai-output');
        const adminRecipientInfoDiv = document.getElementById('admin-recipient-info');
      
        if (data.adminMessage && data.adminMessage.message) {
          // Display the admin message with label
          adminAIOutputDiv.innerHTML = `<p><strong>Admin Message:</strong></p><p>${data.adminMessage.message}</p>`;
          adminRecipientInfoDiv.innerText = ''; // Clear recipient info
        } else if (data.aiOutputContent) {
          // Display the AI output
          adminAIOutputDiv.innerHTML =
            `<p><strong>AI Output:</strong></p>` +
            data.aiOutputContent
              .split('\n')
              .map(line => `<p>${line}</p>`)
              .join('');
          if (data.recipientUserId) {
            adminRecipientInfoDiv.innerText = `AI output sent to: ${data.recipientUserId}`;
          } else {
            adminRecipientInfoDiv.innerText = '';
          }
        } else if (data.recipientUserId) {
          adminRecipientInfoDiv.innerText = `AI output sent to: ${data.recipientUserId}`;
          adminAIOutputDiv.innerHTML = '';
        } else {
          adminRecipientInfoDiv.innerText = '';
          adminAIOutputDiv.innerHTML = '';
        }
    }
      
    
    function pollForUpdates() {
    fetch(`/admin-get-updates`)
        .then(response => {
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }
        return response.json();
        })
        .then(data => {
        console.log('Received data:', data); // Debugging
        updateCollectedTexts(data);
        updatePrepromptButtons(data.preprompts);
        selectedPreprompt = data.selectedPreprompt;
        updateConnectedUsers(data.activeUserCount);
        updateAdminAIOutput(data);
        updateAIOutputs(data);
        })
        .catch(error => console.error('Error fetching updates:', error));
    }
      
    // Start polling every 3 seconds
    setInterval(pollForUpdates, 3000);
    pollForUpdates(); // Initial call
});
