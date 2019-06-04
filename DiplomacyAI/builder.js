const pathfinding = require('./pathFinding');
const _ = require('lodash');

let agent;
let cheerio;
let database;



module.exports = {
    init(a, c, d) {
        agent = a;
        cheerio = c;
        database = d;
    }

}