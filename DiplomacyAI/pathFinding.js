const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

PathFinding = function (d, a, u, game, startID, goal, unit) {
    this.database = d;
    this.agent = a;
    this.url = u;

    this.gameID = parseInt(game);
    this.closedList = [];
    this.openList = [];
    this.openList.push(new Node(-1, parseInt(startID)));
    this.goalID = parseInt(goal);
    this.unitType = unit;
    this.startID = startID;

    this.init = async function (ignoreGoal) {
        this.browser = await puppeteer.launch();
        this.page = await this.browser.newPage();

        const access = CookieAccess(
            this.url.hostname,
            this.url.pathname,
            'https:' === this.url.protocol
        );

        for (let cookies in this.agent.jar.getCookies(access)) {
            cookies = this.agent.jar.getCookies(access)[cookies];
            if (cookies !== undefined && cookies.value !== undefined) {
                cookies.url = this.url;
                await this.page.setCookie(cookies);
            }
        }
        await this.page.goto(`${this.url}board.php?gameID=${this.gameID}`, { "waitUntil": "load" });

        if (this.goalID <= -1 && !ignoreGoal) {
            this.goalID = await this.findClosestSupply(this.startID, Math.abs(this.goalID), blocked);
        }
    };

    this.findClosestSupply = async function (fromID, country) {
        let supplies = [];
        while (this.openList.length !== 0) {
            let current = this.openList.shift(); //get the next element in the queue
            this.closedList.push(current);
            current = await this.database.getTerritoryByID(this.gameID, current.ID); //get the next element in the queue
            let id = current.ID;
            let isHostileSupply = await this.page.evaluate((id, country) => {

                let fromT = window.Territories._object[id];
                return fromT.supply && parseInt(fromT.ownerCountryID) !== country;
            }, id, country);
            if (isHostileSupply) {
                //cleaning up and getting ready for path finding..
                this.openList = [];
                this.closedList = [];
                this.openList.push(new Node(-1, parseInt(fromID)));
                supplies.push(current.ID);

            } else {
                let rows = await this.database.getBorders(this.gameID, current.ID, this.unitType);
                for (let r in rows) {
                    r = rows[r];
                    //check if next id is good
                    if (!this.inClosed(r.borderID) && !this.inOpen(r.borderID)) {
                        this.openList.push(new Node(current, r.borderID));
                    }
                }
            }
        }
        return supplies;
    };

    //check if toID is in closed list
    this.inClosed = function (toID) {
        for (let c in this.closedList) {
            c = this.closedList[c];
            if (c.ID === toID) {
                return true;
            }
        }
        return false;
    };

    //check if toID is in open list
    this.inOpen = function (toID) {
        for (let c in this.openList) {
            c = this.openList[c];
            if (c.ID === toID) {
                return true;
            }
        }
        return false;
    };

    this.isLegalMove = async function (fromID, toID) {
        //creating the mess... creating an unit out of a Territory
        let unitType = this.unitType;
        return await this.page.evaluate((fromID, toID, unitType) => {
            let fromT = window.Territories._object[fromID];
            Object.extend(fromT, new window.UnitClass);
            fromT.Territory = fromT;
            fromT.type = unitType;

            return fromT.getMoveChoices().include(toID);
        }, fromID, toID, unitType);
    };

    this.findPath = async function () {
        while (this.openList.length !== 0) {
            let current = this.openList.shift(); //get the next element in the queue
            this.closedList.push(current);
            if (current.ID === this.goalID) {
                //construct from start to goal
                let path = [];
                while (current.ID !== undefined) {
                    let thing = await this.database.getTerritoryByID(this.gameID, current.ID);
                    path.push(thing.ID);
                    current = current.parent;
                }
                return path.reverse()[1];

            } else {
                let rows = await this.database.getBorders(this.gameID, current.ID, this.unitType);
                for (let r in rows) {
                    r = rows[r];
                    //check if next id is good
                    if (!this.inClosed(r.borderID) && !this.inOpen(r.borderID) && await this.isLegalMove(current.ID, r.borderID)) {
                        this.openList.push(new Node(current, r.borderID));
                    }
                }
            }
        }
        return -1;
    };

    return this;
};
Node = function (parent, id) {
    let self = {};
    self.parent = parent;
    self.ID = id;
    return self;
};