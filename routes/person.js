const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { check, validationResult } = require('express-validator');
const cloudinary = require('cloudinary').v2
const cloudinaryConfig = require('../config/cloudinaryConfig');
const DatauriParser = require('datauri/parser');

const imageProcessor = require('../config/imageProcessingConfig').main;
const writeToFile = require('../config/imageProcessingConfig').writeToFile;
const facesDB = require('../config/imageProcessingConfig').facesDB;

// worker threads pool
const { StaticPool } = require('node-worker-threads-pool');
const workerFilePath = path.join(process.cwd(), 'config', 'imageSearchWorker.js');
const staticPool = new StaticPool({
	size: 3,
	task: workerFilePath,
	workerData: facesDB
});

const personFolderPath = "Missing_Person_Finder/person_images/"

const parser = new DatauriParser();
// convert buffer to base64 uri
const dataUri = req => parser.format(path.extname(req.file.originalname).toString(), req.file.buffer);


// Bring in User Model
let User = require("../models/user");
// Bring in Person Model
let Person = require("../models/person");
const { promises } = require('dns');

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

// ----------- ROUTES -------------

// Add Missing Person Route
router.get('/add/missing/', ensureAuthenticated, function (req, res) {
	res.render('add_missing_person', {

	});
});

// Add Missing Person Process
router.post('/missing/:id', ensureAuthenticated, upload, cloudinaryConfig, [
	check('name', 'Name is required').notEmpty(),
	check('age', 'age is required').notEmpty(),
	check('weight', 'Weight is required').notEmpty(),
	check('country', 'Country is required').notEmpty(),
	check('city', 'City is required').notEmpty(),
	check('description', 'Description is required').notEmpty(),
	check('dateOfMissing', 'Date of Missing is required').notEmpty(),
	check('dateOfMissing').custom((value, { req, location, path }) => {
		if (new Date() < new Date(req.body.dateOfMissing)) {
			throw new Error('date cannot be in future');
		}
		return true;
	}),
], async function (req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.render('add_missing_person', {
			errors: errors.array(),
			user: req.user
		});
	} else {
		const { name, age, weight, country, city, dateOfMissing,
			gender, mentalStatus, skinColor, eyeColor, hair, currentStatus,
			body, height, description } = req.body;

		let newPerson = new Person({
			Name: name,
			Body: body,
			Age: age,
			Height: height,
			Weight: weight,
			Country: country,
			City: city,
			MentalStatus: mentalStatus,
			SkinColor: skinColor,
			EyeColor: eyeColor,
			Hair: hair,
			DateOfMissing: dateOfMissing,
			Gender: gender,
			CurrentStatus: currentStatus,
			Description: description,
			Author: req.user._id
		});
		// if no image of missing person added
		if (req.file === undefined) {
			res.render('add_missing_person', {
				user: req.user,
				Photoerror: "Please upload image",
			});
			return;
		} else {
			// convert image buffer to base64
			const imgAsBase64 = dataUri(req).content;

			// upload image to Cloudinary and save doc to mongodb
			let done = await uploadImageAndSaveDoc(req, imgAsBase64, newPerson, res);

			if (done) {
				// increase user person counts by 1
				let query = { _id: req.params.id };
				let userUpdate = {};
				userUpdate.MissingPerson = req.user.MissingPerson + 1;
				User.updateOne(query, userUpdate)
					.catch(err => console.error(`error while updating user person count`, err))
			}

		}
	}
});

// Edit Missing Person1
router.get('/edit/missing/:id', ensureAuthenticated, function (req, res) {
	Person.find({ "Author": req.params.id })
		.then(foundPerson => {
			res.render('edit_person1', {
				person: foundPerson,
				user: req.user
			});
		})
		.catch(err => console.error(`error while find person`, err));
});

// Load Individual Person Edit Form
router.get('/edit/:id', ensureAuthenticated, function (req, res) {
	Person.findById(req.params.id)
		.then(foundPerson => {
			res.render('edit_person2', {
				person: foundPerson,
				title: "Edit Person"
			});
		})
		.catch(err => console.error(`error while finding person`, err));
});

// Update Missing Person Process
router.post('/edit/:id', ensureAuthenticated, upload, cloudinaryConfig, [
	check('name', 'Name is required').notEmpty(),
	check('age', 'age is required').notEmpty(),
	check('weight', 'Weight is required').notEmpty(),
	check('country', 'Country is required').notEmpty(),
	check('city', 'City is required').notEmpty(),
	check('description', 'Description is required').notEmpty()
], function (req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.render('edit_person2', {
			errors: errors.array(),
			user: req.user
		});
	} else {
		let query = { _id: req.params.id };

		let updatePerson = {};
		updatePerson.Name = req.body.name;
		updatePerson.Body = req.body.body;
		updatePerson.Age = req.body.age;
		updatePerson.Height = req.body.height;
		updatePerson.Weight = req.body.weight;
		updatePerson.Country = req.body.country;
		updatePerson.City = req.body.city;
		updatePerson.MentalStatus = req.body.mentalStatus;
		updatePerson.SkinColor = req.body.skinColor;
		updatePerson.EyeColor = req.body.eyeColor;
		updatePerson.Hair = req.body.hair;
		updatePerson.Gender = req.body.gender;
		updatePerson.CurrentStatus = req.body.currentStatus;
		updatePerson.Description = req.body.description;

		// no new image uploaded, but older exist
		if (req.body.oldFileCheck != '' && req.file === undefined) {
			updatePerson.file = JSON.parse(req.body.oldFileCheck);
			updatePersonandRedirect(query, updatePerson, req, res);
			// no pic at all
		} else if (req.file === undefined) {
			delete updatePerson.file;
			updatePersonandRedirect(query, updatePerson, req, res);
		}
		else {
			// convert image buffer to base64
			const imgAsBase64 = dataUri(req).content;

			Person.findById(query)
				.then(Doc => {

					// delete person image from cloudinary
					if (Doc.Image.public_id) {
						cloudinary.uploader.destroy(Doc.Image.public_id).catch(err => console.error(`error while deleting pic`, err));
					}

					// upload person new pic to cloudinary
					cloudinary.uploader.upload(imgAsBase64, { folder: personFolderPath })
						.then(result => {
							updatePerson.Image = {};
							updatePerson.Image.url = result.url;
							updatePerson.Image.public_id = result.public_id;
							// update the person in db
							updatePersonandRedirect(query, updatePerson, req, res);
						})
				})
				.catch(err => console.error(`error while looking for doc`, err));
		}
	}
});

// Investigate Page Route
router.get('/:id', function (req, res) {
	Person.findById(req.params.id).then(foundPerson => {
		User.findById(foundPerson.Author).then(foundUser => {
			res.render('investigate.pug', {
				person: foundPerson,
				user: foundUser
			});
		}).catch(err => console.error(`error while finding User`, err));
	}).catch(err => console.error(`error while finding Person`, err))
});

// Person Search Route
router.post('/person_search', function (req, res) {
	// Single field search
	if (req.body.name != '') {
		if (req.body.gender == "gender" && req.body.country == '') {
			// search by name
			singlefieldSearchAndShowRecords("Name", req.body.name, res);
			return;
		}
	}
	else if (req.body.country != '') {
		if (req.body.name == '' && req.body.gender == "gender") {
			// search by country
			singlefieldSearchAndShowRecords("Country", req.body.country, res);
			return;
		}
	}
	else if (req.body.gender != "gender") {
		if (req.body.name == '' && req.body.country == '') {
			// search by gender
			singlefieldSearchAndShowRecords("Gender", req.body.gender, res);
			return;
		}
	}

	// Two fields search
	if (req.body.name == '') {
		if (req.body.gender != "gender" && req.body.country != '') {
			// search by Gender and Country
			twofieldSearchAndShowRecords("Gender", req.body.gender, "Country", req.body.country, res);
			return;
		}
	}
	else if (req.body.country == '') {
		if (req.body.name != '' && req.body.gender != "gender") {
			// search by Gender and Name
			twofieldSearchAndShowRecords("Gender", req.body.gender, "Name", req.body.name, res);
			return;
		}
	}
	else if (req.body.gender == "gender") {
		if (req.body.name != '' && req.body.country != '') {
			// search by Name and Country
			twofieldSearchAndShowRecords("Name", req.body.name, "Country", req.body.country, res);
			return;
		}
	}

	// All(Three) or No fields search
	// no field search
	if (req.body.gender == "gender" && req.body.name == '' && req.body.country == '') {
		Person.find({})
			.then(foundPeople => {
				res.render('person_search', {
					person: foundPeople
				})
			}).catch(err => console.error(`error while finding people in db `, err))
		return;
	}
	// Three fields search
	else {
		// search by Name, Gender, Country
		Person.find()
			.where("Gender", { $regex: new RegExp("^" + req.body.gender, "i") })
			.where("Country", { $regex: new RegExp("^" + req.body.country, "i") })
			.where("Name", { $regex: new RegExp("^" + req.body.name, "i") })
			.exec((err, foundPeople) => {
				if (err) {
					console.error(`error while finding people in db `, err);
				} else {
					res.render('person_search', {
						person: foundPeople
					})
				}
			});
		return;
	}
});

// Image Search Route
router.post('/person_search_by_image', upload, async function (req, res,) {
	if (req.file === undefined) {
		res.render('person_search', {
			errors: [{ msg: 'please upload an image for Image Search' }],
			person: []
		})
		return;
	}

	let buffer = req.file.buffer;
	let faces = await imageProcessor(buffer);
	if (faces.length === 0) {
		res.render('person_search', {
			errors: [{ msg: 'Face N/A in your image, plz upload different image' }],
			person: []
		})
		return;
	}

	// get match result data from func in workerFile
	let matchedResult
	try {
		matchedResult = await staticPool.exec(faces);
		console.log('match search result: ', matchedResult)
	} catch (err) {
		console.error('error while executing workerFile func using staticPool.exec :', err)
	}

	// send response to user
	if (matchedResult.similarity === 0) {
		res.render('person_search', {
			person: []
		});
	} else {

		try {
			let foundPeople = await Person.findOne({ "Name": matchedResult.name });
			res.render('person_search', {
				person: [foundPeople]
			});
		} catch (error) {
			console.error('error while finding person in db: ', error);
		}

	}

});

// ---------- Functions ----------

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

// update person in database and redirect user
function updatePersonandRedirect(query, updatePerson, req, res) {
	Person.updateOne(query, updatePerson)
		.then(response => {
			req.flash('success', 'Missing Person Updated');
			res.redirect('/person/edit/missing/' + req.user._id);
			return;
		})
		.catch(err => console.error(`error while updating doc`, err))
}

// upload image to cloudinary and save doc to mongoDb
async function uploadImageAndSaveDoc(req, imgAsBase64, newPerson, res) {
	// face recognition
	let buffer = req.file.buffer;
	let faces = await imageProcessor(buffer);

	if (faces.length === 0) {
		res.render('add_missing_person', {
			user: req.user,
			Photoerror: "No face found, please upload different image",
		});
		return false;
	} else {
		// upload image buffer to cloudinary
		try {
			const result = await cloudinary.uploader.upload(imgAsBase64, { folder: personFolderPath });
			newPerson.Image.url = result.url;
			newPerson.Image.public_id = result.public_id;
		} catch (error) {
			console.error(`error while uploading image to cloudinary `, error);
			res.render('add_missing_person', {
				user: req.user,
				Photoerror: "Cannot upload image, possibly server problem, try again later",
			});
			return false;
		}

		let imageSource = newPerson.Image.url;
		let personName = newPerson.Name;

		// save in mongoDB
		try {
			const savedDoc = await newPerson.save();
		} catch (error) {
			console.error('error while saving doc to database: ', error);
		}

		// send response
		req.flash('success', 'Missing Person Added');
		res.redirect('/');

		// update faces aray
		faces.forEach(face => {
			facesDB.push({ embedding: face.faceEmbedding, name: personName, source: imageSource })
		})

		// write to faces data to file and array
		writeToFile(facesDB);

		return true;
	}

}

// Look for records using one field in db and show them 
function singlefieldSearchAndShowRecords(searchField, searchTerm, res) {

	Person.find()
		.where(searchField, { $regex: new RegExp("^" + searchTerm, "i") })
		.exec((err, foundPeople) => {
			if (err) {
				console.error(`error while finding people in db`, err)
			} else {
				res.render('person_search', {
					person: foundPeople
				});
			}
		})
}

// Look for records using two fields in db and show them 
function twofieldSearchAndShowRecords(searchField, searchTerm, searchField2, searchTerm2, res) {

	Person.find()
		.where(searchField, { $regex: new RegExp("^" + searchTerm, "i") })
		.where(searchField2, { $regex: new RegExp("^" + searchTerm2, "i") })
		.exec((err, foundPeople) => {
			if (err) {
				console.error(`error while finding people in db`, err)
			} else {
				res.render('person_search', {
					person: foundPeople
				});
			}
		})
}
module.exports = router;