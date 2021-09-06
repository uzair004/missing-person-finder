let mongoose = require('mongoose');

// Person Schema // Person can be either Missing or Found
let personSchema = mongoose.Schema({
	Name: {
		type: String,
		required: true
	},
	Image: {
		url: { type: String },
		public_id: { type: String }
	},
	Body: {
		type: String,
		required: true
	},
	Country: {
		type: String,
		required: true
	},
	Address: {
		type: String,
		required: true
	},
	MentalStatus: {
		type: Boolean,
		required: true
	},
	SkinColor: {
		type: String,
		required: true
	},
	EyeColor: {
		type: String,
		required: true
	},
	Hair: {
		type: String,
		required: true
	},
	DateOfMissing: {
		type: Date,
		required: true
	},
	Gender: {
		type: String,
		required: true
	},
	CurrentStatus: {
		type: String,
		required: true
	},
	Description: {
		type: String,
		required: true
	},
	Author: {
		type: String,
		required: true
	},
	body: {
		type: String
	},
	Age: {
		type: Number,
		required: true
	}
});

personSchema.path('Image.url').validate((val) => {
	urlRegex = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
	if (urlRegex.test(val)) {
		return true;
	} else {
		return false;
	}
}, 'Invalid URL.');

let Person = module.exports = mongoose.model('Person', personSchema);