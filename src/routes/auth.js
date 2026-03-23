const express = require('express');
const passport = require('passport');
const router = express.Router();

router.get('/twitch', passport.authenticate('twitch'));

router.get('/twitch/callback', 
    passport.authenticate('twitch', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

router.get('/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            id: req.user._id,
            username: req.user.username,
            displayName: req.user.displayName,
            profileImage: req.user.profileImage
        });
    } else {
        res.status(401).json({ error: 'Not authenticated' });
    }
});

module.exports = router;