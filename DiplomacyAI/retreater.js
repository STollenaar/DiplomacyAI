const pathfinding = require('./pathFinding');
const util = require('./util');

let agent;
let cheerio;
let database;



module.exports = {
    init(init) {
        agent = init.agent;
        cheerio = init.cheerio;
        database = init.database;
    },

    async makeMove(site, gameId, page) {
        const $ = cheerio.load(site);
        const countryID = $('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
        const orderLength = $('table.orders tbody').children().length;
        let supplies = [];
        let resolved = 0;
        //getting the closest empty territories
        await new Promise(resolve => {
            $('table.orders td[class="order"]').each(async function (index) {
                let tr = $(this);
                const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
                const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
                const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
                let finder = new PathFinding(database, agent, gameId, terrID, -countryID, spanWords.split(' ')[1].trim());
                await finder.init(true, page);
                //doing the actual finding
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

        supplies = util.extractLowestDistance(supplies);
        console.log("RESULTS");
        console.log(supplies);
        resolved = 0;
        if (supplies.length !== 0) {

            await new Promise(resolve => {
                $('table.orders td[class="order"]').each(async function (index) {
                    let tr = $(this);
                    //removes the default selected option
                    let id = tr.children('div').attr('id');
                    //making the move to empty location
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
        } else {
            //disbanding, no possible move
            await page.select(`div#${id} select[ordertype="type"]`, 'Disband');
        }
        await page.$eval('input[name="Ready"]', b => b.click());
        await page.close();
        return true;
    }
};