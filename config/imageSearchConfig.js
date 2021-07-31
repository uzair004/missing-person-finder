// eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
const tf = require('@tensorflow/tfjs-node');
const Human = require('@vladmandic/human').default;

const imageProcessor = require('../config/imageProcessingConfig').main;
const facesDB = require('../config/imageProcessingConfig').facesDB;

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

module.exports = function getMatch(faces) {
	const result = human.match(faces[0].faceEmbedding, facesDB, 0.40)
	console.log('Result for Search: ', result)

	return result;
}
