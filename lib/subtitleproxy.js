const axios = require('axios').default
const fs = require('fs')

const download_subtitle = async(subtitle_link) => {
	try {
		const path = '/tmp/sub.vtt'
		let resp = await axios.post('https://www1.anony.men/index.php', `url=${subtitle_link}`, {
			responseType: 'stream'
		})

		await resp.data.pipe(fs.createWriteStream(path));
		console.log(`Subtitles downloaded... on ${path}`)	

	} catch (e) {
		console.log(`Error, cant download subtitles... || ${e}`)
	}
}

module.exports = download_subtitle

