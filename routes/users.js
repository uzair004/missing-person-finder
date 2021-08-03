const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { check, validationResult } = require('express-validator');
const passport = require('passport');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2
const cloudinaryConfig = require('../config/cloudinaryConfig');
const DatauriParser = require('datauri/parser');

const userFolderPath = "Missing_Person_Finder/user_images/"

const parser = new DatauriParser();
// convert buffer to base64 uri
const dataUri = req => parser.format(path.extname(req.file.originalname).toString(), req.file.buffer);

// Bring in User Model
let User = require('../models/user');

// Access Control
function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated()) {
		return next();
	} else {
		req.flash('danger', 'Please login');
		res.redirect('/users/login');
	}
}

// Set storage engine (system memory)
const storage = multer.memoryStorage();

// Init Upload
const upload = multer({
	storage: storage,
	limits: { fileSize: 5000000 },
	fileFilter: function (req, file, cb) {
		checkFileType(file, cb);
	}
}).single('file');

// ---------- ROUTES --------------

// Register Form
router.get('/register', function (req, res) {
	res.render('register');
});

// Register Process
router.post('/register', upload, cloudinaryConfig, [
	check('name', 'Name is required').notEmpty(),
	check('email', 'Email is required').notEmpty(),
	check('email', 'Email is not valid').isEmail(),
	check('username', 'Username is required').notEmpty(),
	check('password', 'Password is required').notEmpty(),
	check('password2', 'Passwords do not match').custom((value, { req, loc, path }) => {
		if (value !== req.body.password) {
			// trow error if passwords do not match
			throw new Error("Passwords don't match");
		} else {
			return value;
		}
	}).bail(),
	check('email', 'email already in use').custom((value, { req, loc, path }) => {
		return User.findOne({ "email": req.body.email }).then(foundUser => {
			if (foundUser) {
				return Promise.reject('E-mail already in use')
			} else {
				Promise.resolve(value);
			}
		})
	}).bail(),
	check('username', 'username already taken').custom((value, { req, loc, path }) => {
		return User.findOne({ "username": req.body.username }).then(foundUser => {
			if (foundUser) {
				return Promise.reject('Username already taken');
			} else {
				Promise.resolve(value);
			}
		})
	}),
], async function (req, res) {
	if (req.file == undefined) {
		res.render('register', {
			Photoerror: "Please upload Profile Image"
		});
	} else {

		const { name, email, contact, username, password, password2 } = req.body;

		// convert image buffer to base64
		const imgAsBase64 = dataUri(req).content;

		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			res.render('register', {
				errors: errors.array()
			});
		} else {
			let newUser = new User({
				name: name,
				email: email,
				contact: contact,
				username: username,
				password: password,
				file: {},
				MissingPerson: 0,
				FoundPerson: 0,
				Articles: 0
			});

			// hash password
			newUser.password = await bcrypt.hash(newUser.password, 10);

			// upload image to cloudinary and save doc to database
			cloudinary.uploader.upload(imgAsBase64, { folder: userFolderPath })
				.then(result => {
					newUser.file.url = result.url;
					newUser.file.public_id = result.public_id;
					// save in mongoDB
					newUser.save()
						.then(result => {
							req.flash('success', 'You are now registered and can log in');
							res.redirect('/users/login');
						})
						.catch(err => console.error(`error while saving to database`, err));
				})
				.catch(err => console.error(`error while uploading to cloudinary`, err))
		}
	}
});

// Login Form
router.get('/login', function (req, res) {
	res.render('login');
});
// Login Process
router.post('/login', function (req, res, next) {
	passport.authenticate('local', {
		successRedirect: '/',
		failureRedirect: '/users/login',
		failureFlash: true
	})(req, res, next);
});

// Logout
router.get('/logout', function (req, res) {
	req.logout();
	req.flash('danger', 'You are logged out');
	res.redirect('/users/login');
});

// Profile
router.get('/profile', function (req, res) {
	res.render('profile')
});

// Update User Profile Route
router.post('/profile/:id', ensureAuthenticated, upload, cloudinaryConfig, [
	check('name', 'Name is required').notEmpty(),
	check('email', 'Email is required').notEmpty(),
	check('email', 'Email is not valid').isEmail(),
	check('contact', 'Contact Number is required').notEmpty(),
	check('password', 'Password is required').notEmpty(),
	check('password2', 'Passwords do not match').custom((value, { req, loc, path }) => {
		if (value !== req.body.password) {
			// trow error if passwords do not match
			throw new Error("Passwords don't match");
		} else {
			return value;
		}
	}).bail(),
	check('email', 'email already in use').custom((value, { req, loc, path }) => {
		return User.findOne({ "email": req.body.email }).then(foundUser => {
			if (foundUser && (foundUser._id != req.params.id)) {
				return Promise.reject('E-mail already in use')
			} else {
				Promise.resolve(value);
			}
		})
	}),
], async function (req, res) {
	if (req.body.oldFileCheck == '' && req.file == undefined) {
		res.render('profile', {
			Photoerror: "Please Re-upload Profile Image or Change the image",
			user: User
		});
	} else {
		let userProfile = {};
		userProfile.name = req.body.name;
		userProfile.email = req.body.email;
		userProfile.contact = req.body.contact;
		userProfile.password = req.body.password;

		const errors = validationResult(req);

		if (!errors.isEmpty()) {
			res.render('profile', {
				errors: errors.array(),
				user: userProfile
			});
		} else {
			let query = { _id: req.params.id };

			// hash password
			userProfile.password = await bcrypt.hash(userProfile.password, 10);

			// use old image if available
			if (req.body.oldFileCheck != '' && req.file === undefined) {
				userProfile.file = JSON.parse(req.body.oldFileCheck);
				updateUserandRedirect(query, userProfile, req, res)

			} else {
				// convert image buffer to base64
				const imgAsBase64 = dataUri(req).content;

				// delete old image from cloudinary
				User.findOne({ _id: req.params.id })
					.then(foundUser => {
						cloudinary.uploader.destroy(foundUser.file.public_id)
							.catch(err => console.error(`error while deleting image from cloudinary`, err))
					}).catch(err => console.error(`error while finding user`, err));

				// upload image to cloudinary and save doc to database
				cloudinary.uploader.upload(imgAsBase64, { folder: userFolderPath })
					.then(result => {
						userProfile.file = {};
						userProfile.file.url = result.url;
						userProfile.file.public_id = result.public_id;
						// save in mongoDB
						updateUserandRedirect(query, userProfile, req, res);
					})
					.catch(err => console.error(`error while uploading to cloudinary`, err))
			}

		}
	}
});

// ----------- Functions ------------


// updated user in database and redirect
function updateUserandRedirect(query, userProfile, req, res) {
	User.updateOne(query, userProfile)
		.then(response => {
			req.flash('success', 'Profile Updated Successfully');
			res.redirect('/users/profile/');
			user: userProfile
			return;
		})
		.catch(err => console.error(`error while updating doc`, err))
}

// Check File Type
function checkFileType(file, cb) {
	// Allowed ext
	const filetypes = /jpeg|jpg|png|gif/;
	// Check ext
	const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
	// Check mime
	const mimetype = filetypes.test(file.mimetype);

	if (mimetype && extname) {
		return cb(null, true);
	} else {
		cb('Error: Images Only!');
	}
}


module.exports = router;