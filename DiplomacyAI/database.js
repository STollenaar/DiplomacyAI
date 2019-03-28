let sqlite = require('sqlite3').verbose();

let db = new sqlite.Database('./AI_DB.db');

module.exports = {

    addUser(name, pw, fs, callback) {
        let object = [];
        object.push({ 'Username': name, 'Password': pw });
        let json = JSON.stringify(object);
        fs.writeFile('./config.json', json, 'utf8', callback);
    },

    getUser(callback) {
        db.serialize(function () {
            db.get(`SELECT * FROM user;`, (err, row) => callback(row));
        });
    },

    addGame(user, game) {
        db.serialize(function () {
            db.run(`INSERT INTO games ('user', 'gameID') VALUES ('${user}', '${game}');`);
        });
    },

    getGames(user, callback) {
        db.serialize(function () {
            db.all(`SELECT * FROM games WHERE 'user'='${user}';`, (err, rows) => {
                callback(rows);
            });
        });
    },

    addTerritory(gameID, id, name, type, supply) {
        db.serialize(function () {
            db.run(`INSERT INTO territories ('gameID','ID', 'name', 'type', 'supply') VALUES (${gameID}, ${id}, '${name}', '${type}', '${supply}');`);
        });
    },

    addBorder(gameID, OwnID, BorderID, armyPass, fleetPass) {
        db.serialize(function () {
            db.run(`INSERT INTO borders ('gameID', 'ownID', 'borderID', 'armyPass', 'fleetPass') VALUES (${gameID}, ${OwnID}, ${BorderID}, '${armyPass}', '${fleetPass}');`);
        });
    },

    defaultConfig(fs, callback) {
        db.serialize(function () {
            db.get(`SELECT * FROM config;`, (err, rows) => {
                let object = [];
                object.push({ 'Username': rows.Username, 'Password': rows.Pw });
                let json = JSON.stringify(object);
                fs.writeFile('./config.json', json, 'utf8', callback);
            });
        });
    }
};