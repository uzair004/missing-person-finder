const bizSdk = require('facebook-nodejs-business-sdk');
const Page = bizSdk.Page;
const PagePost = bizSdk.PagePost;

const facebookPageToken = process.env.FACEBOOK_PAGE_TOKEN;
const appSecret = process.env.FACEBOOK_APP_SECRET;
const appID = process.env.FACEBOOK_APP_ID;
const pageID = process.env.FACEBOOK_PAGE_ID;

const api = bizSdk.FacebookAdsApi.init(facebookPageToken);

const showDebugingInfo = true; // Setting this to true shows more debugging info.
if (showDebugingInfo) {
	api.setDebug(true);
}

const logApiCallResult = (apiCallName, data) => {
	console.log(apiCallName);
	if (showDebugingInfo) {
		console.log('Data:' + JSON.stringify(data));
	}
};

let fields = [];

let feed;
function postToFacebook(params) {
	feed = (new Page(pageID)).createFeed(fields, params);
}

logApiCallResult('feed api call complete.', feed);

module.exports = postToFacebook;