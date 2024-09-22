document.addEventListener('DOMContentLoaded', () => {
    // Admin doesn't need a user ID, but we can generate one if necessary
    const userId = 'AdminUser';
    document.getElementById('connected-users').innerText = 'Connected Users: Loading...';

    const sendAllButton = document.getElementById('send-all-button');
    const addPrepromptButton = document.getElementById('add-preprompt-button');
    const sendButton = document.getElementById('send-button');
    const pickExtremeButton = document.getElementById('pick-extreme-button');

    sendAllButton.addEventListener('click', () => {
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

    // Polling function to get updates from the server
    function pollForUpdates() {
        fetch(`/admin-get-updates`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server responded with status ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                updateCollectedTexts(data);
                updatePrepromptButtons(data.preprompts);
                selectedPreprompt = data.selectedPreprompt;
                updateConnectedUsers(data.activeUserCount);
            })
            .catch(error => console.error('Error fetching updates:', error));
    }

    // Start polling every 5 seconds
    setInterval(pollForUpdates, 5000);
    pollForUpdates(); // Initial call

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
});
