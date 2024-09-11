const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const OpenAI = require('openai');
const http = require('http');
const fetch = require('node-fetch'); // Use the Fetch API in Node.js for HTTP requests

const app = express();
const server = http.createServer(app);  // Create an HTTP server
const PORT = process.env.PORT || 3000;

let text_idx = 0;


app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let texts = [];
let connectedUsers = {}; // To store user IDs by their IP address
const logFilePath = path.join(__dirname, 'submissions_log.txt'); // Path to the log file

// OpenAI Initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to generate a user ID based on the IP address
function generateUserId(ip) {
  return `User-${ip.replace(/[^0-9]/g, '')}`;  // Replace non-numeric characters to create a numeric-based user ID
}

async function saveSessionData(sessionKey, data) {
    const response = await fetch(`https://edge-config.vercel.com/v1/configs/${process.env.VERCEL_EDGE_CONFIG_ID}/items`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`, // Use your Vercel API token
        },
        body: JSON.stringify({
            key: sessionKey,
            value: data
        })
    });

    if (!response.ok) {
        throw new Error('Failed to save session data to Edge Config');
    }

    return await response.json();
}

async function getSessionData(sessionKey) {
    const response = await fetch(`https://edge-config.vercel.com/v1/configs/${process.env.VERCEL_EDGE_CONFIG_ID}/items/${sessionKey}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
        }
    });

    if (response.status === 404) {
        // Key does not exist, return an empty string or null
        return '';
    }

    if (!response.ok) {
        throw new Error('Failed to retrieve session data from Edge Config');
    }

    const data = await response.json();
    return data.value || '';  // Return empty string if data is null or undefined
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


app.post('/submit-text', async (req, res) => {
    try {
        console.log('Received POST /submit-text');
        const { text } = req.body;
        console.log('Text submitted:', text);
        const sessionKey = `submissions_${text_idx}`; // Example session key
        let sessionData = await getSessionData(sessionKey);
        sessionData += `\n${text}`;
        await saveSessionData(sessionKey, sessionData);
        res.json({ message: 'Text submitted successfully' });
    } catch (error) {
        console.error('Error in /submit-text:', error); // Log the error for debugging
        res.status(500).json({ error: 'Failed to submit text' }); // Send a valid JSON error response
    }
});


// New endpoint to handle sending collected texts to OpenAI
app.post('/send-to-openai', async (req, res) => {
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

            // Write AI output to log file
            const { text } = aiOutput;
            const sessionKey = `apioutput_${text_idx}`; // Example session key
            let sessionData = await getSessionData(sessionKey);
            sessionData += `\n${text}`;
            await saveSessionData(sessionKey, sessionData);
            res.json({ message: 'API output saved successfully' });
            text_idx += 1;

            // fs.appendFile(logFilePath, `AI Output: ${aiOutput}\n`, (err) => {
            //     if (err) {
            //     console.error('Error writing to log file:', err);
            //     }u
            // });

            const userIps = Object.keys(connectedUsers);
            const randomUserIp = userIps[Math.floor(Math.random() * userIps.length)];
            const recipientUserId = connectedUsers[randomUserIp];

            console.log(`Sending AI output to: ${recipientUserId}`);

            res.json({ texts, aiOutput, recipientUserId });

            texts = [];
        } catch (error) {
        console.error('Error calling OpenAI API:', error);
        res.status(500).json({ error: 'Failed to generate AI output' });
        }
    } else {
        res.json({ message: 'No texts to send' });
    }
});

app.get('/get-updates', async (req, res) => {
    
    try {
        let sessionKey = `submissions_${text_idx}`;
        let sessionData = await getSessionData(sessionKey);
        if (text_idx > 0) {
            sessionKey = `apioutput_${text_idx - 1}`;
            sessionData += await getSessionData(sessionKey);
        }
        res.json({ logData: sessionData });
    } catch (error) {
        console.error('Error fetching updates from Edge Config:', error);
        res.status(500).json({ error: 'Failed to fetch updates' });
    }
});


// Start the server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
