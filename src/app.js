const { App, ExpressReceiver } = require('@slack/bolt');
const config = require('./config');
const database = require('./database');
const utils = require('./utils');
const slackEvents = require('./slackEvents');
const slackCommands = require('./slackCommands');
const cronJobs = require('./cron');

const receiver = new ExpressReceiver({
  signingSecret: config.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events',
});

const app = new App({
  token: config.SLACK_BOT_TOKEN,
  receiver,
});

// Initialize event handlers
slackEvents.init(app);

// Initialize command handlers
slackCommands.init(app);

// Initialize cron jobs
cronJobs.init(app);

// Error logging
app.error((error) => {
  console.error('An error occurred:', error);
});

// Start the app
(async () => {
  try {
    // Get the bot's user ID and name when the app starts
    const botInfo = await utils.getBotInfo(app);
    if (!botInfo) {
      throw new Error('Failed to get bot info');
    }

    await app.start(config.PORT || 8080);
    console.log(`⚡️ Fitness Slack bot is running with optimized interactions! Bot User ID: ${botInfo.botUserId}, Bot Name: ${botInfo.botName}`);
  } catch (error) {
    console.error('Failed to start app:', error);
  }
})();