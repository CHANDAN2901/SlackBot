const cron = require('node-cron');
const dbOps = require('./database').dbOps;
const aiOps = require('./ai');
const utils = require('./utils');

function init(app) {
  // Hourly chat summarization
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly chat summarization');
    const [channels] = await dbOps.pool.query('SELECT DISTINCT channel_id FROM messages WHERE created_at >= NOW() - INTERVAL 1 HOUR');

    for (const channel of channels) {
      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date();
      const [messages] = await dbOps.pool.query('SELECT user_id, content FROM messages WHERE channel_id = ? AND created_at >= ? AND created_at <= ?', [channel.channel_id, startTime, endTime]);

      // Generate channel summary
      const channelSummary = await aiOps.summarizeChat(messages.map(m => m.content));

      if (channelSummary) {
        await dbOps.storeSummary(channel.channel_id, channelSummary, startTime, endTime);
        await app.client.chat.postMessage({
          token: process.env.SLACK_BOT_TOKEN,
          channel: channel.channel_id,
          text: `Here's a summary of the fitness discussion in the last hour:\n\n${channelSummary}`
        });
      }

      // Generate and store user-specific summaries
      const userMessages = {};
      messages.forEach(m => {
        if (!userMessages[m.user_id]) userMessages[m.user_id] = [];
        userMessages[m.user_id].push(m.content);
      });

      for (const [userId, userMsgs] of Object.entries(userMessages)) {
        const userSummary = await aiOps.summarizeChat(userMsgs);
        await dbOps.storeHourlyUserSummary(userId, channel.channel_id, userSummary);
      }
    }
  });

  // Weekly user report generation and email sending
  cron.schedule('0 0 * * 0', async () => {
    console.log('Running weekly user report generation');
    const [users] = await dbOps.pool.query('SELECT user_id, email FROM users');

    for (const user of users) {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      const userMessages = await dbOps.getUserMessages(user.user_id, startDate, endDate);

      if (userMessages.length > 0) {
        const weeklySummary = await aiOps.generateUserWeeklySummary(userMessages);
        await dbOps.storeWeeklyUserSummary(user.user_id, weeklySummary);

        const pdfBuffer = await utils.generatePDF(weeklySummary);

        if (user.email) {
          await utils.sendEmail(
            user.email,
            'Your Weekly Fitness Report',
            'Please find attached your weekly fitness report.',
            [{
              filename: 'weekly_fitness_report.pdf',
              content: pdfBuffer,
              contentType: 'application/pdf'
            }]
          );
          console.log(`Email sent to ${user.email}`);
        } else {
          console.log(`No email found for user ${user.user_id}`);
        }
      } else {
        console.log(`No messages found for user ${user.user_id}`);
      }
    }
  });

  // Schedule database updates every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    console.log('Running scheduled database update');
    await dbOps.updateDatabaseFromCache();
  });
}

module.exports = { init };