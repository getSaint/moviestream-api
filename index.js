const watch = require('./lib/2kmovie')
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
			let link = await watch.get_link(selected.id, selected.type, selected.link)
			console.log(link) //logs out the link for movies

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
			
			//final function
			let link = await watch.get_link(episodes[Number(ep)].id, episodes[Number(ep)].type, episodes[Number(ep)].link)

			//start mpv first...
			await mpv.start()		
			
			return startMPV(link, Number(ep), episodes) //pass the right args

			}
	} catch (e) {
		console.log(`Err ${e}`)
	}
}

let startMPV = async(link, currentEp, episodes) => {
	try {

		await mpv.load(link) //load the link
		
		//event handler for mpv
		mpv.on('stopped', async () => {
		let answer = prompt(`Watch next episode? (Y/N): `)

			if (answer == 'Y' || answer == 'y') {
				currentEp++;
				console.log(`Playing next episode: ${episodes[currentEp].ep_title}`)	
				let nextlink = await watch.get_link(episodes[currentEp].id, episodes[currentEp].type, episodes[currentEp].link)
				await mpv.load(nextlink)

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



