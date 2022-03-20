const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2
const cloudinaryConfig = require('../config/cloudinaryConfig');
const DatauriParser = require('datauri/parser');
require('dotenv').config();

// comment model
const Comment = require("../models/comment")

const articleFolderPath = "Missing_Person_Finder/article_images/"

const parser = new DatauriParser();
// convert buffer to base64 uri
const dataUri = req => parser.format(path.extname(req.file.originalname).toString(), req.file.buffer);

// Bring in Article Model
let Article = require("../models/article");
// Bring in User Model
let User = require("../models/user");

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

// -------------- ROUTES --------------

// Add Route
router.get('/add', ensureAuthenticated, function (req, res) {
	res.render('add_article', {
		title: 'Add Article'
	})
});

// Get Single Article
router.get('/:id', function (req, res) {
	Article.findById(req.params.id).then(foundArticle => {
		User.findById(foundArticle.author).then(foundAuthor => {
			Comment.find({articleId: foundArticle._id}).then(foundComments => {
				res.render('article', {
					article: foundArticle,
					author: foundAuthor.name,
					comments: foundComments
				});
			})
		}).catch(err => console.error(`error while find user by id`, err))
	}).catch(err => console.error(`error while find article by id`, err))
});

// Load Edit Form
router.get('/edit/:id', ensureAuthenticated, function (req, res) {
	Article.findOne({ _id: req.params.id })
		.then(foundArticle => {
			if (foundArticle.author != req.user._id) {
				req.flash('danger', 'Not Authorized...');
				res.redirect('/');
			} else {
				res.render('edit_article', {
					article: foundArticle
				});
			}
		})
		.catch(err => console.error(`error while finding article`, err));
});

// Update Submit POST Route
router.post('/edit/:id', ensureAuthenticated, upload, cloudinaryConfig, [
	check('title', 'Title is required').notEmpty().escape(),
	check('body', 'Body is required').notEmpty().escape(),
], function (req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.render('edit_article', {
			errors: errors.array()
		});
	} else {
		let query = { _id: req.params.id };
		let updatedArticle = {};
		updatedArticle.title = req.body.title;
		updatedArticle.body = req.body.body;
		// no new pic uploaded but older exist
		if (req.body.oldFileCheck != '' && req.file === undefined) {
			updatedArticle.file = JSON.parse(req.body.oldFileCheck);
			updateArticleandRedirect(query, updatedArticle, req, res);
			// no pic 
		} else if (req.file === undefined) {
			delete updatedArticle.file;
			updateArticleandRedirect(query, updatedArticle, req, res);
		}
		else {
			// convert image buffer to base64
			const imgAsBase64 = dataUri(req).content;
			let query = { _id: req.params.id };
			Article.findById(query)
				.then(Doc => {
					// delete article image from cloudinary
					if (Doc.file.public_id) {
						cloudinary.uploader.destroy(Doc.file.public_id).catch(err => console.error(`error while deleting pic`, err));
					}
					// upload new article pic to cloudinary
					cloudinary.uploader.upload(imgAsBase64, { folder: articleFolderPath })
						.then(result => {
							updatedArticle.file = Doc.file || {};
							updatedArticle.file.url = result.url;
							updatedArticle.file.public_id = result.public_id;
							// update the article in db
							updateArticleandRedirect(query, updatedArticle, req, res);
						})
				})
				.catch(err => console.error(`error while looking for doc`, err));
		}
	}
});

// Delete Article
router.delete('/:id', ensureAuthenticated, cloudinaryConfig, function (req, res) {
	let query = { _id: req.params.id };
	Article.findById(query)
		.then(Doc => {
			// image public id exist (used to delete image in cloudinary)
			if (Doc.file.public_id) {
				// delete article image from cloudinary
				cloudinary.uploader.destroy(Doc.file.public_id).then(result => {
					// delete article from db
					Article.deleteOne(query).then(deletedArticle => {
						req.flash('danger', 'Article Deleted');
						res.send('Success');
					}).catch(err => console.error(`error while deleting article from db`, err))
				})
			} else {
				Article.deleteOne(query).then(deletedArticle => {
					req.flash('danger', 'Article Deleted');
					res.send('Success');
				}).catch(err => console.error(`error while deleting article from db`, err))
			}

		})
		.catch(err => console.error(`error while find article by id`, err));
});

// Add Submit POST Route
router.post('/add', ensureAuthenticated, upload, cloudinaryConfig, [
	check('title', 'Title is required').notEmpty().escape(),
	check('body', 'Body is required').notEmpty().escape()
], function (req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.render('add_article', {
			title: 'Add Article',
			errors: errors.array()
		});
	} else {
		let article = new Article();
		article.title = req.body.title;
		article.author = req.user._id;
		article.body = req.body.body;
		// if no image in article
		if (req.file === undefined) {
			article.save()
				.then(result => {
					req.flash('success', 'Article Added');
					res.redirect('/');
				})
				.catch(err => console.error(`error whilie saving to database`, err));
		} else {
			// convert image buffer to base64
			const imgAsBase64 = dataUri(req).content;
			// upload image to Cloudinary and save doc to mongodb
			uploadImageAndSaveDoc(req, imgAsBase64, article, res);
		}
		// increase author article counts by 1
		let userUpdate = {};
		userUpdate.Articles = req.user.Articles + 1;
		let query = { _id: req.user._id };
		User.updateOne(query, userUpdate, function (err) {
			if (err) {
				console.error(`error while updating the articles count`, err);
				return;
			}
		});
	}
});


// add comment POST route
router.post("/:id/comments/:userId", ensureAuthenticated, [
	// check('comment', "Cannot post empty comments").notEmpty().escape(),
	// check('comment', "Cannot post empty comments").isLength(2)
], async function(req, res) {

	const {id, userId} = req.params;
	const {text} = req.body;

	const foundArticle = await Article.findById(id);
	if(!foundArticle) {
		return res.redirect('/');
	}

	const foundAuthor = await User.findById(foundArticle.author);

	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.render('article', {
			article: foundArticle,
			author: foundAuthor.name,
			errors: errors.array()
		})
	}

	let newComment = new Comment({
		articleId: id,
		authorUsername: foundAuthor.name,
		authorId: foundAuthor.id,
		text: text
	});

	await newComment.save();

	res.redirect(`/articles/${id}`);


})

// ----------- Functions ----------------

// Check File Type
function checkFileType(file, cb) {
	// Allowed ext
	const filetypes = /jpeg|jpg|png|gif/;
	// Check ext
	const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
	// Check mime
	const mimetype = filetypes.test(file.mimetype);

	if (mimetype && extname) {
		return cb('', true);
	} else {
		cb('Error: Images Only!');
	}
}

// updated article in database and redirect user to homepage
function updateArticleandRedirect(query, updatedArticle, req, res) {
	Article.updateOne(query, updatedArticle)
		.then(response => {
			req.flash('success', 'Article Updated');
			res.redirect('/');
			return;
		})
		.catch(err => console.error(`error while updating doc`, err))
}

// upload image to cloudinary and save doc to mongoDb
function uploadImageAndSaveDoc(req, imgAsBase64, article, res) {
	// upload image buffer to cloudinary
	cloudinary.uploader.upload(imgAsBase64, { folder: articleFolderPath })
		.then((result) => {
			article.file.url = result.url;
			article.file.public_id = result.public_id;
			// save in mongoDB
			article.save()
				.then(result => {
					req.flash('success', 'Article Added');
					res.redirect('/');
				})
				.catch(err => console.error(`error while saving to database`, err));

		})
		.catch(err => console.error('something went wrong while uploading to Cloudinary', err))
}

module.exports = router;
