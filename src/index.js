import fs from 'fs'
import path from 'path'
import process from 'process'
import https from 'https'

import showdown from 'showdown'


// This class manages all documentation generation for @brainsatplay/docs
class Docs {
    config = {}
    converter = new showdown.Converter();

    constructor(config= {}) {
        this.config = config
        if (!this.config.inDir) this.config.inDir = 'docs'
        if (!this.config.outDir) this.config.outDir = 'build'
    }

    generate = async (input=this.config.inDir, output=this.config.outDir) => {
        const base = process.cwd()
        const inputBase = path.join(base, input)
        const results = await this.list(inputBase);

        for (let file in results) {
            let ext = path.extname(file)
            if (file.includes('.wasl.json')) ext = '.wasl' // recognize .wasl.json files

            const notCommon = file.replace(inputBase, '')

            let wasCreatedNow = {}


            // Get Remote Publications
            this.config.publications.remote.forEach(o => {
                const regex = new RegExp(`(.+)${o.pattern}([^\n]*)`, 'g')
                const lines = results[file].match(regex)
                if (lines){
                    const linkRegex = new RegExp(`http(.+)${o.pattern}([^)\n ]*)`, 'g')
                    const links = {}
                    lines.forEach(str => links[str]=  str.match(linkRegex)[0])
                    for (let line in links){
                        const link = links[line]

                        // get new link
                        let ext = link.split(o.pattern).slice(-1)[0]

                        // transfer files with the specified extension
                        if (ext.slice(-o.extension.length) === o.extension) {
                            console.log('IS AN MD')
                            if (ext[0] === '/') ext = ext.slice(1)
                            const newLink = o.map[ext]
                            if (newLink){
                                // Download File to Location
                                const location = path.join(output, newLink)
                                if (!wasCreatedNow[location] && (!fs.existsSync(location) || o.update)) {
                                    this.check(location)
                                    const file = fs.createWriteStream(location);
                                    https.get(link, response => {
                                    var stream = response.pipe(file);
                                    stream.on("finish", function() {
                                        console.log("done streaming " + link);
                                    });
                                    });
                                }

                                // Replace Link
                                const newLine = line.replace(link, newLink)
                                results[file] = results[file].replaceAll(line, newLine) // replace old line
                            } 
                        }
                    }
            }

            })

            // Deal with Different File Types
            switch(ext) {
                case '.md': 
                    const html = this.converter.makeHtml(results[file]);
                    const newUnique = notCommon.replace('.md', '.html')
                    const newPath = path.join(base, output, newUnique)
                    this.check(newPath)
                    fs.writeFileSync(newPath, html);
                    break;
                case '.wasl': 
                    console.log(`Generate HTML for wasl file (${notCommon})...`);
                    break;
                default: 
                    console.warn(`Can't handle`, notCommon)
                    break;

            }
        }

    }

    check = (filePath) => {
        var dirname = path.dirname(filePath);
        if (fs.existsSync(dirname)) {
          return true;
        }
        this.check(dirname);
        fs.mkdirSync(dirname);
      }

    save(path, content) {
        return new Promise((resolve, reject) => {
            fs.writeFile(path, content, (err) => {
                if (err) return reject(err);
                return resolve();
            });
        })
    };

    list = (dir) => {

        return new Promise((resolve, reject) => {
        var results = {};
        fs.readdir(dir, (err, list)  => {
            if (err) return reject(err);
            var pending = list.length;
            if (!pending) return resolve(results);
            list.forEach((file) => {
                file = path.resolve(dir, file);
            fs.stat(file, async (err, stat) => {
                if (stat && stat.isDirectory()) {
                const res = await this.list(file);
                results = Object.assign(results, res)
                if (!--pending) resolve(results);
                } else {
                results[file] = fs.readFileSync(file).toString()
                if (!--pending) resolve(results);
                }
            });
            });
        });
    })
    };
}

export default Docs