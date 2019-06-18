const pathfinding = require('./pathFinding');
const util = require('./util');

let agent;
let cheerio;
let database;
let config;


module.exports = {
    init(init) {
        agent = init.agent;
        cheerio = init.cheerio;
        database = init.database;
        config = init.config;
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
        const countryID = $('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1);
        const orderLength = $('table.orders tbody').children().length;
        let supplies = [];
        let resolved = 0;

        //finding all closest supply depots
        await new Promise(resolve => {
            $('table.orders td[class="order"]').each(async function (index) {
                let tr = $(this);
                let id = tr.children('div').attr('id');
                const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
                const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
                const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
                let finder = new PathFinding(database, agent, gameId, terrID, -countryID, spanWords.split(' ')[1].trim());
                await finder.init(true, page);
                await finder.findClosestSupply(terrID, countryID, index).then((object) => {
                    object.forEach(e => { e.divId = id; e.fromId = terrID; });
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
        //checking the best combination of moves
        supplies = util.extractLowestDistance(supplies);
        console.log("RESULTS");
        console.log(supplies);
        resolved = 0;
        if (supplies.length !== 0) {

            await new Promise(resolve => {
                $('table.orders td[class="order"]').each(async function (index) {
                    //making the move
                    if (supplies.find(e => e.index === index) !== undefined) {
                        supplies = await module.exports.moveLogic(page, supplies, index, countryID);
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

    //added more logic to making a move, seeing if a move needs support for it
    moveLogic(page, supplies, index, countryID) {
        return new Promise(async (resolve) => {
            if (supplies.find(e => e.index === index).distance !== 0) {
                let current = supplies.find(e => e.index === index);

                let { targetStatus, units } = {
                    targetStatus: await util.getTargetStatus(page, current.id),
                    units: await util.getUnits(page)
                };
                //finding friendly unit to help getting to the other territory
                let surrFriendly = units.filter(a => a.moveChoices.includes(String(current.id))
                    && a.countryID === countryID);
                if (surrFriendly !== undefined) {
                    //checking if the territory is occupied by no one or a friendly
                    let riskCalc = 0;
                    let riskType;
                    if (targetStatus !== undefined) {
                        let targetUnit = units.find(e => e.id === targetStatus.unitID);
                        if (targetUnit.countryID !== countryID) {
                            //calculating the risk of supporting for every option against occupied territory
                            riskCalc = util.calculateRisk(targetUnit, supplies.filter(s => surrFriendly.map(f => f.terrID).includes(String(s.fromId))), units);
                            riskType = 'attackOccupiedRisk';
                        }
                    } else {
                        //calculating risk of supporting for every option against empty territory
                        riskCalc = util.calculateRisk(-1, supplies.filter(s => surrFriendly.map(f => f.terrID).includes(String(s.fromId))), units);
                        riskType = 'attackEmptyRisk';
                    }
                    if (riskCalc.length === 0) {
                        //making move into empty territory
                        await page.select(`div#${current.divId} select[ordertype="type"]`, 'Move');
                        await page.select(`div#${current.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                    } else {
                        supplies = await module.exports.supportMove(page, supplies, current, riskCalc, riskType);
                    }
                } else if (targetStatus === undefined) {
                    //making move into empty territory ignoring the risk
                    await page.select(`div#${current.divId} select[ordertype="type"]`, 'Move');
                    await page.select(`div#${current.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                } else {
                    /*find the second best choice... so.. this involes double backing of what is determined above...
                        In other words... GOOD LUCK!!
                    */
                }
            }
            resolve(supplies);
        });
    },

    //doing the support move
    //add way to update the riskNumber
    supportMove(page, supplies, current, riskCalc, riskType) {
        return new Promise(async (resolve) => {
            let highestRisk = riskCalc[riskCalc.length - 1];
            let total = riskCalc.length;
            let tries = 0;

            riskCalc.forEach(async (value, index) => {
                if (index === riskCalc.length - 1) {
                    //making move
                    await page.select(`div#${value.divId} select[ordertype="type"]`, 'Move');
                    await page.select(`div#${value.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                    supplies = supplies.filter(e => e.index !== value.index);
                } else {
                    await page.select(`div#${value.divId} select[ordertype="type"]`, 'Support move');
                    await page.select(`div#${value.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                    await page.select(`div#${value.divId} span[class="orderSegment fromTerrID"] select`, String(highestRisk.fromId));
                    supplies = supplies.filter(e => e.index !== value.index);
                }
                tries++;
                if (total === tries) {
                    resolve(supplies);
                }
            });
        });
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