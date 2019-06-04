const CookieAccess = require('cookiejar').CookieAccessInfo;
const puppeteer = require('puppeteer');

PathFinding = function (d, a, u, game, startID, goal, unit) {
    this.database = d;
    this.agent = a;
    this.url = u;

    this.gameID = parseInt(game);
    this.closedList = [];
    this.openList = [];
    this.openList.push(new Node(-1, parseInt(startID), 0));
    this.goalID = parseInt(goal);
    this.unitType = unit;
    this.startID = startID;

    this.init = async function (ignoreGoal, page) {
        this.page = page;

        if (this.goalID <= -1 && !ignoreGoal) {
            this.goalID = await this.findClosestSupply(this.startID, Math.abs(this.goalID), blocked);
        }
    };

    this.findClosestSupply = async function (fromID, country, index) {
        return new Promise(async resolve => {
            let supplies = [];
            while (this.openList.length !== 0) {
                let current = this.openList.shift(); //get the next element in the queue
                this.closedList.push(current);
                let thing = await this.database.getTerritoryByID(this.gameID, current.ID); //get the next element in the queue
                let id = current.ID;
                let isHostileSupply = await this.page.evaluate((id, country) => {

                    let fromT = window.Territories._object[id];
                    return fromT.supply && parseInt(fromT.countryID) !== parseInt(country);
                }, id, country);
                if (isHostileSupply) {
                    let h = current.h;
                    while (current.parent !== undefined && current.parent !== -1 && current.parent.ID !== this.startID) {
                        current = current.parent;
                    }
                    supplies.push({ id: current.ID, name: (await this.database.getTerritoryByID(this.gameID, current.ID)).name, distance:h, index:index});
                } else {
                    let rows = await this.database.getBorders(this.gameID, thing.ID, this.unitType);
                    for (let r in rows) {
                        r = rows[r];
                        //check if next id is good
                        if (!this.inClosed(r.borderID) && !this.inOpen(r.borderID)) {
                            this.openList.push(new Node(current, r.borderID, current.h+1));
                        }
                    }
                }
            }
            //cleaning up and getting ready for path finding..
            this.openList = [];
            this.openList.push(new Node(-1, parseInt(fromID), 0));
            this.closedList = [];
            resolve(supplies);
        });
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
                await this.page.close();
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
};
Node = function (parent, id, h) {
    let self = {};
    self.parent = parent;
    self.ID = id;
    self.h = h;
    return self;
};