const _ = require('lodash');

module.exports = {

    //extracting the best possible choices for each unit to make to get to the closest supply depot
    extractLowestDistance(array) {
        let maxRow = array.map(row => Math.max.apply(Math, row.map(function (o) { return o.distance; }))); //row with the highest distance in it
        let maxD = Math.max.apply(Math, maxRow.map(function (o) { return o; })); //highest total distance
        let maxI = array.length; //amount of indexes I need to work with and need results for

        let results = [];
        for (let i = 0; i <= maxD; i++) {
            let objects = [];
            //dumps the current distance in the array without including already found indexes
            array.forEach((value, index) => objects[index] = value.filter(a => a.distance === i
                && !results.map(o => o.index).includes(a.index)
                && !results.map(o => o.name.split('(')[0].trim()).includes(a.name.split('(')[0].trim())));
            //getting every unique value at the current distance and adding that in the results
            let xor = _.xorBy(...objects, (e) => e.name.split('(')[0].trim());
            //grouping the duplicates
            let countedXor = _.countBy(_.flatten(xor), e => e.index);
            countedXor = Object.keys(countedXor).map(e => { return{ "index": parseInt(e), "value": parseInt(countedXor[e]) }; }).filter(e => e.value > 1);
            //removing any duplicate indexes just in case
            countedXor.forEach(e => {
                let xorFil = xor.filter(a => a.index === e.index);
                while (e.value > 1) {
                    let objectToRemove = xorFil[Math.floor(Math.random() * Math.floor(xorFil.length))];
                    xor = xor.filter(a => a.id !== objectToRemove.id);
                    xorFil = xor.filter(a => a.id !== objectToRemove.id);
                    e.value--;
                }
            });
            results = results.concat(xor);

            //maybe set this in a loop such that the result slowly gets filled?
            objects.forEach((value, index) => objects[index] = value.filter(a => !results.map(o => o.index).includes(a.index)));
            objects = objects.filter(e => e.length !== 0);

            //grouping the duplicates
            let counted = _.countBy(_.flatten(objects), e => e.name.split('(')[0].trim());
            counted = Object.keys(counted).map(e => { return { "name": e, "value": counted[e] }; });
            let resDupTotal = [];

            //going over every grouped duplicate and finding the best combination possible
            for (let dup of counted) {
                for (let d = 0; d < dup.value; d++) {
                    let objectCopy = Array.from(objects);
                    //getting a duplicate from the array
                    let grabbedDup = _.flatten(objectCopy).filter(e => e.name.split('(')[0].trim() === dup.name)[d];
                    //filtering out other duplicates, same as with the normal xor above
                    objectCopy.forEach((value, index) => objectCopy[index] = value.filter(a => a.index !== grabbedDup.index
                        && a.name.split('(')[0].trim() !== grabbedDup.name.split('(')[0].trim()));
                    objectCopy = objectCopy.filter(e => e.length !== 0);
                    let xorDup = _.xorBy(...objectCopy, (e) => e.name.split('(')[0].trim());
                    //grouping the duplicates
                    let countedXor = _.countBy(_.flatten(xorDup), e => e.index);
                    countedXor = Object.keys(countedXor).map(e => { return { "index": parseInt(e), "value": parseInt(countedXor[e]) }; }).filter(e => e.value > 1);
                    //removing any duplicate indexes just in case same as above
                    countedXor.forEach(e => {
                        let xorFil = xorDup.filter(a => a.index === e.index);
                        while (e.value > 1) {
                            let objectToRemove = xorFil[Math.floor(Math.random() * Math.floor(xorFil.length))];
                            xorDup = xorDup.filter(a => a.id !== objectToRemove.id);
                            xorFil = xorDup.filter(a => a.id !== objectToRemove.id);
                            e.value--;
                        }
                    });
                    //seeing if this results in the duplicate filtering being done
                    if (xorDup.length + results.length + 1 === maxI) {
                        let totalD = xorDup.reduce((tot, e) => tot + e.distance, 0);
                        xorDup.push(grabbedDup);
                        resDupTotal.push({ 'totalD': totalD, 'entries': xorDup });
                    } else {
                        //removing from array all results, xorDup and grabbedDub
                        let nextA = [];
                        array.forEach((value, index) => nextA[index] = value.filter(a =>
                            grabbedDup.name.split('(')[0].trim() !== a.name.split('(')[0].trim()
                            && grabbedDup.index !== a.index
                            && !results.map(o => o.index).includes(a.index)
                            && !results.map(o => o.name.split('(')[0].trim()).includes(a.name.split('(')[0].trim())
                            && !xorDup.map(o => o.index).includes(a.index)
                            && !xorDup.map(o => o.name.split('(')[0].trim()).includes(a.name.split('(')[0].trim())));
                        nextA = nextA.filter(e => e.length !== 0);
                        //going recursive
                        let recursionEnd = module.exports.extractLowestDistance(nextA);
                        let totalD = recursionEnd.reduce((tot, e) => tot + e.distance, 0) + xorDup.reduce((tot, e) => tot + e.distance, 0);
                        //adding it all together
                        xorDup.push(grabbedDup);
                        resDupTotal.push({ 'totalD': parseInt(totalD), 'entries': recursionEnd.concat(xorDup) });
                    }
                }
            }
            //finished the results with the duplicates
            if (resDupTotal.length > 0) {
                //sorting the results of the duplicates and adding to the normal result list
                results = results.concat(resDupTotal.sort((a, b) => a.totalD - b.totalD)[0].entries);
            }
            //checking if done and returning is so
            if (results.length === maxI) {
                results = results.sort((a, b) => a.index - b.index);
                return results;
            }
        }

        //not having a proper results, but still gotta return something
        results = results.sort((a, b) => a.index - b.index);
        return results;
    },


    calculateRisk(targetUnit, surTerr, units) {
        surTerr.forEach(terr => {
            //getting the risk number for supporting
            terr.risk = units.filter(u => u.id !== targetUnit.id && u.moveChoices.includes(String(terr.fromId))).length;
        });
        surTerr = surTerr.sort((a, b) => a.risk - b.risk);
        return surTerr;
    }
};