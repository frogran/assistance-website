const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');  // Import OpenAI client

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let texts = [];
let connectedUsers = {}; // To store user IDs by their IP address


// OpenAI Configuration
const openaiApiKey = process.env.OPENAI_API_KEY;  
console.log(`API key: ${openaiApiKey}`)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper function to generate a user ID based on the IP address
function generateUserId(ip) {
    return `User-${ip.replace(/[^0-9]/g, '')}`;  // Replace non-numeric characters to create a numeric-based user ID
}

// Middleware to assign a user ID based on IP address
app.use((req, res, next) => {
    const userIp = req.ip;
    if (!connectedUsers[userIp]) {
        const userId = generateUserId(userIp);
        connectedUsers[userIp] = userId;
        console.log(`New user connected: ${userId} (IP: ${userIp})`);
    }
    req.userId = connectedUsers[userIp];  // Attach the user ID to the request object
    next();
});

// Endpoint to handle text submission
app.post('/submit-text', (req, res) => {
    const { text } = req.body;
    const userId = req.userId;  // Use the attached user ID
    console.log(`Received text: ${text} from user: ${userId}`);  // Debugging log
    texts.push(`${userId}: ${text}`);
    res.json({ texts });
});

// New endpoint to handle sending collected texts to OpenAI
app.post('/send-to-openai', async (req, res) => {
    // Check if there are texts to process
    if (texts.length > 0) {
        try {
            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{
                    "role": "user", 
                    "content": "You are a blind choreographer. Helpers have given you keywords to describe what your choreography brings up in them. Describe in detail the movements that would emphasize their descriptions".concat(texts.join(' '))}],
              });
              console.log(response.choices[0].message);



            // Get the AI output
            const aiOutput = response.choices[0].message.content;
            console.log(`AI Output: ${aiOutput}`);

            // Choose a random user to receive the output
            const userIps = Object.keys(connectedUsers);
            const randomUserIp = userIps[Math.floor(Math.random() * userIps.length)];
            const recipientUserId = connectedUsers[randomUserIp];

            console.log(`Sending AI output to: ${recipientUserId}`);
            
            res.json({ texts, aiOutput, recipientUserId });  // Respond with the updated texts and recipient info

            // Clear the texts after sending to OpenAI
            texts = [];
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            res.status(500).json({ error: 'Failed to generate AI output' });
        }
    } else {
        res.json({ message: 'No texts to send' });
    }
});

// Endpoint to retrieve texts
app.get('/get-texts', (req, res) => {
    res.json({ texts });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
