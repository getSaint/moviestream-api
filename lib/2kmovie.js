const axios = require('axios').default
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')

//load extensions later for puppeteer usage...
const ublock = `${__dirname}/extensions/uBlock0.chromium`
const ghostery = `${__dirname}/extensions/Ghostery`

let search = async(query) => {
	try {
		let proper = query.replace(/\s/gm, '-')
		let resp = await axios.get(`https://2kmovie.cc/search/${proper}`)	
		let $ = cheerio.load(resp.data)
		let data = [];
		$('.film-poster-ahref.flw-item-tip').each((i, el) => {
			data.push({
				title: $(el).attr('title'),
				link: $(el).attr('href'),
				type: $(el).attr('href').split('/')[1],
				id: $(el).attr('href').split('-').pop(),
				index: i
			})
		})
		return data;
	} catch (e) {
		console.log(`Error: ${e}`)
	}
}

let get_season = async(id, site_link) => {
	try {
		let resp = await axios.get(`https://2kmovie.cc/ajax/v2/tv/seasons/${id}`)
		let $ = cheerio.load(resp.data)
		let data = []
		$('.dropdown-menu a').each((i,el) => {
			data.push({
				season: $(el).text(),
				id: $(el).attr('data-id'),
				link: site_link,
				index: i
			})
		})
		return data;
	} catch (e) {
		console.log(`Error: ${e}`)
	}
	
}

let get_episode = async(id, site_link) => {
	try {
		let resp = await axios.get(`https://2kmovie.cc/ajax/v2/season/episodes/${id}`)	
		let $ = cheerio.load(resp.data)
		let data = []
		$('.nav-item a').each((i,el) => {
			data.push({
				ep_title: $(el).attr('title'),
				id: $(el).attr('data-id'),
				link: site_link, 
				type: 'tv',
				index: i
			})
		})
		return data;
	} catch (e) {
		 console.log(`Error ${e}`)
	}
}


let get_link = async(id, type, link) => {
	try {
		if (type == 'tv') {
			let resp = await axios.get(`https://2kmovie.cc/ajax/v2/episode/servers/${id}`)	
			let $ = cheerio.load(resp.data)
			let sid = $('.nav-item a').attr('data-id') //chooses vidcloud server id...
			let real = `https://2kmovie.cc${link.replace(/\/tv\//, '/watch-tv/')}.${sid}`
			//use puppeteer and listen for media requests
			const browser = await puppeteer.launch({
				headless: true,
				args: [
					  	`--disable-extensions-except=${ublock},${ghostery}`, 
							`--load-extension=${ublock},${ghostery}`, 
							`--no-sandbox` 
							]
			})
			const page = (await browser.pages())[0];
			await page.goto(real, { waitUntil: 'networkidle0' })	

			//scrape
			const iframe = await page.waitForSelector('#iframe-embed');
			const contframe = await iframe.contentFrame();
			const script = await contframe.waitForSelector('body > script');
			const script_text = await script.evaluateHandle(el => {
				return el.textContent;
			})

			//now we match the needed links using regex...	
			const data = script_text._remoteObject.value.match(/\{".*?\"}/gm)
			const items = [];
			
			//push data inside that stuff...
			for (let v in data) {
				items.push(JSON.parse(data[v]))
			}
			
			//destructure for convenience...
			const [source_1, source_2, ...subs] = items;

			await browser.close()

			return {
				links: [source_1, source_2],
				subtitles: subs
			}

		} else if (type == 'movie') {
			let resp = await axios.get(`https://2kmovie.cc/ajax/movie/episodes/${id}`)
			let $ = cheerio.load(resp.data)
			let sid = $('.nav-item a').attr('data-linkid') //chooses vidcloud server id...
			let real = `https://2kmovie.cc${link.replace(/\/movie\//, '/watch-movie/')}.${sid}`

			const browser = await puppeteer.launch({
				headless: true, 
				args: [
							`--disable-extensions-except=${ublock},${ghostery}`, 
							`--load-extensions=${ublock},${ghostery}`,
							`--no-sandbox`
							]
			})
			const page = (await browser.pages())[0];
			await page.goto(real, { waitUntil: 'networkidle0' })	

				//scrape
			const iframe = await page.waitForSelector('#iframe-embed');
			const contframe = await iframe.contentFrame();
			const script = await contframe.waitForSelector('body > script');
			const script_text = await script.evaluateHandle(el => {
				return el.textContent;
			})

			//now we match the needed links using regex...	
			const data = script_text._remoteObject.value.match(/\{".*?\"}/gm)
			const items = [];
			
			//push data inside that stuff...
			for (let v in data) {
				items.push(JSON.parse(data[v]))
			}
			
			//destructure for convenience...
			const [source_1, source_2, ...subs] = items;

			await browser.close()

			return {
				links: [source_1, source_2],
				subtitles: subs
			}
			
		}
	} catch (e) {
		console.log(e)
	}
}

module.exports = { 
	search: search, 
	get_season: get_season, 
	get_episode: get_episode, 
	get_link: get_link,
}

/*
search('adventure time')
	.then(res => {console.log(res[0]); return res[0]})
	.then(i => {console.log(i.id); return get_season(i.id, i.link)})
 	.then(seasons => {console.log(seasons); return get_episode(seasons[0].id, seasons[0].link)})
	.then(episodes => {console.log(episodes); return get_link(episodes[18].id, episodes[18].type, episodes[18].link)})
	.then(finalLink => {console.log(finalLink)})
	
	*/

//get seasons = https://2kmovie.cc/ajax/v2/tv/seasons/TV_ID
//get episodes = https://2kmovie.cc/ajax/v2/season/episodes/SEASONID
//get links = https://2kmovie.cc/ajax/v2/episode/servers/EPID
	
