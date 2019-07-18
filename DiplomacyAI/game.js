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
let state;

let runnable;
let training;

module.exports = {

    async init(init) {
        url = init.url;
        agent = init.agent;
        database = init.database;
        config = init.config;
        fs = init.fs;
        state = init.state;

        move.init(init);
        builder.init(init);
        retreater.init(init);

        if (this.browser === undefined) {
            this.browser = await puppeteer.launch({ headless: true });
        }
    },

    startTraining(amountTimes, interval, opponents) {
        training = { current: 0, maxAmount: amountTimes, interval: interval, opponents: opponents };
        this.checkTraining();
    },

    statusTraining() {
        console.log(training);
    },

    stopTraining() {
        training = undefined;
    },

    checkTraining(gameID) {
        database.removeEpisodes(gameID);
        if (training !== undefined) {
            training.current++;
            if (training.current !== training.maxAmount) {
                state.gameCreate(15, "BotTraining", "HelloWorld", training.opponents.join(', '));
                this.startAutoCheck(training.interval);
            } else {
                this.stopTraining();
                this.stopAutoCheck();
            }
        }
    },

    //starting the autocheck
    startAutoCheck(secondsDelay, debug = false) {
        runnable = setInterval(async () => { await module.exports.canMakeMoves(debug); }, secondsDelay * 1000);
    },

    //stopping the autocheck
    stopAutoCheck() {
        clearInterval(runnable);
    },



    async canMakeMoves(debug) {

        tries = 0;
        game = await state.gameCheck(this.browser);

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
                const countryID = parseInt($('span[class*="memberYourCountry"]').attr('class').split(' ')[0].substr(-1));

                await module.exports.updateLearning(gameId, phase, countryID, page);
                //switching between the different phases
                switch (phase) {
                    case "Diplomacy":
                        await move.makeMove(html, gameId, page, debug);
                        break;
                    case "Builds":
                        await builder.makeMove(html, page);
                        break;
                    case "Retreats":
                        await retreater.makeMove(html, gameId, page);
                        break;
                }

                console.log(`Done making a move for game: ${gameId}`);
            } else if ($('span[class="gamePhase"]').text() === "Finished") {
                this.checkTraining(gameId);
            }
        });
    },

    async updateLearning(gameId, phase, countryID, page) {
        let episodes = await database.getEpisodes(gameId, countryID);
        if (episodes !== undefined && episodes.length !== 0 && episodes[0].phase !== phase) {
            //do the update
            for (let episode of episodes) {
                let R = await module.exports.checkMoveSuccess(episode, page);
                let type;
                if (episode.moveType === "Supported") {
                    R = await module.exports.checkMoveSuccess(episodes.find(e => e.unitID === episode.unitID && e.moveType !== episode.moveType), page);
                } else if (episode.moveType === "Ignore") {
                    R = await module.exports.checkMoveSuccess(episode, page);
                } else if (episode.configField === "neededFriendly") {
                    const e = episodes.find(e => e.targetID === episode.targetID && e.configField === "supportMove");
                    type = e.moveType === "Move" || e.moveType === "Support move" ? "attack" : "defense";
                    R = await module.exports.checkMoveSuccess(e, page);
                }
                const to = (await database.getTerritoryByID(gameId, episode.targetID)).name;
                const unit = (await util.getUnits(page)).find(u => u.ID === episode.unitID);
                let color = R ? "\x1b[32m" : "\x1b[31m";
                if (episode.configField !== "neededFriendly" && episode.moveType !== "Supported") {
                    console.log(color, `The ${unit.type} ${episode.moveType} to ${to}`);
                } else if (episode.configField === "neededFriendly") {
                    console.log(color, `The ${type} on ${to} has been carried out by ${episode.action} friendlies`);
                }
                R = R ? 1 : -1; //setting reward type, positive for success, negative for failure
                module.exports.updateValues(episode, R);
                module.exports.updatePolicy(episode);
                console.log("\x1b[0m");
            }
            console.log("\x1b[0m");
            await database.removeEpisodes(gameId, countryID);
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
        //console.log(episode, units.find(u => u.ID === episode.unitID));
        switch (episode.moveType) {
            case "Hold":
            case "Ignore":
            case "Move":
                return units.find(u => u.ID === episode.unitID).terrID === episode.targetID;
            case "Support move":
            case "Support hold":
                let unit = units.find(u => u.ID === episode.unitID);
                let terrUnit = units.find(u => u.terrID === episode.targetID);

                //find better solution
                return terrUnit !== undefined && unit.countryID === terrUnit.countryID;
        }
    }
};