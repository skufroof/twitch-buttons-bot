require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch').Strategy;
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const PgSession = require('connect-pg-simple')(session);
const chalk = require('chalk');

const { connectDB, getPool } = require('./config/database');
const User = require('./models/User');
const Settings = require('./models/Settings');
const twitchBotManager = require('./services/twitchBot');

const authRoutes = require('./routes/auth');
const buttonRoutes = require('./routes/buttons');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Database
connectDB();

// Middleware
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.APP_URL : 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration with PostgreSQL
app.use(session({
    store: new PgSession({
        pool: getPool(),
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new TwitchStrategy({
    clientID: process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.TWITCH_CLIENT_SECRET,
    callbackURL: process.env.TWITCH_REDIRECT_URI,
    scope: 'user:read:email chat:read chat:edit'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findByTwitchId(profile.id);
        
        if (!user) {
            user = await User.create({
                twitchId: profile.id,
                username: profile.login,
                displayName: profile.display_name,
                email: profile.email,
                profileImage: profile.profile_image_url,
                accessToken: accessToken,
                refreshToken: refreshToken,
                tokenExpiry: new Date(Date.now() + 3600 * 1000)
            });
            
            await Settings.create(user.id);
        } else {
            user = await User.update(user.id, {
                access_token: accessToken,
                refresh_token: refreshToken,
                last_login: new Date()
            });
        }
        
        return done(null, user);
    } catch (error) {
        console.error('Passport error:', error);
        return done(error);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Routes
app.use('/auth', authRoutes);
app.use('/api/buttons', buttonRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/dashboard', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect('/dashboard');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

app.get('/api/user', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({
            username: user.username,
            displayName: user.display_name,
            profileImage: user.profile_image,
            isBotActive: user.is_bot_active
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/bot/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.update(req.user.id, {
            is_bot_active: !req.user.is_bot_active
        });
        
        if (user.is_bot_active) {
            await twitchBotManager.startBot(user);
        } else {
            await twitchBotManager.stopBot(user.id);
        }
        
        res.json({ isBotActive: user.is_bot_active });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        res.status(401).json({ error: 'Not authenticated' });
    } else {
        res.redirect('/');
    }
}

const startServer = async () => {
    try {
        await twitchBotManager.startAllBots();
        
        app.listen(PORT, () => {
            console.log(chalk.green(`\n✅ Server running on http://localhost:${PORT}`));
            console.log(chalk.blue('🤖 Twitch Multi-Buttons Bot is ready!'));
            console.log(chalk.yellow('\n📋 Next steps:'));
            console.log(chalk.white('1. Visit http://localhost:3000'));
            console.log(chalk.white('2. Login with Twitch'));
            console.log(chalk.white('3. Configure your buttons in the dashboard\n'));
        });
    } catch (error) {
        console.error(chalk.red('Failed to start server:'), error);
        process.exit(1);
    }
};

process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\nSIGTERM received, shutting down...'));
    await twitchBotManager.shutdown();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log(chalk.yellow('\nSIGINT received, shutting down...'));
    await twitchBotManager.shutdown();
    process.exit(0);
});

startServer();

module.exports = app;