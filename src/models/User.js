const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    twitchId: {
        type: String,
        required: true,
        unique: true
    },
    username: {
        type: String,
        required: true,
        lowercase: true
    },
    displayName: {
        type: String,
        required: true
    },
    email: String,
    profileImage: String,
    accessToken: {
        type: String,
        required: true
    },
    refreshToken: String,
    tokenExpiry: Date,
    isBotActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
userSchema.index({ username: 1 });
userSchema.index({ twitchId: 1 });

// Method to check if token needs refresh
userSchema.methods.isTokenExpired = function() {
    return this.tokenExpiry && this.tokenExpiry < new Date();
};

module.exports = mongoose.model('User', userSchema);