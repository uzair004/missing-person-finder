let mongoose = require('mongoose');

// Article Schema
let articleSchema = mongoose.Schema({
	title: {
		type: String,
		required: true
	},
	author: {
		type: String,
		required: true
	},
	body: {
		type: String,
		required: true
	},
	file: {
		url: { type: String },
		public_id: { type: String }
	}

});

articleSchema.path('file.url').validate((val) => {
	urlRegex = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
	if (urlRegex.test(val)) {
		return true;
	} else {
		return false;
	}
}, 'Invalid URL.');

let Article = module.exports = mongoose.model('Article', articleSchema);