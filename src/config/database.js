const { Pool } = require('pg');
const chalk = require('chalk');

let pool = null;

const connectDB = async () => {
    try {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test connection
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        
        console.log(chalk.green(`✅ PostgreSQL connected at ${result.rows[0].now}`));
        
        // Create tables if they don't exist
        await initTables();
        
        return pool;
    } catch (error) {
        console.error(chalk.red('❌ PostgreSQL connection error:'), error.message);
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
        // Retry connection after 5 seconds
        setTimeout(connectDB, 5000);
    }
};

const initTables = async () => {
    const client = await pool.connect();
    try {
        // Users table
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                twitch_id VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255) NOT NULL,
                display_name VARCHAR(255),
                email VARCHAR(255),
                profile_image TEXT,
                access_token TEXT NOT NULL,
                refresh_token TEXT,
                token_expiry TIMESTAMP,
                is_bot_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Buttons table
        await client.query(`
            CREATE TABLE IF NOT EXISTS buttons (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                button_id VARCHAR(100) NOT NULL,
                text VARCHAR(255) NOT NULL,
                url TEXT NOT NULL,
                color VARCHAR(7) DEFAULT '#9146FF',
                text_color VARCHAR(7) DEFAULT '#FFFFFF',
                font VARCHAR(100) DEFAULT 'Arial',
                font_size VARCHAR(20) DEFAULT '14px',
                icon VARCHAR(10) DEFAULT '🔘',
                "order" INTEGER DEFAULT 0,
                enabled BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, button_id)
            )
        `);

        // Settings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                message_interval INTEGER DEFAULT 300,
                messages_between INTEGER DEFAULT 5,
                send_only_when_online BOOLEAN DEFAULT true,
                send_first_message_immediately BOOLEAN DEFAULT true,
                message_template TEXT DEFAULT '✨ Check out our links: {buttons} ✨',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_buttons_user_id ON buttons(user_id);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_twitch_id ON users(twitch_id);
        `);

        console.log(chalk.green('✅ Database tables initialized'));
    } catch (error) {
        console.error(chalk.red('Error creating tables:'), error);
        throw error;
    } finally {
        client.release();
    }
};

const getPool = () => {
    if (!pool) {
        throw new Error('Database not connected. Call connectDB first.');
    }
    return pool;
};

module.exports = { connectDB, getPool };