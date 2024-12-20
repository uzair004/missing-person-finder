const express = require("express");
const path = require('path');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const config = require('./config/database');
const passport = require('passport');

// Bring in Person Model
let Person = require("./models/person");

mongoose.connect(config.database, { useNewUrlParser: true, useUnifiedTopology: true });
let db = mongoose.connection;

const PORT = process.env.PORT || 3000;

// Check connection
db.once('open', function () {
	console.log('Connected to MongoDB................');
});

// Check for DB errors
db.on('error', function (err) {
	console.log("The following erros occurred while connecting with MongoDB:")
	console.log(err);
});

// Init App
const app = express();

// Express session Middleware
app.use(session({
	secret: 'keyboard cat',
	resave: true,
	saveUninitialized: true
}));

// Express Messages Middleware
app.use(require('connect-flash')());
app.use(function (req, res, next) {
	res.locals.messages = require('express-messages')(req, res);
	next();
});

// Bring in Models
let Article = require("./models/article");

// Load View Engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// BodyParser Middleware
// parse application/json
app.use(bodyParser.json())

// Set Public Folder
app.use(express.static(path.join(__dirname, 'public')));

// Passport Config
require('./config/passport')(passport);
// Passport Middleware
app.use(passport.initialize());
app.use(passport.session());

app.get('*', function (req, res, next) {
	res.locals.user = req.user || null;
	next();
})
// Home Route
app.get('/', function (req, res) {
	Person.find({}, function (err, person) {
		if (err) {
			console.log("Following Errors occurred in Person.find() function: ");
			console.log(err);
		} else {
			Article.find({}, function (err, articles) {
				res.render('index', {
					articles: articles,
					person: person
				});
			});
		}
	}).sort({ _id: 'desc' }).limit(12)
});

// Route Files
let articles = require('./routes/articles');
let person = require('./routes/person');
let users = require('./routes/users');
app.use('/articles', articles);
app.use('/person', person);
app.use('/users', users);

// Access Control
function ensureAuthenticated(req, res, next) {
	if (req.isAuthenticated()) {
		return next();
	} else {
		req.flash('danger', 'Please login');
		res.redirect('/users/login');
	}
}

// Services Route
app.get('/services', function (req, res) {
	res.render('services', {

	});
});

// About Route
app.get('/about', function (req, res) {
	res.render('about', {

	});
});

app.get('/archive', (req, res) => {
	Person.find({ CurrentStatus: 'found' }, function (err, person) {
		if (err) {
			console.log("Following Errors occurred in Person.find() function: ");
			console.log(err);
		} else {
			res.render('archive', {
				person: person
			});

		}
	}).sort({ _id: 'desc' });
});

// blog
app.get('/blog', function (req, res) {
	Article.find({}, function (err, articles) {
		res.render('blog', {
			articles: articles,
		});
	}).sort({ _id: 'asc' });
})

app.get('/donate', function (req, res) {
	res.render('donate');
})

// Admin login
app.get('/admin/login', function(req, res) {
	res.render('admin_login');
});

app.post("/admin/login", async function(req, res, next) {
	
	passport.authenticate('local', {
		successRedirect: '/',
		failureRedirect: '/users/login',
		failureFlash: true
	})(req, res, next);

})

// Start Server
app.listen(PORT, '0.0.0.0', function () {
	console.log(`Server started on port ${PORT}`);
});