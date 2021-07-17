const watch = require('./lib/2kmovie')
const sub = require('./lib/subtitleproxy')
const prompt = require('prompt-sync')()
const mpvAPI = require('node-mpv');
const mpv = new mpvAPI();

async function search() {
	try {
		let query =	prompt(`Enter something: `)
		let results =	await watch.search(query)	
		
		//show all titles
		for (let i = 0; i < results.length; i++) {
			console.log(`${i}.) ${results[i].title} [${results[i].type}]`)	
		}

		let select = prompt(`Select a number: `)
		return { 
			title: results[Number(select)].title,
			id: results[Number(select)].id,
			link: results[Number(select)].link,
			type: results[Number(select)].type
		}

	} catch (e) {
		console.log(`Error something went wrong ${e}`)
	}
}

async function handle(selected) {
	try {
		if (selected.type == 'movie') {
			let vid = await watch.get_link(selected.id, selected.type, selected.link)
			console.log(vid)

			//TO BE CONTINUED~~~~~~

		}	else if (selected.type == 'tv') {

			let seasons = await watch.get_season(selected.id, selected.link)
			for (let i = 0; i < seasons.length; i++) {
				console.log(`${i}.) ${seasons[i].season}`)	//logs all seasons
			}
			let ss = prompt(`Select a season: `)

			
			let episodes = await watch.get_episode(seasons[Number(ss)].id, seasons[Number(ss)].link)
			for (let i = 0; i < episodes.length; i++) {
				console.log(`${i}.) ${episodes[i].ep_title}`)	 //logs all eps
			}
			let ep = prompt(`Select an episode: `)
			
			//get subs and links function....
			let vid = await watch.get_link(episodes[Number(ep)].id, episodes[Number(ep)].type, episodes[Number(ep)].link)
			
			//return the proper args to the function below
			return startMPV(vid, Number(ep), episodes)

			}
	} catch (e) {
		console.log(`Err ${e}`)
	}
}

let startMPV = async(vid, currentEp, episodes) => {
	try {

		//ask user for subs... for this we pass the subtitles array
		let captions = await sub.select(vid.subtitles);
		await sub.download(captions); //then we download

		//start mpv
		await mpv.start()		

		//loads the mp4 link... links[1].file - mp4, links[0].file - m3u8
		await mpv.load(vid.links[1].file) 
		//load the downloaded subtitles, make sure this is below mpv.start()
		await mpv.addSubtitles("/tmp/sub.vtt")
		
		//event handler for mpv
		mpv.on('stopped', async () => {
		let answer = prompt(`Watch next episode? (Y/N): `)

			if (answer == 'Y' || answer == 'y') {
				currentEp++;

				//check first if there's no more next ep on the list...
				if(currentEp > episodes.length - 1) {
					console.log(`No more episodes for this season, Goodbye...`)
					await mpv.quit()
					return
				} 

				console.log(`Playing next episode: ${episodes[currentEp].ep_title}`)	
				let nextlink = await watch.get_link(episodes[currentEp].id, episodes[currentEp].type, episodes[currentEp].link)

				let captions = await sub.select(nextlink.subtitles) //ask user for sub
				await sub.download(captions); //download the sub
				await mpv.load(nextlink.links[1].file) //load the next episode
				await mpv.addSubtitles("/tmp/sub.vtt")
				

			} else if (answer == 'N' || answer == 'n') {
				console.log(`Okay goodbye..`)
				await mpv.quit()
				return
			} else {
				console.log(`Exiting...`)
				await mpv.quit()
				return
			}

		})

		mpv.on('error', () => {
			console.log(`Error try again...`)
		})

	} catch (e) {
		console.log(e)
	}
}

search().then(selected => {return handle(selected)})



