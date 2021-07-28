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

// read recognized faces data
console.log('Reading already recognized faces from file ');
facesDB = JSON.parse(fs.readFileSync('result.json'));

const myConfig = {
	backend: 'tensorflow',
	modelBasePath: 'file://imageProcessingModels/',
	debug: 'true',
	async: 'false',
	face: {
		enabled: true,
		detector: {
			enabled: true,
			rotation: true,
			maxDetected: 1,
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

async function detect(input) {
	// read input image file and create tensor to be used for processing
	log.info('Loading Image: ', input);

	log.info('Converting Image to Buffer')
	let buffer = await imageToBuffer(input);

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
		log.error('caught');
	}

	// dispose image tensor as we no longer need it
	human.tf.dispose(tensor);

	// print data to console
	printToConsole(result);

	// Write data into file
	writeToFile(result, input);

	return result;

}

module.exports = async function main(f) {
	log.header();
	log.info('Current folder:', process.env.PWD);
	await init();
	if (!fs.existsSync(f) && !f.startsWith('http')) {
		log.error(`File not found: ${process.argv[2]}`);
	} else {
		if (fs.existsSync(f)) {
			const stat = fs.statSync(f);
			if (stat.isDirectory()) {
				const dir = fs.readdirSync(f);
				for (const file of dir) {
					await detect(path.join(f, file));
				}
			} else {
				await detect(f);
			}
		} else {
			await detect(f);
		}
	}
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

async function imageToBuffer(input) {
	let buffer;
	if (input.startsWith('http:') || input.startsWith('https:')) {
		log.info('fetching image')
		const res = await fetch(input);
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
		buffer = fs.readFileSync(input);
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
	// log.data('Results:');
	if (result && result.face && result.face.length > 0) {
		for (let i = 0; i < result.face.length; i++) {
			const face = result.face[i];
			// log.data(`Face: #${i} boxScore:${face.boxScore} faceScore:${face.faceScore} age:${face.age} genderScore:${face.genderScore} gender:${face.gender}`);
			// log.data(`Face: #${i} face-embedding: ${face.embedding}`);
		}
	} else {
		log.data(' Face: N/A ');
	}
}

function writeToFile(result, input) {
	if (result) {

		let obj = new Object();
		obj.source = input;
		obj.embedding = result.face[0].embedding;

		facesDB.push(obj);

		// write objects to file
		fs.writeFile('result.json', JSON.stringify(facesDB, null, 1), (err, data) => {
			if (err) console.error('error while writing data to file: ', err)
			else console.log('data written to file');
		});
	}
}

// async function test() {
// 	process.on('unhandledRejection', (err) => {
// 		// @ts-ignore // no idea if exception message is compelte
// 		log.error(err?.message || err || 'no error message');
// 	});

// 	// test with embedded full body image
// 	let result;

// 	log.state('Processing embedded warmup image: face');
// 	myConfig.warmup = 'face';
// 	result = await human.warmup(myConfig);

// 	log.state('Processing embedded warmup image: full');
// 	myConfig.warmup = 'full';
// 	result = await human.warmup(myConfig);
// 	// no need to print results as they are printed to console during detection from within the library due to human.config.debug set
// 	return result;
// }