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

    submitButton.addEventListener('click', () => {
        const textInput = document.getElementById('text-input').value;
        if (textInput.trim()) {
            submitText(textInput, userId);
            document.getElementById('text-input').value = ''; // Clear input field
        }
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
                updatePageWithAIOutput(data);
                updateAdminMessages(data);
            })
            .catch(error => console.error('Error fetching updates:', error));
    }

    // Start polling every 5 seconds
    setInterval(pollForUpdates, 5000);
    pollForUpdates(); // Initial call

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

    function updatePageWithAIOutput(data) {
        const aiOutputDiv = document.getElementById('ai-output');
        const recipientInfoDiv = document.getElementById('recipient-info');

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

    function updateAdminMessages(data) {
        // Since admin messages are displayed in the ai-output section, this can be left empty or used if needed
    }
});
