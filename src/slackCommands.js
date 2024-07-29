const dbOps = require('./database').dbOps;

function init(app) {
  app.command('/clear', async ({ command, ack, respond }) => {
    try {
      await ack();
      await dbOps.clearUserContext(command.user_id);
      await respond({
        response_type: 'ephemeral',
        text: 'Your conversation context has been cleared.'
      });
    } catch (error) {
      console.error('Error handling /clear command:', error);
      await respond({
        response_type: 'ephemeral',
        text: 'An error occurred while clearing your context. Please try again later.'
      });
    }
  });

  app.command('/save', async ({ command, ack, respond }) => {
    await ack();
    const lastSaveTime = await dbOps.getLastSaveTime(command.user_id);
    await dbOps.saveUserData(command.user_id, lastSaveTime);
    await respond('Your conversation data has been saved.');
  });
}

module.exports = { init };