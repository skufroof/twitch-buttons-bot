const { getPool } = require('../config/database');

class Button {
    static async findByUserId(userId) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM buttons WHERE user_id = $1 ORDER BY "order"',
            [userId]
        );
        return result.rows;
    }

    static async findByUserIdAndEnabled(userId) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM buttons WHERE user_id = $1 AND enabled = true ORDER BY "order"',
            [userId]
        );
        return result.rows;
    }

    static async findById(id, userId) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT * FROM buttons WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
        return result.rows[0];
    }

    static async create(buttonData) {
        const pool = getPool();
        const result = await pool.query(
            `INSERT INTO buttons (user_id, button_id, text, url, color, text_color, font, font_size, icon, "order")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                buttonData.userId,
                buttonData.id,
                buttonData.text,
                buttonData.url,
                buttonData.color,
                buttonData.textColor,
                buttonData.font,
                buttonData.fontSize,
                buttonData.icon,
                buttonData.order || 0
            ]
        );
        return result.rows[0];
    }

    static async update(id, userId, updates) {
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
        values.push(userId);
        
        const result = await pool.query(
            `UPDATE buttons SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} 
             RETURNING *`,
            values
        );
        return result.rows[0];
    }

    static async delete(id, userId) {
        const pool = getPool();
        const result = await pool.query(
            'DELETE FROM buttons WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );
        return result.rows[0];
    }

    static async countByUserId(userId) {
        const pool = getPool();
        const result = await pool.query(
            'SELECT COUNT(*) FROM buttons WHERE user_id = $1',
            [userId]
        );
        return parseInt(result.rows[0].count);
    }

    static async reorder(userId, buttonOrders) {
        const pool = getPool();
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            for (const { id, order } of buttonOrders) {
                await client.query(
                    'UPDATE buttons SET "order" = $1 WHERE id = $2 AND user_id = $3',
                    [order, id, userId]
                );
            }
            
            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}

module.exports = Button;