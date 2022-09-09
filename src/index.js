import fs from 'fs'
import path from 'path'
import process from 'process'
import https from 'https'

import showdown from 'showdown'


const pathSep = '/'
const readme = 'README.md'

// This class manages all documentation generation for @brainsatplay/docs
class Docs {
    config = {}
    converter = new showdown.Converter();
    mappings = {}

    constructor(config= {}) {
        this.config = config
        if (!this.config.inDir) this.config.inDir = 'docs'
        if (!this.config.outDir) this.config.outDir = 'build'
    }

    generate = async (input=this.config.inDir, output=this.config.outDir) => {

        this.mappings = {} // clear mappings
        const base = process.cwd()
        const inputBase = path.join(base, input)
        const results = await this.list(inputBase);


        const config = {
            base,
            inputBase,
            output,
            input
        }

        const loaded = await this.preload(results, this.config.publications, config)
        const updatedResults = (loaded) ? await this.list(inputBase) : results
        for (let filePath in updatedResults) this.saveText(updatedResults[filePath], filePath, config)
    }


    preload = async (results, publications, config) => {

        let internalResults = {} // don't duplicate requests
        let requests = []

        const lineRegex = (pattern) => new RegExp(`(.+)${pattern}([^\n]*)`, 'g')

        let types = {
            remote: {
                list: publications.remote,
                link: (pattern) => new RegExp(`http(.+)${pattern}([^)\n ]*)`, 'g')
            },
            local: {
                list: publications.local,
                link: () => new RegExp(`http(.+)${pattern}([^)\n ]*)`, 'g')
            }
        }

        for (let filePath in results)  {

            // Preload and Relink Publications
            // TODO: Add support for locally linked publications (maybe hosted remotely)
            for (let type in types){

                const info = types[type]
                const o = info.list
                if (o){
                const lines = results[filePath].match(lineRegex(o.pattern))
                if (lines){
                    const linkRegex = info.link(o.pattern)
                    const links = {}
                    lines.forEach(str => {
                        const matches = str.match(linkRegex)
                        if (matches) links[str] = matches[0]
                    })

                    for (let line in links){
                        const link = links[line]

                        // get new link
                        let after = link.split(o.pattern).slice(-1)[0] // no pattern
                        const name = path.basename(after)
                        const ext = name.slice(-o.extension.length)

                        // transfer files with the specified extension
                        if (ext === o.extension) {    

                            if (after[0] === pathSep) after = after.slice(1)

                            let split = after.split(pathSep)
                            const base = split[0]

                            let rawLink = link

                            // transform to raw link (github)
                            if (link.includes('github.com') && split[1] !== 'raw') {
                                const end = link.split('github.com/')[1]
                                if (end) rawLink = `https://raw.githubusercontent.com/${end.replace(after, [split[0], ...split.slice(2)].join(pathSep))}`
                            }


                            const newDirectory = o.map[base] // only directly after
                            if (newDirectory){
                                // Download File to Location
                                const defaultPath = path.join(newDirectory, name) 
                                const linkPath =  name === readme ? newDirectory : defaultPath 
                                const srcLoc = path.join(config.input, defaultPath).replace(readme, 'index.md') // Rename README.md
                                
                                if (!internalResults[srcLoc] && (!fs.existsSync(srcLoc) || o.update)) {
                                    this.check(srcLoc)
                                    const file = fs.createWriteStream(srcLoc);

                                    requests.push(new Promise((resolve, reject) => {
                                        https.get(rawLink, response => {
                                        var stream = response.pipe(file);
                                        stream.on("finish", async () => {
                                            const text = fs.readFileSync(srcLoc).toString()
                                            internalResults[srcLoc] = text
                                            resolve(true)
                                            // this.saveText(text, buildPath, config) // save html too
                                        });
                                        });
                                    }))
                                }

                                // Replace Link
                                // TODO: Get this to apply...
                                const newLine = line.replace(link, `${linkPath}`)
                                this.mappings[filePath] = results[filePath].replaceAll(line, newLine) // replace old line
                            } 
                        }
                    }
            }
        }
        }
    }

        await Promise.allSettled(requests)

        const loaded = Object.keys(internalResults).length > 0
        if (loaded) await this.preload(internalResults, {
        }, config)

        console.log('All the Transformed', this.mappings)
        return loaded

    }


    saveText = (text, filePath, config) => {

        const {
            base,
            inputBase,
            output
        } = config

        let ext = path.extname(filePath)
        if (filePath.includes('.wasl.json')) ext = '.wasl' // recognize .wasl.json files

        const notCommon = filePath.replace(inputBase, '')

        // Deal with Different File Types
        switch(ext) {
            case '.md': 
                const html = this.converter.makeHtml(text);
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
                if (this.mappings[file]) {
                    results[file] = this.mappings[file] // use updated text
                    if (!--pending) resolve(results);
                } else {
                    if (stat && stat.isDirectory()) {
                    const res = await this.list(file);
                    results = Object.assign(results, res)
                    if (!--pending) resolve(results);
                    } else {
                    results[file] = fs.readFileSync(file).toString()
                    if (!--pending) resolve(results);
                    }
                }
            });
            });
        });
    })
    };
}

export default Docs