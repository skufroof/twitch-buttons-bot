const { getPool } = require('../config/database');

class User {
    static async findByTwitchId(twitchId) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM users WHERE twitch_id = $1',
            [twitchId]
        );
        return result.rows[0];
    }

    static async findById(id) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }

    static async findByUsername(username) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0];
    }

    static async create(userData) {
        const pool = getPool();
        const result = await pool.query(
            `INSERT INTO users (twitch_id, username, display_name, email, profile_image, access_token, refresh_token, token_expiry)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                userData.twitchId,
                userData.username,
                userData.displayName,
                userData.email,
                userData.profileImage,
                userData.accessToken,
                userData.refreshToken,
                userData.tokenExpiry
            ]
        );
        return result.rows[0];
    }

    static async update(id, updates) {
        const pool = getPool();
        const fields = [];
        const values = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }

        values.push(id);
        const result = await pool.query(
            `UPDATE users SET ${fields.join(', ')}, last_login = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return result.rows[0];
    }

    static async findAllActive() {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM users WHERE is_bot_active = true'
        );
        return result.rows;
    }
}

module.exports = User;