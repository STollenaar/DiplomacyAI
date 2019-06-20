const pathfinding = require('./pathFinding');
const util = require('./util');
const normalActions = ["Supported", "Ignore", "Hold", "Other"];
const supportActions = ["Move", "Support move"];


let agent;
let cheerio;
let database;
let config;
let fs;

module.exports = {
    init(init) {
        agent = init.agent;
        cheerio = init.cheerio;
        database = init.database;
        config = init.config;
        fs = init.fs;
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
            //await page.$eval('input[name="Ready"]', b => b.click());
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

                let targetRisk = util.calculateTargetRisk(String(current.id), units, countryID);
                targetStatus !== undefined ? targetRisk++ : targetRisk += 0;

                if (targetRisk === 0) {
                    await page.select(`div#${current.divId} select[ordertype="type"]`, 'Move');
                    await page.select(`div#${current.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                } else {
                    if (config.attackRisk.P[targetRisk] === undefined) {
                        util.initLearning("attackRisk", targetRisk, normalActions, config);
                        await database.updateConfig(fs, config);
                    }
                    console.log(normalActions[module.exports.selectActionFromPolicy("attackRisk", targetRisk)]);
                    switch (normalActions[module.exports.selectActionFromPolicy("attackRisk", targetRisk)]) {
                        case "Ignore":
                            await page.select(`div#${current.divId} select[ordertype="type"]`, 'Move');
                            await page.select(`div#${current.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                            break;
                        case "Supported":
                            supplies = await module.exports.supportMove(page, current, supplies, units, targetStatus, targetRisk, countryID);
                            break;
                        case "Other":
                            //finding next best choise...
                            break;
                    }
                }
            }
            resolve(supplies);
        });
    },

    //doing the support move
    //add way to update the riskNumber
    /*
        actions [Hold, Move, Support move]
        => Hold
            => doing its original thing if that isn't going to the targeted territory
        [P/Q][Risk][prop/value]
    */
    supportMove(page, current, supplies, units, targetStatus, targetRisk, countryID) {
        return new Promise(async (resolve) => {

            if (config.neededFriendly.P[targetRisk] === undefined) {
                util.initLearning("neededFriendly", targetRisk, new Array(55), config);
            }
            let maxSurroundingTerr = (await database.getBorders(parseInt(page.url().split('=')[1]), current.id)).length;
            let surrFriendly;
            if (targetStatus !== undefined) {
                surrFriendly = util.getSurrFriendly(targetStatus, supplies, units, String(current.id), countryID);
            } else {
                surrFriendly = util.getSurrFriendly(-1, supplies, units, String(current.id), countryID);
            }
            let neededFriendlies = Math.max(surrFriendly.length, module.exports.selectActionFromPolicy("neededFriendly", targetRisk, maxSurroundingTerr));

            //removing not needed and high risked friendlies;
            surrFriendly.length > neededFriendlies ? surrFriendly = surrFriendly.splice(0, neededFriendlies) : surrFriendly = surrFriendly;

            //quick init if not done
            surrFriendly.forEach(async e => {
                if (config.supportMove.P[e.risk] === undefined) {
                    util.initLearning("supportMove", e.risk, supportActions, config);
                    await database.updateConfig(fs, config);
                }
            });

            //getting the maximum policy index
            let RP = config.supportMove.P.map(e => { return { index: config.supportMove.P.indexOf(e), value: e }; });
            RP = RP.filter(e => surrFriendly.map(s => s.risk).includes(e.index)); //filtering only the available risks

            let maxP = Math.max(...RP.map(e => e.value[0])); //gets the maximum P value
            RP.filter(e => e.value[0] === maxP); //filtering all the risks that has the maximum value
            RP = RP[Math.floor(Math.random() * RP.length)];

            //finally getting the unit who is having the move option
            let move = surrFriendly.find(s => s.risk === RP.index);

            //making the move
            await page.select(`div#${move.divId} select[ordertype="type"]`, 'Move');
            await page.select(`div#${move.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
            surrFriendly = surrFriendly.filter(s => s.index !== move.index);

            let total = surrFriendly.length;
            let tries = 0;
            //having the other support moves
            surrFriendly.forEach(async (value) => {
                await page.select(`div#${value.divId} select[ordertype="type"]`, 'Support move');
                await page.select(`div#${value.divId} span[class="orderSegment toTerrID"] select`, String(current.id));
                await page.select(`div#${value.divId} span[class="orderSegment fromTerrID"] select`, String(move.fromId));
                supplies = supplies.filter(e => e.index !== value.index);
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

    },

    //gets the policy with the max value
    selectActionFromPolicy(field, risk, maxSurr) {
        if (maxSurr === undefined) {
            return config[field].P[risk].indexOf(Math.max(...config[field].P[risk]));
        } else {
            let choices = config[field].P[risk].slice(0, maxSurr);
            return choices.indexOf(Math.max(...choices));
        }
    },

    updateValues(episode) {
        //all possible states
        let states = new Array(self.env.width).fill(new Array(self.env.height).fill(-1));
        let R = 0;
        //setting the target R
        for (let e of episode) { R += e[2] };
        //going through the episodes
        for (let t = 0; t < episode.length; t++) {
            let state = episode[t][0];
            let action = episode[t][1];
            //check if state is already visited
            if (states[state[0]][state[1]] === -1) {
                states[state[0]][state[1]] = action;
                //updating the Q value
                self.Q[state[0]][state[1]][action] = self.Q[state[0]][state[1]][action] + self.config.stepSize * (R - self.Q[state[0]][state[1]][action]);
            }
        }
    },

   updatePolicy(episode) {
        //going through the episodes
        for (let ep of episode) {
            let state = ep[0];
            //gets the maxactionvalue from that state
            let maxActionValue = Math.max(...config[episode.field].Q[episode.risk]).toFixed(2);
            //gets the actions of these maxactionvalues
            let maxActions = config[episode.field].Q[episode.risk].map((e, i) => e.toFixed(2) === maxActionValue ? i : '').filter(String);
            //updating the policy
            for (let a = 0; a < episode.numActions; a++) {
                if (maxActions.indexOf(a) !== -1) {
                    self.P[state[0]][state[1]][a] = 1.0 / maxActions.length;
                } else {
                    self.P[state[0]][state[1]][a] = 0;
                }
            }
        }
    }


};