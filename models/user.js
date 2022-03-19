const mongoose = require('mongoose');

// User Schema
const UserSchema = mongoose.Schema({
	name: {
		type: String,
		required: true
	},
	email: {
		type: String,
		required: true
	},
	contact: {
		type: String,
		required: true
	},
	password: {
		type: String,
		required: true
	},
	file: {
		url: { type: String },
		public_id: { type: String }
	},
	Articles: {
		type: Number
	},
	MissingPerson: {
		type: Number
	},
	role: {
		type: String,
		required: false,
		default: 'customer'
	}
});

UserSchema.path('file.url').validate((val) => {
	urlRegex = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
	if (urlRegex.test(val)) {
		return true;
	} else {
		return false;
	}
}, 'Invalid URL.');

const User = module.exports = mongoose.model('User', UserSchema);