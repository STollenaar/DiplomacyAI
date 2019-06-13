const pathfinding = require('./pathFinding');
const util = require('./util');

let agent;
let cheerio;
let database;



module.exports = {
    init(a, c, d) {
        agent = a;
        cheerio = c;
        database = d;
    },


    async makeRandomMove(site, page) {
        const $ = cheerio.load(site);
        await new Promise(resolve => {
            let results = 0;
            let total = $('table.orders tbody').children().length;
            $('table.orders td[class="order"]').each(async function () {
                let tr = $(this);
                //removes the default selected option
                const id = tr.children('div').attr('id');
                let loop1 = true;
                //random order
                while (loop1) {
                    const order = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment type"] select`, e => e.length)));

                    if (tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value') === "Wait") {
                        results++;
                        break;
                    }
                    await page.select(`div#${id} select[ordertype="type"]`, tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value'));

                    if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length) === 1 && ["", "Convoy"].includes(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.children[0].innerHTML))) {
                        continue;
                    } else {
                        loop1 = false;
                        loop2 = true;
                        while (loop2) {
                            //setting the orders correctly
                            switch (order) {

                                case 0:
                                case 1:
                                    //get a valid to value
                                    const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length)));
                                    if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].innerHTML, to) !== "") {
                                        results++;
                                        loop2 = false;
                                        await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value, to));
                                    }
                                    break;
                            }
                        }
                    }
                }

                if (results === total) {
                    resolve();
                }
            });
        });

        await page.$eval('input[name="Ready"]', b => b.click());
        await page.close();
    },


    async makeMove(site, gameId, page) {
        const $ = cheerio.load(site);
        const countryID = $('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
        const orderLength = $('table.orders tbody').children().length;
        let supplies = [];
        let resolved = 0;
        await new Promise(resolve => {
            $('table.orders td[class="order"]').each(async function (index) {
                let tr = $(this);
                const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
                const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
                const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
                let finder = new PathFinding(database, agent, gameId, terrID, -countryID, spanWords.split(' ')[1].trim());
                await finder.init(true, page);
                await finder.findClosestEmpty(terrID, index).then((object) => {
                    supplies[index] = object.filter(e => e.distance === 1);
                    resolved++;
                    if (resolved === orderLength) {
                        resolve();
                    }
                });
            });
        });
        supplies = supplies.sort((a, b) => { return a.distance - b.distance; });

        supplies = util.extract(supplies);
        console.log("RESULTS");
        console.log(supplies);
        resolved = 0;
        if (supplies.length !== 0) {

            await new Promise(resolve => {
                $('table.orders td[class="order"]').each(async function (index) {
                    let tr = $(this);
                    //removes the default selected option
                    let id = tr.children('div').attr('id');
                    //making the move
                    if (supplies.find(e => e.index === index) !== undefined &&
                        supplies.find(e => e.index === index).distance !== 0) {
                        await page.select(`div#${id} select[ordertype="type"]`, 'Move');
                        await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, String(supplies.find(e => e.index === index).id));
                    }
                    resolved++;
                    if (resolved === orderLength) {
                        resolve();
                    }
                });
            });
            await page.$eval('input[name="Ready"]', b => b.click());
            await page.close();
        }
        return supplies.length === 0;
    }
};