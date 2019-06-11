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

                    if (order === 0 && tr.children('div').children('span[class="orderSegment type"]').children('select').children().eq(order).attr('value') === "Hold") {
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
                                case 2:
                                    {
                                        //get a valid to value
                                        const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length)));
                                        console.log(`order: ${order}, to: ${to}`);
                                        if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].innerHTML, to) !== "") {
                                            loop2 = false;
                                            await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value, to));
                                        }
                                        break;
                                    }
                                case 3:
                                    {
                                        //valid to value
                                        const to = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, e => e.length)));
                                        console.log(`order S Move: ${order}, to: ${to}`);
                                        if (await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].innerHTML, to) !== "") {
                                            loop2 = false;
                                            await page.select(`div#${id} span[class="orderSegment toTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment toTerrID"] select`, (e, to) => e.children[to].value, to));

                                            loop3 = true;
                                            //trying to get a valid from value and checking if the to value was good enough
                                            while (loop3) {
                                                const from = Math.floor(Math.random() * Math.floor(await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.length)));
                                                console.log(`order support move from: ${from}`);
                                                if (await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.length) === 1 && await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, e => e.children[0].innerHTML) === "") {
                                                    loop2 = true;
                                                    loop3 = false;
                                                    break;
                                                } else if (await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, (e, from) => e.children[from].innerHTML, from) !== "") {
                                                    await page.select(`div#${id} span[class="orderSegment fromTerrID"] select`, await page.$eval(`div#${id} span[class="orderSegment fromTerrID"] select`, (e, from) => e.children[from].value, from));
                                                    break;
                                                }

                                            }
                                        }
                                        break;
                                    }
                            }
                        }
                    }
                }
                results++;
                if (results === total) {
                    resolve();
                }
            });
        });

        await page.$eval('input[name="Ready"]', b => b.click());
        await page.close();
    },

    async makeMove(site, gameId, page, debug) {
        const $ = cheerio.load(site);
        countryID = $('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
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
                await finder.findClosestSupply(terrID, countryID, index).then((object) => {
                    supplies[index] = object;
                    resolved++;
                    if (resolved === orderLength) {
                        resolve();
                    }
                });
            });
        });
        supplies = supplies.sort((a, b) => { return a.distance - b.distance; });
        if (debug) {
            module.exports.saveDataSet(supplies);
        }
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
    },

    saveDataSet(dataSet) {
        const fs = require('fs');
        fs.readdir('./datasets/', (err, files) => {
            let name = files.sort((a, b) => parseInt(b.split('t')[1].split('.')[0]) - parseInt(a.split('t')[1].split('.')[0]))[0];
            name = parseInt(name.split('t')[1].split('.')[0]);
            name++;
            let json = JSON.stringify(dataSet);
            fs.writeFile(`./datasets/Variant${name}.json`, json, 'utf8');
        });

    }

    
};