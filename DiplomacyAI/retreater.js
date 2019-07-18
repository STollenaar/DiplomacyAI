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

    //TODO: removing the attacked from terrID from the unit choices

    async makeMove(site, gameId, page) {
        const $ = cheerio.load(site);
        const countryID = $('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
        const orderLength = $('table.orders tbody').children().length;

        let resolved = 0;
        //getting the closest empty territories
        await new Promise(resolve => {
            $('table.orders td[class="order"]').each(async function (index) {
                let tr = $(this);
                let id = tr.children('div').attr('id');
                const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
                const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
                const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
                const options = await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => Array.from(e).map(x => x.getAttribute('value')).filter(x => x !== ''));
                let finder = new PathFinding(database, agent, gameId, terrID, -countryID, spanWords.split(' ')[1].trim());
                await finder.init(true, page);
                let supplies;
                //doing the actual finding
                await finder.findClosestEmpty(terrID, index).then((object) => {
                    supplies = object.filter(e => e.distance === 1 && options.includes(String(e.ID)));
                });

                supplies = supplies.sort((a, b) => { return a.distance - b.distance; });

                supplies = util.extractLowestDistance([supplies]);
                // console.log("RESULTS");
                // console.log(supplies);
                if (supplies.length !== 0) {

                    await page.select(`div#${id} select[ordertype="type"]`, 'Retreat');
                    // TODO introduce retreat learning
                    await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, String(supplies[0].ID));
                } else {
                    //disbanding, no possible move
                    await page.select(`div#${id} select[ordertype="type"]`, 'Disband');
                }

                resolved++;
                if (resolved === orderLength) {
                    resolve();
                }
            });
        });
        await page.click('input[name="Ready"]');
        //await page.close();
        return true;
    }
};