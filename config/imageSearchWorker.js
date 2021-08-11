const { parentPort, workerData } = require('worker_threads');

// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const tf = require('@tensorflow/tfjs-node');
const Human = require('@vladmandic/human').default;

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

let human = new Human(myConfig);

// Main thread will pass the data you need
// through this event listener.
parentPort.on('message', (faces) => {
	const result = getMatch(faces, workerData); //faces was passed to func as arg, workerData was passed to threadPool

	// return the result to main thread.
	parentPort.postMessage(result);
});

function getMatch(faces, facesDB) {
	const result = human.match(faces[0].faceEmbedding, facesDB, 0.40)

	return result;
}
