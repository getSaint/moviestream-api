const axios = require('axios').default
const fs = require('fs')
const prompt = require('prompt-sync')();

const download_subtitle = async(subtitle_link="") => {
	try {
		//error handling if no link is provided...
		if (subtitle_link == "") {
			console.log(`No link provided, no subtitles downloaded...`);
			return;
		}

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

const select_subtitle = async(subtitles=[]) => {
	try {
		//error handler if array is none...
		if (subtitles == []) {
			console.log(`No subtitles found...`)	
			return;
		}

		for (let i = 0; i < subtitles.length; i++) {
			console.log(`${i}.) ${subtitles[i].label}`)	
		}		

		let sel = prompt(`Select a caption: `)
		//error checking
		if (Number(sel) > subtitles.length) {
			console.log(`No subtitles chosen...`)
			return;	
		}

		return subtitles[Number(sel)].file;
		
	} catch (e) {
		console.log(`Error cant select subtitles... || ${e}`)
	}
}

module.exports = {
	download: download_subtitle, 
	select: select_subtitle
}
