const pathfinding = require('./pathFinding');
const util = require('./util');
const normalActions = ["Ignore", "Supported", "Hold", "Other"];
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

    async makeMove(site, gameId, page, debug) {
        const $ = cheerio.load(site);
        const countryID = parseInt($('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1));
        const phase = $('span[class="gamePhase"]').text();

        let supplies = [];
        let resolved = 0;
        let orderLength = $('table.orders tbody').children().length;

        //finding all closest supply depots
        await new Promise(resolve => {
            $('table.orders td[class="order"]').each(async (index, value) => {
                let tr = $(value);
                let id = tr.children('div').attr('id');
                const spanWords = tr.children('div').children('span[class="orderSegment orderBegin"]').text();
                const terr = spanWords.slice(spanWords.split('at')[0].length + 3).trim();
                const terrID = (await database.getTerritoryByName(gameId, terr)).ID;
                const coastalParentID = await util.getCoastalParentId(page, terrID);
                const units = await util.getUnits(page);
                const unit = units.find(u => u.terrID === coastalParentID);
                const unitID = unit === undefined ? units.find(u => u.terrID === String(terrID)).ID : unit.ID;

                let finder = new PathFinding(database, agent, gameId, terrID, -countryID, spanWords.split(' ')[1].trim());
                await finder.init(true, page);
                await finder.findClosestSupply(terrID, countryID, index).then((object) => {
                    object.forEach(e => { e.divId = id; e.fromId = terrID; e.unitID = unitID; });
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
        // console.log("RESULTS");
        // console.log(supplies);

        supplies = supplies.filter(s => s.distance !== 0);
        if (supplies.length !== 0) {
            await new Promise(async resolve => {
                for (let index in Array.from($('table.orders td[class="order"]'))) {
                    index = parseInt(index);
                    //making the move
                    if (supplies.find(e => e.index === index) !== undefined) {
                        supplies = await module.exports.moveLogic(page, supplies, index, countryID, gameId, phase);
                    }
                }
                resolve();
            });

        }
        await page.click('input[name="Ready"]');
        //await page.close();
        return true;
    },

    //added more logic to making a move, seeing if a move needs support for it
    moveLogic(page, supplies, index, countryID, gameId, phase) {
        return new Promise(async (resolve) => {
            let current = supplies.find(e => e.index === index);

            let { targetStatus, units } = {
                targetStatus: await util.getTargetStatus(page, current.ID),
                units: await util.getUnits(page)
            };

            let targetRisk = util.calculateTargetRisk(String(current.ID), units, countryID);
            targetStatus !== undefined ? targetRisk++ : targetRisk += 0;

            if (config.attackRisk.P[targetRisk] === undefined || config.attackRisk.P[targetRisk] === null) {
                util.initLearning("attackRisk", targetRisk, normalActions, config);
                await database.updateConfig(fs, config);
            }
            let action = module.exports.selectActionFromPolicy("attackRisk", targetRisk);
            database.generateEpisode(gameId, phase, "attackRisk", targetRisk, action, normalActions.length, current.unitID, normalActions[action], current.ID, countryID);
            switch (normalActions[action]) {
                case "Ignore":
                    await page.select(`div#${current.divId} select[ordertype="type"]`, 'Move');
                    await page.select(`div#${current.divId} span[class="orderSegment toTerrID"] select`, String(current.ID));
                    break;
                case "Supported":
                    supplies = await module.exports.supportMove(page, current, supplies, units, targetStatus, targetRisk, countryID, gameId, phase);
                    break;
                case "Other":
                    //finding next best choise...
                    break;
            }
            resolve(supplies);
        });
    },

    //doing the support move
    supportMove(page, current, supplies, units, targetStatus, targetRisk, countryID, gameId, phase) {
        return new Promise(async (resolve) => {

            if (config.attackRisk.P[targetRisk] === undefined || config.attackRisk.P[targetRisk] === null) {
                util.initLearning("neededFriendly", targetRisk, new Array(55), config);
                await database.updateConfig(fs, config);
            }
            let maxSurroundingTerr = (await database.getBorders(gameId, current.ID)).length;
            let surrFriendly;
            if (targetStatus !== undefined) {
                surrFriendly = util.getSurrFriendly(targetStatus, supplies, units, String(current.ID), countryID);
            } else {
                surrFriendly = util.getSurrFriendly(-1, supplies, units, String(current.ID), countryID);
            }
            let neededFriendlies = Math.max(surrFriendly.length, module.exports.selectActionFromPolicy("neededFriendly", targetRisk, maxSurroundingTerr));

            //removing not needed and high risked friendlies;
            surrFriendly.length > neededFriendlies ? surrFriendly = surrFriendly.splice(0, neededFriendlies) : surrFriendly = surrFriendly;
            database.generateEpisode(gameId, phase, "neededFriendly", targetRisk, neededFriendlies, config["neededFriendly"].P.length, 0, "Supporting", current.ID, countryID);

            //quick init if not done
            surrFriendly.forEach(async e => {
                if (config.attackRisk.P[e.risk] === undefined || config.attackRisk.P[e.risk] === null) {
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
            await page.select(`div#${move.divId} span[class="orderSegment toTerrID"] select`, String(current.ID));
            database.generateEpisode(gameId, phase, "supportMove", move.risk, 0, 2, move.unitID, "Move", current.ID, countryID);
            surrFriendly = surrFriendly.filter(s => s.index !== move.index);

            if (surrFriendly.length === 0) {
                resolve(supplies);
                return;
            }

            //having the other support moves
            for (const value of surrFriendly) {
                await page.select(`div#${value.divId} select[ordertype="type"]`, 'Support move');
                await page.select(`div#${value.divId} span[class="orderSegment toTerrID"] select`, String(current.ID));
                await page.select(`div#${value.divId} span[class="orderSegment fromTerrID"] select`, String(move.fromId));
                supplies = supplies.filter(e => e.index !== value.index);
                database.generateEpisode(gameId, phase, "supportMove", move.risk, 1, 2, value.unitID, "Support move", current.ID, countryID);
            }
            resolve(supplies);
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
    }
};