const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const OpenAI = require('openai');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Firebase Initialization
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

if (!admin.apps.length) {
    admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://reinforcement-c359d-default-rtdb.firebaseio.com/"
    });
};

const db = admin.database();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// OpenAI Initialization
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Endpoint to submit text
app.post('/submit-text', async (req, res) => {
  try {
    console.log('Received POST /submit-text');
    const { text, userId } = req.body;
    console.log('Text submitted:', text);

    // Write the submission to the database
    await db.ref('submissions').push({
      userId,
      text,
      timestamp: Date.now(),
    });
    res.json({ message: 'Text submitted successfully' });
  } catch (error) {
    console.error('Error in /submit-text:', error);
    res.status(500).json({ error: 'Failed to submit text' });
  }
});

// Endpoint to send collected texts to OpenAI
app.post('/send-to-openai', async (req, res) => {
    try {
      // Get the last processed timestamp
      const metaRef = db.ref('meta');
      const metaSnapshot = await metaRef.once('value');
      let lastProcessedTimestamp = metaSnapshot.child('lastProcessedTimestamp').val() || 0;
  
      // Get the submissions since last processed timestamp
      const submissionsRef = db.ref('submissions');
      const newSubmissionsSnapshot = await submissionsRef
        .orderByChild('timestamp')
        .startAt(lastProcessedTimestamp + 1)
        .once('value');
  
      const submissions = [];
      newSubmissionsSnapshot.forEach(childSnapshot => {
        const submission = childSnapshot.val();
        submissions.push(submission);
      });
  
      if (submissions.length > 0) {
        // Concatenate all texts
        const allTexts = submissions.map(submission => submission.text).join(' ');
  
        // Call OpenAI API
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{
            "role": "user",
            "content": "You are a blind choreographer. Helpers have given you keywords to describe what your choreography brings up in them. Describe in detail the movements that would emphasize their descriptions. ".concat(allTexts)
          }],
        });
  
        const aiOutput = response.choices[0].message.content;
  
        console.log(`AI Output: ${aiOutput}`);
  
        // Write AI output to the database
        const aiOutputRef = db.ref('aiOutputs').push();
        await aiOutputRef.set({
          output: aiOutput,
          timestamp: Date.now(),
        });
  
        // Update the last processed timestamp
        lastProcessedTimestamp = submissions[submissions.length - 1].timestamp;
        await metaRef.update({ lastProcessedTimestamp });
  
        const tenSecondsAgo = Date.now() - 10000;
        const userActivityRef = db.ref('userActivity');
        const userActivitySnapshot = await userActivityRef.once('value');
        const activeUsers = [];
        userActivitySnapshot.forEach(childSnapshot => {
            const userId = childSnapshot.key;
            const lastActive = childSnapshot.val().lastActive;
            if (lastActive >= tenSecondsAgo) {
            activeUsers.push(userId);
            }
        });

        if (activeUsers.length > 0) {
            // Select a random active user
            const recipientUserId = activeUsers[Math.floor(Math.random() * activeUsers.length)];

            console.log(`Sending AI output to: ${recipientUserId}`);

            // Save AI output along with the recipientUserId
            const aiOutputRef = db.ref('aiOutputs').push();
            await aiOutputRef.set({
            output: aiOutput,
            timestamp: Date.now(),
            recipientUserId: recipientUserId,
            });

            // Update the last processed timestamp
            lastProcessedTimestamp = submissions[submissions.length - 1].timestamp;
            await metaRef.update({ lastProcessedTimestamp });

            res.json({ submissions, aiOutput, recipientUserId });
        } else {
            console.log('No active users to send the AI output to.');
            res.json({ message: 'No active users to send the AI output to.' });
        }
        } else {
        res.json({ message: 'No texts to send' });
        }
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        res.status(500).json({ error: 'Failed to generate AI output' });
    }
});
  

// Endpoint to get updates
app.get('/get-updates', async (req, res) => {
    try {
      const userId = req.query.userId; // Get userId from query parameter
      const currentTime = Date.now();
  
      // Update user's last active timestamp
      await db.ref(`userActivity/${userId}`).set({
        lastActive: currentTime,
      });
  
      // Fetch submissions and AI outputs as before
      const submissionsRef = db.ref('submissions');
      const submissionsSnapshot = await submissionsRef.once('value');
      const submissions = [];
      submissionsSnapshot.forEach(childSnapshot => {
        const submission = childSnapshot.val();
        submissions.push(submission);
      });
  
      const aiOutputsRef = db.ref('aiOutputs');
      const aiOutputsSnapshot = await aiOutputsRef.once('value');
      const aiOutputs = [];
      aiOutputsSnapshot.forEach(childSnapshot => {
        const aiOutput = childSnapshot.val();
        aiOutputs.push(aiOutput);
      });
  
      // Include the recipient userId of the latest AI output
      let recipientUserId = null;
      if (aiOutputs.length > 0) {
        recipientUserId = aiOutputs[aiOutputs.length - 1].recipientUserId || null;
      }
  
      res.json({ submissions, aiOutputs, recipientUserId });
    } catch (error) {
      console.error('Error fetching updates from database:', error);
      res.status(500).json({ error: 'Failed to fetch updates' });
    }
  });
  

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
