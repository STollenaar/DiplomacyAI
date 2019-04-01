let database;
let closedList = [];
let openList = [];
let goalID = [];
let unitType;
let gameID;

module.exports = {


    init(d, game, startID, goal, unit) {
        database = d;
        gameID = parseInt(game);
        closedList = [];
        openList = [];
        openList.push(new Node(-1, parseInt(startID)));
        goalID = parseInt(goal);
        unitType = unit;
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

    async findPath() {
        while (openList.length !== 0) {
            let current = openList.pop();
            closedList.push(current);
            if (current.ID === goalID) {
                //construct from start to goal
                let path = [];
                while (current.ID !== undefined) {
                    let thing = await database.getTerritory(gameID, current.ID);
                    path.push(thing.name);
                    current = current.parent;
                }
                return path.reverse();

            } else {
                let rows = await database.getBorders(gameID, current.ID, unitType);
                for (let r in rows) {
                    r = rows[r];
                    if (!module.exports.inClosed(r.borderID) && !module.exports.inOpen(r.borderID)) {
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