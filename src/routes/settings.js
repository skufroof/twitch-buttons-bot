const express = require('express');
const Settings = require('../models/Settings');
const twitchBotManager = require('../services/twitchBot');
const router = express.Router();

const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Not authenticated' });
};

// Get settings
router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        let settings = await Settings.findOne({ userId: req.user._id });
        
        if (!settings) {
            settings = new Settings({ userId: req.user._id });
            await settings.save();
        }
        
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings
router.put('/', ensureAuthenticated, async (req, res) => {
    try {
        let settings = await Settings.findOne({ userId: req.user._id });
        
        if (!settings) {
            settings = new Settings({ userId: req.user._id });
        }
        
        const allowedUpdates = ['messageInterval', 'messagesBetween', 'sendOnlyWhenOnline', 'sendFirstMessageImmediately', 'messageTemplate'];
        
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                settings[field] = req.body[field];
            }
        });
        
        await settings.save();
        
        // Refresh bot
        await twitchBotManager.refreshBot(req.user._id.toString());
        
        res.json(settings);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;