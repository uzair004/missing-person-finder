const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { check, validationResult } = require('express-validator');
const cloudinary = require('cloudinary').v2
const cloudinaryConfig = require('../config/cloudinaryConfig');
const DatauriParser = require('datauri/parser');

const postToFacebook = require('../config/postToFacebook');

const imageProcessor = require('../config/imageProcessingConfig').main;
const writeToFile = require('../config/imageProcessingConfig').writeToFile;
const facesDB = require('../config/imageProcessingConfig').facesDB;

// worker threads pool
const { StaticPool } = require('node-worker-threads-pool');
const workerFilePath = path.join(process.cwd(), 'config', 'imageSearchWorker.js');
const staticPool = new StaticPool({
	size: 3,
	task: workerFilePath,
});

const personFolderPath = "Missing_Person_Finder/person_images/"

const parser = new DatauriParser();
// convert buffer to base64 uri
const dataUri = req => parser.format(path.extname(req.file.originalname).toString(), req.file.buffer);


// Bring in User Model
let User = require("../models/user");
// Bring in Person Model
let Person = require("../models/person");

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
	check('country', 'Country is required').notEmpty(),
	check('address', 'address is required').notEmpty(),
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
		const { name, age, country, address, dateOfMissing,
			gender, mentalStatus, skinColor, eyeColor, hair, currentStatus,
			body, description } = req.body;

		let newPerson = new Person({
			Name: name,
			Body: body,
			Age: age,
			Country: country,
			Address: address,
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

			let buffer = req.file.buffer;

			const t0 = process.hrtime.bigint();
			// face recognition
			let faces = await imageProcessor(buffer);
			calculateTimeLogger('match time', t0)

			if (faces.length === 0) {
				res.render('add_missing_person', {
					user: req.user,
					Photoerror: "No face found, please upload different image",
				});
			} else {
				// convert image buffer to base64
				const imgAsBase64 = dataUri(req).content;

				const u0 = process.hrtime.bigint();
				// upload image buffer to cloudinary
				await uploadImage(req, imgAsBase64, newPerson, res);
				calculateTimeLogger('upload time', u0);

				const d0 = process.hrtime.bigint();
				// save in mongoDB
				let done = await saveDoc(newPerson);
				calculateTimeLogger('saveDoc time', d0);

				// send response
				req.flash('success', 'Missing Person Added');
				res.redirect('/');

				// update faces aray
				if (faces.length !== 0) {
					updateFacesArray(faces, newPerson.Name, newPerson.Image.url);
				}

				// send new record to threads to update their arrays
				faces.forEach(face => {
					staticPool.workers.forEach(worker => worker.postMessage({
						toInsert: true,
						embedding: face.faceEmbedding,
						name: newPerson.Name,
						source: newPerson.Image.url
					}))
				})

				const w0 = process.hrtime.bigint();
				// write data to file
				writeToFile(facesDB);
				calculateTimeLogger('writeToFile time', w0);

				if (done) {
					// increase user person counts by 1
					let query = { _id: req.params.id };
					await incPersonCount(query, req.user.MissingPerson);

					// get data & post to facebook
					// await facebookPost(newPerson);
				}

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
router.post('/edit/:id', ensureAuthenticated, [
	check('age', 'age is required').notEmpty(),
	check('country', 'Country is required').notEmpty(),
	check('address', 'Address is required').notEmpty(),
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
		updatePerson.Body = req.body.body;
		updatePerson.Age = req.body.age;
		updatePerson.Country = req.body.country;
		updatePerson.Address = req.body.address;
		updatePerson.MentalStatus = req.body.mentalStatus;
		updatePerson.SkinColor = req.body.skinColor;
		updatePerson.EyeColor = req.body.eyeColor;
		updatePerson.Hair = req.body.hair;
		updatePerson.Gender = req.body.gender;
		updatePerson.Description = req.body.description;

		updatePersonandRedirect(query, updatePerson, req, res)

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
router.post('/person_search', [
	check('name', 'Please enter NAME of missing person').notEmpty(),
], function (req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		res.render('person_search', {
			errors: errors.array(),
			person: [],
			user: req.user
		});
		return;
	}

	// Single field search
	if (req.body.name != '') {
		if (req.body.gender == "gender" && req.body.country == '') {
			// search by name
			singlefieldSearchAndShowRecords("Name", req.body.name, res, req);
			return;
		}
	}

	// Two fields search
	if (req.body.country == '') {
		if (req.body.name != '' && req.body.gender != "gender") {
			// search by Gender and Name
			twofieldSearchAndShowRecords("Gender", req.body.gender, "Name", req.body.name, res, req);
			return;
		}
	}
	else if (req.body.gender == "gender") {
		if (req.body.name != '' && req.body.country != '') {
			// search by Name and Country
			twofieldSearchAndShowRecords("Name", req.body.name, "Country", req.body.country, res, req);
			return;
		}
	}

	// All(Three) or No fields search
	// no field search
	if (req.body.gender == "gender" && req.body.name == '' && req.body.country == '') {
		res.render('person_search', {
			errors: [{ msg: 'please enter name, gender, or country to search' }],
			person: [],
			user: req.user
		})
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
						person: foundPeople,
						user: req.user
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
			person: [],
			user: req.user
		})
		return;
	}

	let buffer = req.file.buffer;
	let faces = await imageProcessor(buffer);
	if (faces.length === 0) {
		res.render('person_search', {
			errors: [{ msg: 'Face N/A in your image, plz upload different image' }],
			person: [],
			user: req.user
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
			person: [],
			user: req.user
		});
	} else {

		try {
			let foundPeople = await Person.findOne({ "Name": matchedResult.name });
			res.render('person_search', {
				person: [foundPeople],
				user: req.user
			});
		} catch (error) {
			console.error('error while finding person in db: ', error);
		}

	}

});

// change missing status Route
router.post('/edit/found/:id', ensureAuthenticated, async function (req, res) {
	const query = { _id: req.params.id };
	const updatePerson = {};
	updatePerson.CurrentStatus = 'found';

	Person.updateOne(query, updatePerson)
		.then(response => {
			req.flash('success', `Congrats! on finding ${response.Name}, help us continue by donating`);
			res.redirect('/donate');
			return;
		})
		.catch(err => {
			console.error(`error while updating status, `, err)
			req.flash('danger', `Oops! cant update status, try later`);
			res.redirect('/');
		});

})

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

// upload image to cloudinary
async function uploadImage(req, imgAsBase64, newPerson, res) {
	try {
		const result = await cloudinary.uploader.upload(imgAsBase64, { folder: personFolderPath, quality: 'auto', width: 1024, crop: "limit" });
		newPerson.Image.url = result.url;
		newPerson.Image.public_id = result.public_id;
	} catch (error) {
		console.error(`error while uploading image to cloudinary `, error);
		res.render('add_missing_person', {
			user: req.user,
			Photoerror: "Cannot upload image, possibly server problem, try again later",
		});
	}
}

// save doc to DB
async function saveDoc(newPerson) {
	try {
		const savedDoc = await newPerson.save();
		return true;
	} catch (error) {
		console.error('error while saving doc to database: ', error);
		return false;
	}

}

// update faces array
async function updateFacesArray(faces, personName, imageSource) {
	faces.forEach(face => {
		facesDB.push({ embedding: face.faceEmbedding, name: personName, source: imageSource })
	})
}

// inc person posted by user
async function incPersonCount(query, currentCount) {
	let userUpdate = {};
	userUpdate.MissingPerson = currentCount + 1;
	User.updateOne(query, userUpdate)
		.catch(err => console.error(`error while updating user person count`, err))

}

// set data & Post to fb
async function facebookPost(newPerson) {
	let params = {};
	params.message = `Name: ${newPerson.Name},
					Age: ${newPerson.Age},
					Gender: ${newPerson.Gender},
					Address: ${newPerson.Address},${newPerson.Country},
					Missing since: ${newPerson.DateOfMissing}`;

	params.link = "https://google.com";
	params.call_to_action = {
		"type": "LEARN_MORE", "value": { "link": "https://google.com" }
	}

	postToFacebook(params);
}

// Look for records using one field in db and show them 
function singlefieldSearchAndShowRecords(searchField, searchTerm, res, req) {

	Person.find()
		.where(searchField, { $regex: new RegExp("^" + searchTerm, "i") })
		.exec((err, foundPeople) => {
			if (err) {
				console.error(`error while finding people in db`, err)
			} else {
				res.render('person_search', {
					person: foundPeople,
					user: req.user
				});
			}
		})
}

// Look for records using two fields in db and show them 
function twofieldSearchAndShowRecords(searchField, searchTerm, searchField2, searchTerm2, res, req) {

	Person.find()
		.where(searchField, { $regex: new RegExp("^" + searchTerm, "i") })
		.where(searchField2, { $regex: new RegExp("^" + searchTerm2, "i") })
		.exec((err, foundPeople) => {
			if (err) {
				console.error(`error while finding people in db`, err)
			} else {
				res.render('person_search', {
					person: foundPeople,
					user: req.user
				});
			}
		})
}

function calculateTimeLogger(timeFor, t0) {
	const t1 = process.hrtime.bigint();
	console.log(`${timeFor}: `, Number((t1 - t0) / BigInt(1000000)));
}

module.exports = router;