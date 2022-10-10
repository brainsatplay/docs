import fs from 'fs'
import path from 'path'

export const check = (filePath) => {
    var dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) return true;

    check(dirname);
    fs.mkdirSync(dirname);
}

export const save = (path, content) => {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, content, (err) => {
            if (err) return reject(err);
            return resolve();
        });
    })
};