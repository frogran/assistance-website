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
          model: "gpt-4o-mini",
          messages: [{
            "role": "user",
            "content": "You are a blind choreographer. Helpers have given you keywords to describe what your choreography brings up in them. Describe only one sentence that integrates all of the actions for the dance made up of the inputs. There is only a single dancer. Talk directly to the dancer. Helper's words:".concat(allTexts)
          }],
        });
  
        const aiOutput = response.choices[0].message.content;
  
        console.log(`AI Output: ${aiOutput}`);
  
        // Select a random active user
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
  
          res.json({ submissions, recipientUserId });
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
// server.js

app.get('/get-updates', async (req, res) => {
    try {
      const userId = req.query.userId;
      const currentTime = Date.now();
  
      // Update user's last active timestamp
      await db.ref(`userActivity/${userId}`).set({
        lastActive: currentTime,
      });
  
      // Fetch submissions
      const submissionsRef = db.ref('submissions');
      const submissionsSnapshot = await submissionsRef.once('value');
      const submissions = [];
      submissionsSnapshot.forEach(childSnapshot => {
        const submission = childSnapshot.val();
        submissions.push(submission);
      });
  
      // Fetch the latest AI output
      const aiOutputsRef = db.ref('aiOutputs');
      const aiOutputsSnapshot = await aiOutputsRef.orderByChild('timestamp').limitToLast(1).once('value');
      let aiOutputContent = null;
      let recipientUserId = null;
  
      aiOutputsSnapshot.forEach(childSnapshot => {
        const aiOutput = childSnapshot.val();
        recipientUserId = aiOutput.recipientUserId || null;
        if (recipientUserId === userId) {
          aiOutputContent = aiOutput.output;
        }
      });
  
      // Get the last processed timestamp
      const metaRef = db.ref('meta');
      const metaSnapshot = await metaRef.once('value');
      let lastProcessedTimestamp = metaSnapshot.child('lastProcessedTimestamp').val() || 0;
  
      res.json({ submissions, aiOutputContent, recipientUserId, lastProcessedTimestamp });
    } catch (error) {
      console.error('Error fetching updates from database:', error);
      res.status(500).json({ error: 'Failed to fetch updates' });
    }
  });
  
  

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
