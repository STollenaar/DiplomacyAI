const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const move = require('./move');
const builder = require('./builder');
const retreater = require('./retreater');

let url;
let agent;
let database;
let config;
let game;

let runnable;

module.exports = {

    init(init) {
        url = init.url;
        agent = init.agent;
        database = init.database;
        config = init.config;

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
                let phase = $('span[class="gamePhase"]').text();

                await updateLearning(gameId, phase);
                //switching between the different phases
                switch (phase) {
                    case "Diplomacy":
                        if (await move.makeMove(html, gameId, page, debug)) {
                            await move.makeRandomMove(html, page);
                        }
                        break;
                    case "Builds":
                        await builder.makeRandomMove(html, page);
                        break;
                    case "Retreats":
                        await retreater.makeMove(html, gameId, page);
                        break;
                }

                console.log(`Done making a move for game: ${gameId}`);
            }
        });
    },

    async updateLearning(gameId, phase) {
        let episodes = await database.getEpisode(gameId);
        if (episodes !== undefined && episodes[0].phase !== phase) {
            //do the update
            for (let episode of episodes) {
                this.updateValues(episode, 0);
                this.updatePolicy(episode);
            }
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
    }
};