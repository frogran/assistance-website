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
    // Fetch submissions that haven't been processed yet
    const submissionsRef = db.ref('submissions');
    const submissionsSnapshot = await submissionsRef.once('value');
    const submissions = [];
    submissionsSnapshot.forEach(childSnapshot => {
      const submission = childSnapshot.val();
      if (!submission.processed) {
        submissions.push(submission);
      }
    });

    if (submissions.length > 0) {
      // Fetch selected preprompt
      const selectedPrepromptSnapshot = await db.ref('selectedPreprompt').once('value');
      const selectedPrepromptId = selectedPrepromptSnapshot.val();

      let prepromptText = '';
      if (selectedPrepromptId) {
        const prepromptSnapshot = await db.ref(`preprompts/${selectedPrepromptId}`).once('value');
        prepromptText = prepromptSnapshot.val().text;
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

      // Save AI output to the database without sending
      const aiOutputRef = db.ref('aiOutputs').push();
      await aiOutputRef.set({
        output: aiOutput,
        timestamp: Date.now(),
        sent: false, // Not sent yet
      });

      // Mark submissions as processed
      const lastProcessedTimestamp = Date.now();
      await db.ref('meta/lastProcessedTimestamp').set(lastProcessedTimestamp);
      submissions.forEach(async submission => {
        await db.ref(`submissions/${submission.id}`).update({ processed: true });
      });

      res.json({ message: 'AI output generated and saved.' });
    } else {
      res.json({ message: 'No submissions to process.' });
    }
  } catch (error) {
    console.error('Error generating AI output:', error);
    res.status(500).json({ error: 'Failed to generate AI output' });
  }
});

app.post('/send-ai-output-single', async (req, res) => {
  try {
    // Fetch the next unsent AI output
    const aiOutputsRef = db.ref('aiOutputs');
    const aiOutputSnapshot = await aiOutputsRef.orderByChild('sent').equalTo(false).limitToFirst(1).once('value');

    if (aiOutputSnapshot.exists()) {
      let aiOutputKey;
      let aiOutputData;
      aiOutputSnapshot.forEach(childSnapshot => {
        aiOutputKey = childSnapshot.key;
        aiOutputData = childSnapshot.val();
      });

      // Fetch active users
      const tenSecondsAgo = Date.now() - 10000;
      const userActivityRef = db.ref('userActivity');
      const userActivitySnapshot = await userActivityRef.once('value');
      const activeUsers = [];
      userActivitySnapshot.forEach(childSnapshot => {
        const lastActive = childSnapshot.val().lastActive;
        if (lastActive >= tenSecondsAgo) {
          activeUsers.push(childSnapshot.key);
        }
      });

      if (activeUsers.length > 0) {
        // Select a random active user
        const recipientUserId = activeUsers[Math.floor(Math.random() * activeUsers.length)];

        // Update the AI output with recipient info
        await db.ref(`aiOutputs/${aiOutputKey}`).update({
          sent: true,
          recipientUserId: recipientUserId,
          sentToAll: false,
        });

        res.json({ message: `AI output sent to user ${recipientUserId}` });
      } else {
        res.json({ message: 'No active users to send the AI output.' });
      }
    } else {
      res.json({ message: 'No unsent AI outputs available.' });
    }
  } catch (error) {
    console.error('Error sending AI output to single participant:', error);
    res.status(500).json({ error: 'Failed to send AI output to single participant' });
  }
});

app.post('/send-ai-output-all', async (req, res) => {
  try {
    // Fetch the next unsent AI output
    const aiOutputsRef = db.ref('aiOutputs');
    const aiOutputSnapshot = await aiOutputsRef.orderByChild('sent').equalTo(false).limitToFirst(1).once('value');

    if (aiOutputSnapshot.exists()) {
      let aiOutputKey;
      aiOutputSnapshot.forEach(childSnapshot => {
        aiOutputKey = childSnapshot.key;
      });

      // Update the AI output as sent to all
      await db.ref(`aiOutputs/${aiOutputKey}`).update({
        sent: true,
        recipientUserId: 'all',
        sentToAll: true,
      });

      res.json({ message: 'AI output sent to all participants.' });
    } else {
      res.json({ message: 'No unsent AI outputs available.' });
    }
  } catch (error) {
    console.error('Error sending AI output to all participants:', error);
    res.status(500).json({ error: 'Failed to send AI output to all participants' });
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

      // Fetch AI outputs


      let aiOutputContent = null;
      let recipientUserId = null;
      let aiOutputTimestamp = null;

      // Fetch admin messages
      const adminMessagesRef = db.ref('adminMessages');
      const adminMessagesSnapshot = await adminMessagesRef.orderByChild('timestamp').limitToLast(1).once('value');
      let latestAdminMessage = null;
      let adminMessageTimestamp = null;

      adminMessagesSnapshot.forEach(childSnapshot => {
          const adminMessage = childSnapshot.val();
          latestAdminMessage = adminMessage;
          adminMessageTimestamp = adminMessage.timestamp;
      });

      // Determine whether to show the admin message or the AI output
      let adminMessageToSend = null;
      if (adminMessageTimestamp && (!aiOutputTimestamp || adminMessageTimestamp > aiOutputTimestamp)) {
          adminMessageToSend = latestAdminMessage;
      }

      const aiOutputsRef = db.ref('aiOutputs');
      const aiOutputsSnapshot = await aiOutputsRef.once('value');
      const aiOutputs = [];
      aiOutputsSnapshot.forEach(childSnapshot => {
        const aiOutput = childSnapshot.val();
        aiOutputs.push({
          output: aiOutput.output,
          timestamp: aiOutput.timestamp,
          sent: aiOutput.sent,
          recipientUserId: aiOutput.recipientUserId || null,
        });
      });

      res.json({
        submissions,
        lastProcessedTimestamp,
        preprompts,
        selectedPreprompt,
        activeUserCount,
        aiOutputContent: latestAiOutput ? latestAiOutput.output : null,
        recipientUserId: latestAiOutput ? latestAiOutput.recipientUserId : null,
        adminMessage: adminMessageToSend,
        aiOutputs, // Include AI outputs
      });
  } catch (error) {
    console.error('Error fetching admin updates from database:', error);
    res.status(500).json({ error: 'Failed to fetch admin updates' });
  }
});


app.get('/get-updates', async (req, res) => {
  try {
    const userId = req.query.userId;
    const currentTime = Date.now();

    // Update user's last active timestamp
    await db.ref(`userActivity/${userId}`).set({
      lastActive: currentTime,
    });

    // Fetch AI outputs sent to the user or to all participants
    const aiOutputsRef = db.ref('aiOutputs');
    const aiOutputsSnapshot = await aiOutputsRef
      .orderByChild('sent')
      .equalTo(true)
      .once('value');

    let latestAiOutput = null;
    aiOutputsSnapshot.forEach(childSnapshot => {
      const aiOutput = childSnapshot.val();
      if (
        aiOutput.recipientUserId === userId ||
        aiOutput.recipientUserId === 'all'
      ) {
        if (
          !latestAiOutput ||
          aiOutput.timestamp > latestAiOutput.timestamp
        ) {
          latestAiOutput = aiOutput;
        }
      }
    });

    // Fetch the latest admin message
    const adminMessagesRef = db.ref('adminMessages');
    const adminMessagesSnapshot = await adminMessagesRef
      .orderByChild('timestamp')
      .limitToLast(1)
      .once('value');
    let latestAdminMessage = null;
    let adminMessageTimestamp = null;

    adminMessagesSnapshot.forEach(childSnapshot => {
      const adminMessage = childSnapshot.val();
      latestAdminMessage = adminMessage;
      adminMessageTimestamp = adminMessage.timestamp;
    });

    // Determine whether to show the admin message or the AI output
    let adminMessageToSend = null;
    if (
      adminMessageTimestamp &&
      (!latestAiOutput || adminMessageTimestamp > latestAiOutput.timestamp)
    ) {
      adminMessageToSend = latestAdminMessage;
    }

    res.json({
      aiOutputContent: latestAiOutput ? latestAiOutput.output : null,
      recipientUserId: latestAiOutput ? latestAiOutput.recipientUserId : null,
      adminMessage: adminMessageToSend,
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
