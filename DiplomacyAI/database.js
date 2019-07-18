let sqlite = require('sqlite3').verbose();

let db = new sqlite.Database('./AI_DB.db');

module.exports = {
    getUser(callback) {
        db.serialize(() => {
            db.get(`SELECT * FROM user;`, (err, row) => callback(row));
        });
    },

    addGame(user, game) {
        db.serialize(() => {
            db.run(`INSERT INTO games ('username', 'gameID') VALUES ('${user}', ${game});`);
        });
    },

    getGames(user) {
        return new Promise(resolve => {
            db.serialize(() => {
                db.all(`SELECT gameID FROM games WHERE username='${user}';`, (err, rows) => {
                    resolve(rows);
                });
            });
        });
    },

    removeGame(gameID) {
        db.serialize(() => {
            db.run(`DELETE FROM episodes WHERE gameID=${gameID};`);
            db.run(`DELETE FROM games WHERE gameID=${gameID};`);
            db.run(`DELETE FROM borders WHERE gameID=${gameID};`);
            db.run(`DELETE FROM territories WHERE gameID=${gameID};`);
        });
    },

    addTerritory(gameID, id, name, type, supply) {
        db.serialize(() => {
            db.run(`INSERT INTO territories ('gameID','ID', 'name', 'type', 'supply') VALUES (${gameID}, ${id}, '${name}', '${type}', '${supply}');`);
        });
    },

    getTerritoryByID(gameID, id) {
        return new Promise(resolve => {
            db.serialize(() => {
                db.get(`SELECT * FROM territories WHERE gameID=${gameID} AND ID=${id};`, (err, row) => resolve(row));
            });
        });
    },

    getTerritoryByName(gameID, name) {
        return new Promise(resolve => {
            db.serialize(() => {
                db.get(`SELECT * FROM territories WHERE gameID=${gameID} AND name='${name}';`, (err, row) => resolve(row));
            });
        });
    },

    addBorder(gameID, OwnID, BorderID, armyPass, fleetPass) {
        db.serialize(() => {
            db.run(`INSERT INTO borders ('gameID', 'ownID', 'borderID', 'armyPass', 'fleetPass') VALUES (${gameID}, ${OwnID}, ${BorderID}, '${armyPass}', '${fleetPass}');`);
        });
    },

    getBordersRestricted(gameID, OwnID, type) {
        if (type.toLowerCase() === "army") {
            return new Promise(resolve => {
                db.serialize(() => {
                    db.all(`SELECT * FROM borders WHERE gameID=${gameID} AND ownID=${OwnID} AND armyPass='true';`, (err, rows) => resolve(rows));
                });
            });
        } else {
            return new Promise(resolve => {
                db.serialize(() => {
                    db.all(`SELECT * FROM borders WHERE gameID=${gameID} AND ownID=${OwnID} AND fleetPass='true';`, (err, rows) => resolve(rows));
                });
            });
        }
    },

    getBorders(gameID, OwnID) {
        return new Promise(resolve => {
            db.serialize(() => {
                db.all(`SELECT * FROM borders WHERE gameID=${gameID} AND ownID=${OwnID};`, (err, rows) => resolve(rows));
            });
        });
    },

    generateEpisode(gameID, phase, field, risk, action, numActions, unitID, moveType, targetID, countryID) {
        db.serialize(() => {
            db.get(`SELECT * FROM episodes WHERE gameID=${gameID} AND countryID=${countryID} AND configField = '${field}' AND unitID = '${unitID}';`, (err, row) => {
                if (row === undefined) {
                    db.run(`INSERT INTO episodes ('gameID', 'countryID', 'phase', 'configField', 'risk', 'action', 'numActions', 'unitID', 'moveType', 'targetID') VALUES (${gameID}, ${countryID}, '${phase}', '${field}', ${risk}, ${action}, ${numActions}, '${unitID}', '${moveType}', '${targetID}');`);
                } else {
                    db.run(`UPDATE episodes SET targetID='${targetID}', moveType='${moveType}', risk=${risk}, action=${action}, numActions=${numActions} WHERE gameID = ${gameID} AND countryID =${countryID}  AND configField = '${field}' AND unitID = '${unitID}'; '`);
                }
            });
        });
    },

    getEpisodes(gameID, countryID) {
        return new Promise(resolve => {
            db.serialize(() => {
                db.all(`SELECT * FROM episodes WHERE gameID=${gameID} AND countryID=${countryID} ORDER BY targetID ASC, unitID ASC;`, (err, rows) => resolve(rows));
            });
        });
    },

    removeEpisodes(gameID, countryID) {
        db.serialize(() => {
            db.run(`DELETE FROM episodes WHERE gameID=${gameID} AND countryID=${countryID};`);
        });
    },

    defaultConfig(fs, callback) {
        db.serialize(() => {
            db.get(`SELECT * FROM config;`, (err, rows) => {
                let object = {
                    'Username': rows.Username, 'Password': rows.Pw, 'Site': rows.Site,
                    'attackOccupiedRisk': rows.attackOccupiedRisk, 'attackEmptyRisk': rows.attackEmptyRisk,
                    'retreatRisk': rows.retreatRisk
                };
                let json = JSON.stringify(object, null, 4);
                fs.writeFile('./config.json', json, 'utf8', callback);
            });
        });
    },

    updateConfig(fs, config) {
        return new Promise(resolve => {
            fs.writeFile('./config.json', JSON.stringify(config, null, 4), 'utf8', () => resolve());
        });
    }
};