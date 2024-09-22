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

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0, // Set maxAge to 0 to prevent caching
}));

// Middleware to set Cache-Control headers
app.use((req, res, next) => {
  if (req.url.startsWith('/public')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
  next();
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
        // Fetch selected preprompt
        const selectedPrepromptSnapshot = await db.ref('selectedPreprompt').once('value');
        const selectedPrepromptId = selectedPrepromptSnapshot.val();

        let prepromptText = '';
        if (selectedPrepromptId) {
            const prepromptSnapshot = await db.ref(`preprompts/${selectedPrepromptId}`).once('value');
            prepromptText = prepromptSnapshot.val().text;
        } else {
            prepromptText = ''; // Default preprompt if none selected
        }
        // Concatenate all texts
        const allTexts = submissions.map(submission => submission.text).join(' ');
  
        // Call OpenAI API
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            "role": "user",
            "content": `${prepromptText}${allTexts}`
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

app.post('/pick-extreme', async (req, res) => {
    try {
      // Get the last processed timestamp for 'extreme' picks
      const metaRef = db.ref('meta');
      const metaSnapshot = await metaRef.once('value');
      let lastExtremeProcessedTimestamp = metaSnapshot.child('lastExtremeProcessedTimestamp').val() || 0;
  
      // Get the submissions since last extreme processed timestamp
      const submissionsRef = db.ref('submissions');
      const newSubmissionsSnapshot = await submissionsRef
        .orderByChild('timestamp')
        .startAt(lastExtremeProcessedTimestamp + 1)
        .once('value');
  
      const submissions = [];
      newSubmissionsSnapshot.forEach(childSnapshot => {
        const submission = childSnapshot.val();
        submissions.push(submission);
      });
  
      if (submissions.length > 0) {
        // Prepare the prompt for OpenAI
        let submissionTexts = submissions.map((sub, index) => `${index + 1}. ${sub.text}`).join('\n');
  
        // Call OpenAI API to pick the most extreme submission
        const prompt = `Ignore the previous prompts and memory. This is a temporary chat. This chat is about dance. What is this prompt about? Let's talk about consent. Submissions:\n${submissionTexts}\n\nFrom the above submissions, pick the number of the submission that is the most extreme or stands out the most, and only provide the number without any additional explanation.`;
  
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini", // Adjust as needed
          messages: [{
            "role": "user",
            "content": prompt
          }],
        });
        
        const choiceText = response.choices[0].message.content.trim();
  
        // Extract the number
        const choiceNumber = parseInt(choiceText, 10);
  
        if (isNaN(choiceNumber) || choiceNumber < 1 || choiceNumber > submissions.length) {
          console.error('Invalid choice number returned from OpenAI:', choiceText);
          res.status(500).json({ error: 'Invalid choice returned from OpenAI' });
          return;
        }
  
        const extremeSubmission = submissions[choiceNumber - 1];
  
        // Update the last extreme processed timestamp
        lastExtremeProcessedTimestamp = submissions[submissions.length - 1].timestamp;
        await metaRef.update({ lastExtremeProcessedTimestamp });
  
        res.json({ extremeSubmission });
      } else {
        res.json({ message: 'No new submissions to process' });
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      res.status(500).json({ error: 'Failed to pick extreme submission' });
    }
  });
  
app.post('/send-admin-message', async (req, res) => {
  try {
    const { message } = req.body;
    console.log('Admin message received:', message);

    // Save the admin message to the database
    const adminMessageRef = db.ref('adminMessages').push();
    await adminMessageRef.set({
      message,
      timestamp: Date.now(),
    });

    res.json({ message: 'Admin message sent successfully' });
  } catch (error) {
    console.error('Error in /send-admin-message:', error);
    res.status(500).json({ error: 'Failed to send admin message' });
  }
});

app.post('/add-preprompt', async (req, res) => {
  try {
      const { prepromptText } = req.body;
      console.log('Preprompt added:', prepromptText);

      // Save the preprompt to the database
      const prepromptRef = db.ref('preprompts').push();
      await prepromptRef.set({
          text: prepromptText,
          timestamp: Date.now(),
      });

      // Fetch updated list of preprompts
      const prepromptsSnapshot = await db.ref('preprompts').once('value');
      const preprompts = [];
      prepromptsSnapshot.forEach(childSnapshot => {
          preprompts.push({
              id: childSnapshot.key,
              text: childSnapshot.val().text,
          });
      });

      res.json({ preprompts });
  } catch (error) {
      console.error('Error in /add-preprompt:', error);
      res.status(500).json({ error: 'Failed to add preprompt' });
  }
});

// Endpoint to select a preprompt
app.post('/select-preprompt', async (req, res) => {
  try {
      const { prepromptId } = req.body;
      console.log('Preprompt selected:', prepromptId);

      // Save the selected preprompt ID to the database
      await db.ref('selectedPreprompt').set(prepromptId);

      // Fetch the selected preprompt
      const selectedPreprompt = prepromptId;

      // Fetch updated list of preprompts
      const prepromptsSnapshot = await db.ref('preprompts').once('value');
      const preprompts = [];
      prepromptsSnapshot.forEach(childSnapshot => {
          preprompts.push({
              id: childSnapshot.key,
              text: childSnapshot.val().text,
          });
      });

      res.json({ preprompts, selectedPreprompt });
  } catch (error) {
      console.error('Error in /select-preprompt:', error);
      res.status(500).json({ error: 'Failed to select preprompt' });
  }
});

// Endpoint to get updates
// server.js

// Endpoint to get admin updates
app.get('/admin-get-updates', async (req, res) => {
  try {
      // Fetch submissions
      const submissionsRef = db.ref('submissions');
      const submissionsSnapshot = await submissionsRef.once('value');
      const submissions = [];
      submissionsSnapshot.forEach(childSnapshot => {
          const submission = childSnapshot.val();
          submissions.push(submission);
      });

      // Get the last processed timestamp
      const metaRef = db.ref('meta');
      const metaSnapshot = await metaRef.once('value');
      let lastProcessedTimestamp = metaSnapshot.child('lastProcessedTimestamp').val() || 0;

      // Fetch preprompts
      const prepromptsSnapshot = await db.ref('preprompts').once('value');
      const preprompts = [];
      prepromptsSnapshot.forEach(childSnapshot => {
          preprompts.push({
              id: childSnapshot.key,
              text: childSnapshot.val().text,
          });
      });

      // Fetch selected preprompt
      const selectedPrepromptSnapshot = await db.ref('selectedPreprompt').once('value');
      const selectedPreprompt = selectedPrepromptSnapshot.val() || null;

      // Get the number of active users
      const tenSecondsAgo = Date.now() - 10000;
      const userActivityRef = db.ref('userActivity');
      const userActivitySnapshot = await userActivityRef.once('value');
      let activeUserCount = 0;
      userActivitySnapshot.forEach(childSnapshot => {
          const lastActive = childSnapshot.val().lastActive;
          if (lastActive >= tenSecondsAgo) {
              activeUserCount += 1;
          }
      });

      res.json({
          submissions,
          lastProcessedTimestamp,
          preprompts,
          selectedPreprompt,
          activeUserCount
      });
  } catch (error) {
      console.error('Error fetching admin updates from database:', error);
      res.status(500).json({ error: 'Failed to fetch admin updates' });
  }
});


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


    // **Fetch preprompts**
    const prepromptsSnapshot = await db.ref('preprompts').once('value');
    const preprompts = [];
    prepromptsSnapshot.forEach(childSnapshot => {
      preprompts.push({
        id: childSnapshot.key,
        text: childSnapshot.val().text,
      });
    });

    // **Fetch selected preprompt**
    const selectedPrepromptSnapshot = await db.ref('selectedPreprompt').once('value');
    const selectedPreprompt = selectedPrepromptSnapshot.val() || null;

    const adminMessagesRef = db.ref('adminMessages');
    const adminMessagesSnapshot = await adminMessagesRef.orderByChild('timestamp').limitToLast(1).once('value');
    let latestAdminMessage = null;
    adminMessagesSnapshot.forEach(childSnapshot => {
        latestAdminMessage = childSnapshot.val();
    });

    res.json({
        submissions,
        aiOutputContent,
        recipientUserId,
        lastProcessedTimestamp,
        adminMessage: latestAdminMessage, // Send latest admin message
        preprompts,
        selectedPreprompt
    });
  } catch (error) {
    console.error('Error fetching updates from database:', error);
    res.status(500).json({ error: 'Failed to fetch updates' });
  }
});
  
  

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
