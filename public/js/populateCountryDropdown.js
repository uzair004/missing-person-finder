const endpoint = 'https://gist.githubusercontent.com/uzair004/a144dd0c94df2629f4d9428c0b21fdc9/raw/4d75a0a11a8969fa024ba2e9bb99c255ddc06789/countries-list-with-phone-and-flags.json';
const countries = [];

const searchInput = document.querySelector('.search');
const datalist = document.getElementById('countries');

fetch(endpoint)
	.then(blob => {
		return blob.json();
	})
	.then(data => {
		countries.push(...data)
		return;
	});

function findMatches(wordToMatch, cities) {
	return countries.filter(country => {
		const regex = new RegExp(wordToMatch, 'gi');
		return country.value.match(regex);
	});
}

function displayMatches() {
	const matchArr = findMatches(this.value, countries);
	const html = matchArr.map(country => {
		const regex = new RegExp(this.value, 'gi');
		const countryName = country.value.replace(regex, `${this.value}`)

		return `<option>${countryName}</option>`;

	}).join('');
	datalist.innerHTML = html;

}

searchInput.addEventListener('change', displayMatches);
searchInput.addEventListener('keyup', displayMatches);		
