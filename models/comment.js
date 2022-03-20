let mongoose = require('mongoose');

// Article Schema
let commentSchema = mongoose.Schema({
	articleId: {
        type: mongoose.ObjectId,
        ref: 'articles',
        required: true,
    },
    authorId: {
        type: mongoose.ObjectId,
        ref: 'users',
        required: true
    },
    authorUsername: {
        type: String,
        required: true,
    },
    text: {
        type: String,
        required: true,
    },

});

let Comment = module.exports = mongoose.model('Comment', commentSchema);