const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

let database;
let closedList = [];
let openList = [];
let goalID = [];
let unitType;
let gameID;
let agent;
let browser;
let page;
let url;

module.exports = {


    async init(d, a, u, game, startID, goal, unit) {
        database = d;
        agent = a;
        url = u;
        browser = await puppeteer.launch();
        page = await browser.newPage();
        gameID = parseInt(game);
        closedList = [];
        openList = [];
        openList.push(new Node(-1, parseInt(startID)));
        goalID = parseInt(goal);
        unitType = unit;

        const access = CookieAccess(
            url.hostname,
            url.pathname,
            'https:' === url.protocol
        );

        for (let cookies in agent.jar.getCookies(access)) {
            cookies = agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = url;
                await page.setCookie(cookies);
            }
        }
        await page.goto(`${url}board.php?gameID=${gameID}`, { "waitUntil": "load" });

        return this;
    },


    inClosed(toID) {
        for (let c in closedList) {
            c = closedList[c];
            if (c.ID === toID) {
                return true;
            }
        }
        return false;
    },

    inOpen(toID) {
        for (let c in openList) {
            c = openList[c];
            if (c.ID === toID) {
                return true;
            }
        }
        return false;
    },

    async isLegalMove(fromID, toID) {
        //creating the mess... aka making a serializable object
        let mess = await page.evaluate((fromID, toID, unitType) => {
            let fromT = window.Territories._object[fromID];
            fromT.__proto__ = window.UnitClass.prototype;
            fromT.Territory = fromT;
            fromT.type = unitType;
            
            //return fromT.canMoveInto(Territories._object[toID]);
            return fromT.getMoveChoices().include(toID);
        }, fromID, toID, unitType);
        return mess;
    },

    async findPath() {
        while (openList.length !== 0) {
            let current = openList.shift();
            closedList.push(current);
            if (current.ID === goalID) {
                //construct from start to goal
                let path = [];
                while (current.ID !== undefined) {
                    let thing = await database.getTerritory(gameID, current.ID);
                    path.push(`${thing.name} ${thing.ID}`);
                    current = current.parent;
                }
                return path.reverse();

            } else {
                let rows = await database.getBorders(gameID, current.ID, unitType);
                for (let r in rows) {
                    r = rows[r];
                    if (!module.exports.inClosed(r.borderID) && !module.exports.inOpen(r.borderID) && await this.isLegalMove(current.ID, r.borderID)) {
                        openList.push(new Node(current, r.borderID));
                    }
                }
            }
        }
        return ['no', 'path'];
    }



};
Node = function (parent, id) {
    let self = {};
    self.parent = parent;
    self.ID = id;
    return self;
};