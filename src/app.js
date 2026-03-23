require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch').Strategy;
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const MongoStore = require('connect-mongo');
const chalk = require('chalk');

const connectDB = require('./config/database');
const User = require('./models/User');
const Settings = require('./models/Settings');
const twitchBotManager = require('./services/twitchBot');

// Import routes
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

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 30 * 24 * 60 * 60 // 30 days
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
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
        let user = await User.findOne({ twitchId: profile.id });
        
        if (!user) {
            user = new User({
                twitchId: profile.id,
                username: profile.login,
                displayName: profile.display_name,
                email: profile.email,
                profileImage: profile.profile_image_url,
                accessToken: accessToken,
                refreshToken: refreshToken,
                tokenExpiry: new Date(Date.now() + 3600 * 1000)
            });
            await user.save();
            
            // Create default settings for new user
            await Settings.create({ userId: user._id });
        } else {
            user.accessToken = accessToken;
            user.refreshToken = refreshToken;
            user.lastLogin = new Date();
            await user.save();
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

// Serve dashboard
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

// API endpoint to get user data
app.get('/api/user', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({
            username: user.username,
            displayName: user.displayName,
            profileImage: user.profileImage,
            isBotActive: user.isBotActive
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API endpoint to toggle bot
app.post('/api/bot/toggle', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        user.isBotActive = !user.isBotActive;
        await user.save();
        
        if (user.isBotActive) {
            await twitchBotManager.startBot(user);
        } else {
            await twitchBotManager.stopBot(user._id.toString());
        }
        
        res.json({ isBotActive: user.isBotActive });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Middleware to check authentication
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

// Start server and bots
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

// Graceful shutdown
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