const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.DB_HOST,
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0
});

// In-memory cache for user queries
const queryCache = [];

const dbOps = {
  storeUser: async (userId, username, email) => {
    try {
      await pool.query(
        'INSERT INTO users (user_id, username, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE username = ?, email = ?',
        [userId, username, email, username, email]
      );
    } catch (error) {
      console.error('Error storing user:', error);
    }
  },

  storeChannel: async (channelId, channelName) => {
    try {
      await pool.query('INSERT IGNORE INTO channels (channel_id, channel_name) VALUES (?, ?)', [channelId, channelName]);
    } catch (error) {
      console.error('Error storing channel:', error);
    }
  },

  storeMessage: async (userId, channelId, content) => {
    try {
      if (content.length > 2000) {
        content = content.slice(0, 997) + '...';
      }
      const trimmedContent = content.replace(/^<@[A-Z0-9]+>\s*/, '');
      
      // Add to the cache instead of immediate database insertion
      queryCache.push({ userId, channelId, content: trimmedContent });
      
      // If the cache size exceeds the threshold, trigger an immediate database update
      if (queryCache.length >= 100) {
        await updateDatabaseFromCache();
      }
    } catch (error) {
      console.error('Error caching message:', error);
    }
  },

  getLastMessages: async (channelId, limit = 5) => {
    try {
      const [rows] = await pool.query(
        'SELECT content FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?',
        [channelId, limit]
      );
      return rows.map(row => row.content).reverse();
    } catch (error) {
      console.error('Error getting last messages:', error);
      return [];
    }
  },

  storeSummary: async (channelId, content, startTime, endTime) => {
    try {
      await pool.query(
        'INSERT INTO summaries (channel_id, content, start_time, end_time) VALUES (?, ?, ?, ?)',
        [channelId, content, startTime, endTime]
      );
    } catch (error) {
      console.error('Error storing summary:', error);
    }
  },

  storeHourlyUserSummary: async (userId, channelId, summary) => {
    try {
      await pool.query(
        'INSERT INTO user_summaries (user_id, channel_id, content, summary_type) VALUES (?, ?, ?, "hourly")',
        [userId, channelId, summary]
      );
    } catch (error) {
      console.error('Error storing hourly user summary:', error);
    }
  },

  storeWeeklyUserSummary: async (userId, summary) => {
    try {
      await pool.query(
        'INSERT INTO user_summaries (user_id, content, summary_type) VALUES (?, ?, "weekly")',
        [userId, summary]
      );
    } catch (error) {
      console.error('Error storing weekly user summary:', error);
    }
  },

  getUserMessages: async (userId, startDate, endDate) => {
    try {
      const [rows] = await pool.query(
        'SELECT content FROM messages WHERE user_id = ? AND created_at BETWEEN ? AND ?',
        [userId, startDate, endDate]
      );
      return rows.map(row => row.content);
    } catch (error) {
      console.error('Error getting user messages:', error);
      return [];
    }
  },

  getUserEmail: async (userId) => {
    try {
      const [rows] = await pool.query('SELECT email FROM users WHERE user_id = ?', [userId]);
      return rows[0]?.email;
    } catch (error) {
      console.error('Error getting user email:', error);
      return null;
    }
  },

  clearUserContext: async (userId) => {
    try {
      await pool.query('UPDATE users SET last_context = ? WHERE user_id = ?', ['', userId]);
    } catch (error) {
      console.error('Error clearing user context:', error);
    }
  },

  getLastSaveTime: async (userId) => {
    try {
      const [rows] = await pool.query('SELECT last_save_time FROM users WHERE user_id = ?', [userId]);
      return rows[0]?.last_save_time || new Date(0);
    } catch (error) {
      console.error('Error getting last save time:', error);
      return new Date(0);
    }
  },

  saveUserData: async (userId, lastSaveTime) => {
    try {
      const [messages] = await pool.query(
        'SELECT content FROM messages WHERE user_id = ? AND created_at > ? ORDER BY created_at ASC',
        [userId, lastSaveTime]
      );
      
      if (messages.length > 0) {
        const values = messages.map(m => [userId, m.content]);
        await pool.query('INSERT INTO user_data (user_id, content) VALUES ?', [values]);
        await pool.query('UPDATE users SET last_save_time = NOW() WHERE user_id = ?', [userId]);
      }
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  },
};

async function updateDatabaseFromCache() {
  if (queryCache.length === 0) return;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const query of queryCache) {
      await connection.query(
        'INSERT INTO messages (user_id, channel_id, content) VALUES (?, ?, ?)',
        [query.userId, query.channelId, query.content]
      );
    }

    await connection.commit();
    queryCache.length = 0;  // Clear the cache after successful update
  } catch (error) {
    await connection.rollback();
    console.error('Error updating database from cache:', error);
  } finally {
    connection.release();
  }
}

module.exports = {
  dbOps,
  updateDatabaseFromCache
};