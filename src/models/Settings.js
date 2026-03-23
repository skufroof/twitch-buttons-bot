const { getPool } = require('../config/database');

class Settings {
    static async findByUserId(userId) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM settings WHERE user_id = $1',
            [userId]
        );
        return result.rows[0];
    }

    static async create(userId) {
        const pool = getPool();
        const result = await pool.query(
            `INSERT INTO settings (user_id, message_interval, messages_between, send_only_when_online, send_first_message_immediately, message_template)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                userId,
                300,
                5,
                true,
                true,
                '✨ Check out our links: {buttons} ✨'
            ]
        );
        return result.rows[0];
    }

    static async update(userId, updates) {
        const pool = getPool();
        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }

        values.push(userId);
        
        const result = await pool.query(
            `UPDATE settings SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
             WHERE user_id = $${paramIndex} 
             RETURNING *`,
            values
        );
        
        if (result.rows[0]) {
            return result.rows[0];
        }
        
        // If no settings exist, create them
        return await Settings.create(userId);
    }

    static async getOrCreate(userId) {
        let settings = await Settings.findByUserId(userId);
        if (!settings) {
            settings = await Settings.create(userId);
        }
        return settings;
    }
}

module.exports = Settings;