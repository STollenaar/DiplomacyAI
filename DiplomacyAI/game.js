const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const move = require('./move');
const builder = require('./builder');
const retreater = require('./retreater');
const util = require('./util');

let url;
let agent;
let database;
let config;
let game;
let fs;

let runnable;

module.exports = {

    init(init) {
        url = init.url;
        agent = init.agent;
        database = init.database;
        config = init.config;
        fs = init.fs;

        move.init(init);
        builder.init(init);
        retreater.init(init);
    },

    //starting the autocheck
    startAutoCheck(secondsDelay) {
        runnable = setInterval(() => { module.exports.canMakeMoves(true); }, secondsDelay * 1000);
    },

    //stopping the autocheck
    stopAutoCheck() {
        clearInterval(runnable);
    },

    //adding game data to the db
    async gameCheck(games) {
        game = games;
        this.browser = await puppeteer.launch({ headless: true });

        let gam = (await database.getGames(config.Username)).map(e => e.gameID);
        games.forEach(g => {
            if (!gam.includes(parseInt(g.bigId))) {
                console.log(`Found new game ${g.bigId} adding to database`);
                database.addGame(config.Username, g.bigId);
                this.gameAdding(g.bigId, this.browser);
            }
        });
    },

    async gameAdding(Id, browser) {
        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );
        const page = await browser.newPage();

        //cooking inserting
        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                await page.setCookie(cookies);
            }
        }

        await page.goto(`${url}/board.php?gameID=${Id}`, { "waitUntil": "load" }).then(async () => {
            //creating the mess... aka making a serializable object
            let mess = await page.evaluate(() => {
                const ar = window.Territories._object;
                let territories = [];
                let borders = [];

                for (let t in ar) {
                    t = ar[t];
                    let terr = {};
                    terr.id = t.id;
                    terr.name = t.name;
                    terr.type = t.type;
                    terr.supply = t.supply;

                    for (let b in t.CoastalBorders) {
                        b = t.CoastalBorders[b];
                        let border = {};
                        if (b.a === undefined || b.a === null) {
                            continue;
                        }

                        border.ownID = t.id;
                        border.borderID = b.id;
                        border.armyPass = b.a;
                        border.fleetPass = b.f;
                        borders.push(border);
                    }


                    territories.push(terr);
                }

                return {
                    t: territories, b: borders
                };

            });
            for (let t in mess.t) {
                t = mess.t[t];
                database.addTerritory(Id, t.id, t.name, t.type, t.supply);

            }

            for (let b in mess.b) {
                b = mess.b[b];
                database.addBorder(Id, b.ownID, b.borderID, b.armyPass, b.fleetPass);
            }
            console.log(`Done parsing data for new game ${Id}`);
        });
        await page.close();
    },

    async canMakeMoves(debug) {
        tries = 0;
        console.log(game);

        for (gameID in game) {
            await this.checkMove(game[gameID].bigId, this.browser, debug);
        }
        console.log("Done checking games");
    },

    async checkMove(gameId, browser, debug) {
        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );

        const page = await browser.newPage();

        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                await page.setCookie(cookies);
            }
        }
        await page.goto(`${url}board.php?gameID=${gameId}`, { "waitUntil": "load" }).then(async () => {

            const html = await page.content();
            const $ = cheerio.load(html);
            if ($('div.memberUserDetail').text().includes('No orders submitted!') || $('div.memberUserDetail').text().includes('but not ready for next turn')) {
                console.log(`Making a move for game: ${gameId}`);
                const phase = $('span[class="gamePhase"]').text();

                await module.exports.updateLearning(gameId, phase, page);
                //switching between the different phases
                //switch (phase) {
                //    case "Diplomacy":
                //        await move.makeMove(html, gameId, page, debug);
                //        
                //        break;
                //    case "Builds":
                //        await builder.makeRandomMove(html, page);
                //        break;
                //    case "Retreats":
                //        await retreater.makeMove(html, gameId, page);
                //        break;
                //}

                console.log(`Done making a move for game: ${gameId}`);
            }
        });
    },

    async updateLearning(gameId, phase, page) {
        let episodes = await database.getEpisodes(gameId);
        if (episodes !== undefined && episodes.length !== 0 && episodes[0].phase !== phase) {
            //do the update
            for (let episode of episodes) {
                let R = await module.exports.checkMoveSuccess(episode, page);
                let type;
                if (episode.moveType === "Supported") {
                    R = await module.exports.checkMoveSuccess(episodes.find(e => e.unitId === episode.unitId && e.moveType !== episode.moveType), page);
                } else if (episode.configField === "neededFriendly") {
                    const e = episodes.find(e => e.targetId === episode.targetId && e.configField === "supportMove");
                    type = e.moveType === "Move" || e.moveType === "Support move" ? "attack" : "defense";
                    R = await module.exports.checkMoveSuccess(e, page);
                }
                const to = (await database.getTerritoryByID(gameId, episode.targetId)).name;
                const unit = (await util.getUnits(page)).find(u => u.id === episode.unitId);
                let color = R ? "\x1b[32m" : "\x1b[31m";
                if (episode.configField !== "neededFriendly" && episode.moveType !== "Supported") {
                    console.log(color, `The ${unit.type} ${episode.moveType} to ${to}`);
                } else if (episode.configField === "neededFriendly") {
                    console.log(color, `The ${type} on ${to} has been carried out by ${episode.action} friendlies`);
                }
                R = R ? 1 : -1; //setting reward type, positive for success, negative for failure
                module.exports.updateValues(episode, R);
                module.exports.updatePolicy(episode);
            }
            console.log("\x1b[0m");
            await database.removeEpisodes(gameId, episodes[0].phase);
            await database.updateConfig(fs, config);
        }
    },

    updateValues(episode, R) {
        //updating the Q value
        config[episode.configField].Q[episode.risk][episode.action] = config[episode.configField].Q[episode.risk][episode.action] + config.stepSize * (R - config[episode.configField].Q[episode.risk][episode.action]);
    },

    updatePolicy(episode) {
        //gets the maxactionvalue from that state
        let maxActionValue = Math.max(...config[episode.configField].Q[episode.risk]).toFixed(2);
        //gets the actions of these maxactionvalues
        let maxActions = config[episode.configField].Q[episode.risk].map((e, i) => e.toFixed(2) === maxActionValue ? i : '').filter(String);
        //updating the policy
        for (let a = 0; a < episode.numActions; a++) {
            if (maxActions.indexOf(a) !== -1) {
                config[episode.configField].P[episode.risk][a] = 1.0 / maxActions.length;
            } else {
                config[episode.configField].P[episode.risk][a] = 0;
            }
        }
    },

    async checkMoveSuccess(episode, page) {
        const units = await util.getUnits(page);
        switch (episode.moveType) {
            case "Hold":
            case "Move":
                return units.find(u => u.id === episode.unitId).terrID === episode.targetId;
            case "Support move":
            case "Support hold":
                let unit = units.find(u => u.id === episode.unitId);
                let terrUnit = units.find(u => u.terrID === episode.targetId);
                return unit.countryID === terrUnit.countryID;
        }
    }
};