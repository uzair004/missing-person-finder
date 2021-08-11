const log = require('@vladmandic/pilogger');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch').default;

// for NodeJS, `tfjs-node` or `tfjs-node-gpu` should be loaded before using Human, DO NOT remove tf even if unused
// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const tf = require('@tensorflow/tfjs-node');

// load specific version of Human library that matches TensorFlow mode
const Human = require('@vladmandic/human').default;

let human = null;

let facesDB = [];

let jsonFilePath = path.join(process.cwd(), 'public', 'faces', 'facesDB.json');

// read recognized faces data
log.info('Reading already recognized faces from file ');
if (!fs.existsSync(jsonFilePath)) {
	fs.writeFileSync(jsonFilePath, JSON.stringify([]), { flag: 'a' });
}
facesDB = JSON.parse(fs.readFileSync(jsonFilePath));

const myConfig = {
	backend: 'tensorflow',
	modelBasePath: 'file://ML_models/',
	debug: 'true',
	async: 'false',
	face: {
		enabled: true,
		detector: {
			enabled: true,
			rotation: true,
			maxDetected: 4,
			// minConfidence: 0.4,
			// modelPath: ,
		},
		mesh: {
			enabled: true,
			// modelPath: ,
		},
		description: {
			enabled: true,
			// minConfidence: 0.4,
			// modelPath: ,
		},
	},
	filter: { enabled: false },
	gesture: { enabled: false },
	emotion: { enabled: false },
	body: { enabled: false },
	hand: { enabled: false }
}

async function detector(input) {
	// read input image file and create tensor to be used for processing
	log.info('Loading Image: ', input);

	let buffer;
	if (Buffer.isBuffer(input)) {
		buffer = input;
	} else {
		log.info('Converting Image to Buffer')
		buffer = await imageToBuffer(input);
	}
	log.info('Buffer value: ', buffer)

	log.info('Decoding image')
	let tensor = imageDecoder(buffer);
	log.info('Decoding done')

	// image shape contains image dimensions and depth
	log.state('Processing:', tensor['shape']);

	// run actual detection
	let result;
	try {
		result = await human.detect(tensor, myConfig);
	} catch (err) {
		log.error('error while detection: ', err);
	}

	// dispose image tensor as we no longer need it
	human.tf.dispose(tensor);

	// printToConsole(result);

	let faceExtractorRes = faceExtractor(result);

	return faceExtractorRes;
}

async function main(f) {
	log.header();
	await init();

	let detectorResult;

	if (Buffer.isBuffer(f)) {
		detectorResult = await detector(f);
	} else {
		// in case f is file or link
		detectorResult = detectFromLinkOrFile(f);
	}

	return detectorResult;

}

// ---------------- Functions --------------

async function init() {
	human = new Human(myConfig);
	// wait until tf is ready
	await human.tf.ready();
	console.log('tensorFlow is ready');
	// pre-load models
	log.info('Human:', human.version);
	log.info('Active Configuration', human.config);
	await human.load();
	const loaded = Object.keys(human.models).filter(a => human.models[a]);
	log.info('Models Loaded:', loaded);
	log.info('Memory State', human.tf.engine().memory());
}

async function imageToBuffer(imagePath) {
	let buffer;
	if (imagePath.startsWith('http:') || imagePath.startsWith('https:')) {
		log.info('fetching image')
		const res = await fetch(imagePath);
		log.info('image fetched');
		if (res && res.ok) {
			log.info('working on conversion to buffer')
			buffer = res.buffer();
			return buffer;
		}
		else {
			log.error('Invalid image URL:', input, res.status, res.statusText, res.headers.get('content-type'));
		}

	} else {
		buffer = fs.readFileSync(imagePath);
		return buffer;
	}
}

function imageDecoder(buffer) {
	// decode image using tfjs-node so we don't need external depenencies
	if (!buffer) return {};
	return tensor = human.tf.tidy(() => {
		const decode = human.tf.node.decodeImage(buffer, 3);
		let expand;
		if (decode.shape[2] === 4) { // input is in rgba format, need to convert to rgb
			const channels = human.tf.split(decode, 4, 2); // tf.split(tensor, 4, 2); // split rgba to channels
			const rgb = human.tf.stack([channels[0], channels[1], channels[2]], 2); // stack channels back to rgb and ignore alpha
			expand = human.tf.reshape(rgb, [1, decode.shape[0], decode.shape[1], 3]); // move extra dim from the end of tensor and use it as batch number instead
		} else {
			expand = human.tf.expandDims(decode, 0);
		}
		const cast = human.tf.cast(expand, 'float32');
		return cast;
	});
}

function printToConsole(result) {
	log.data('Results:');
	if (result && result.face && result.face.length > 0) {
		for (let i = 0; i < result.face.length; i++) {
			const face = result.face[i];
			log.data(`Face: #${i} boxScore:${face.boxScore} faceScore:${face.faceScore} age:${face.age} genderScore:${face.genderScore} gender:${face.gender}`);
			log.data(`Face: #${i} face-embedding: ${face.embedding}`);
		}
	} else {
		log.data(' Face: N/A ');
	}
}

function writeToFile(facesDB) {

	// write objects to file
	fs.writeFile(jsonFilePath, JSON.stringify(facesDB, null, null), (err, data) => {
		if (err) console.error('error while writing data to file: ', err)
		else log.info('data written to file');
	});
}

function faceExtractor(result) {
	if (result && result.face && result.face.length > 0) {
		let faces = [];
		result.face.forEach(eachFace => {
			faces.push({ faceEmbedding: eachFace.embedding })
		});
		return faces;
	} else {
		log.data('Face N/A')
		return [];
	}
}

async function detectFromLinkOrFile(f) {
	let result;

	if (!fs.existsSync(f) && !f.startsWith('http')) {
		log.error(`File is not from local, link, or buffer : ${f}`);
	} else {
		if (fs.existsSync(f)) {
			const stat = fs.statSync(f);
			if (stat.isDirectory()) {
				const dir = fs.readdirSync(f);
				for (const file of dir) {
					result = await detector(path.join(f, file));
				}
			} else {
				result = await detector(f);
			}
		} else {
			// when f is link to image
			result = await detector(f);
		}
	}

	return result;
}

module.exports = {
	main: main,
	printToConsole: printToConsole,
	writeToFile: writeToFile,
	facesDB: facesDB
}
