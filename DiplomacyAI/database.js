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

    generateEpisode(gameId, phase, field, risk, action, numActions, unitId, moveType, targetId) {
        db.serialize(() => {
            db.get(`SELECT * FROM episodes WHERE gameID=${gameId} AND configField='${field}' AND unitId='${unitId}'`, (err,row) => {
                if (row === undefined) {
                    db.run(`INSERT INTO episodes ('gameID','phase', 'configField', 'risk', 'action', 'numActions', 'unitId', 'moveType', 'targetId') VALUES (${gameId}, '${phase}', '${field}', ${risk}, ${action}, ${numActions}, '${unitId}', '${moveType}', '${targetId}');`);
                } else {
                    db.run(`UPDATE episodes SET targetId='${targetId}', moveType='${moveType}', risk=${risk}, action=${action}, numActions=${numActions} WHERE gameId = ${ gameId } AND configField = '${field}' AND unitId = '${unitId}'; '`);
                }
            });
        });
    },

    getEpisodes(gameId) {
        return new Promise(resolve => {
            db.serialize(() => {
                db.all(`SELECT * FROM episodes WHERE gameID=${gameId};`, (err, rows) => resolve(rows));
            });
        });
    },

    removeEpisodesByPhase(gameId, phase) {
        db.serialize(() => {
            db.run(`DELETE FROM episodes WHERE gameID=${gameId} AND phase='${phase}';`);
        });
    },

    removeEpisodesByUnitId(gameId, unitId) {
        db.serialize(() => {
            db.run(`DELETE FROM episodes WHERE gameID=${gameId} AND unitId='${unitId}';`);
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