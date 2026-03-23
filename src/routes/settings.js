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

router.get('/', ensureAuthenticated, async (req, res) => {
    try {
        const settings = await Settings.getOrCreate(req.user.id);
        
        // Convert to camelCase for frontend
        res.json({
            messageInterval: settings.message_interval,
            messagesBetween: settings.messages_between,
            sendOnlyWhenOnline: settings.send_only_when_online,
            sendFirstMessageImmediately: settings.send_first_message_immediately,
            messageTemplate: settings.message_template
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/', ensureAuthenticated, async (req, res) => {
    try {
        const updates = {};
        
        if (req.body.messageInterval !== undefined) updates.message_interval = req.body.messageInterval;
        if (req.body.messagesBetween !== undefined) updates.messages_between = req.body.messagesBetween;
        if (req.body.sendOnlyWhenOnline !== undefined) updates.send_only_when_online = req.body.sendOnlyWhenOnline;
        if (req.body.sendFirstMessageImmediately !== undefined) updates.send_first_message_immediately = req.body.sendFirstMessageImmediately;
        if (req.body.messageTemplate !== undefined) updates.message_template = req.body.messageTemplate;
        
        const settings = await Settings.update(req.user.id, updates);
        await twitchBotManager.refreshBot(req.user.id);
        
        res.json({
            messageInterval: settings.message_interval,
            messagesBetween: settings.messages_between,
            sendOnlyWhenOnline: settings.send_only_when_online,
            sendFirstMessageImmediately: settings.send_first_message_immediately,
            messageTemplate: settings.message_template
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;