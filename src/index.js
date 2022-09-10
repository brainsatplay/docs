import fs from 'fs'
import path, { join } from 'path'
import process from 'process'
import https from 'https'

import showdown from 'showdown'


const pathSep = '/'
const readme = 'README.md'
const lineLinkRegex = /(?:.*)\](?:\(|:\s)([^)\n\s]+)\)?(?:[^\n]*)/g
const isRemote = (str) => str.slice(0,7) == 'http://'  || str.slice(0,8) == 'https://'
const correctExtension = (filePath, base) => {
    const name = path.basename(filePath)
    const ext = name.slice(-base.length)
    return ext === base
}

// This class manages all documentation generation for @brainsatplay/docs
class Docs {
    config = {}
    converter = new showdown.Converter();
    mappings = {}
    results = {}

    constructor(config = {}) {
        this.config = config
        if (!this.config.inDir) this.config.inDir = 'docs'
        if (!this.config.outDir) this.config.outDir = 'build'
    }

    generate = async (input = this.config.inDir, output = this.config.outDir) => {

        this.mappings = {} // clear mappings
        this.results = {}
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

        // Preload and Relink Publications
        for (let i in publications) {


            let requests = []
            const internalResults = {}
            let o = publications[i]
            const userRegex = new RegExp(`(.*)${o.pattern ?? ''}(.*)`, 'g')

            for (let filePath in results) {

                if (o) {

                    if (typeof o != 'object') o = { map: o }
                    let isString = typeof o.map === 'string'
                    const pubExt = o.extension ?? '.md' // default to look for markdown

                    let text, relativeTo
                    if (typeof results[filePath] === 'object') {
                        text = results[filePath].text
                        relativeTo = results[filePath].relativeTo
                    } else text =  results[filePath]

                    const matches = [...text.matchAll(lineLinkRegex)]

                    if (matches) {

                        // Organize matches
                        let links = {}
                        matches.forEach(n => {
                            const line = n[0]
                            const link = n[1]
                            const relativeFile = link[0] === '.' && correctExtension(link, o.extension)


                             // New Link
                             let after = o.pattern ? link.split(o.pattern).slice(-1)[0] : link // no pattern
                             const name = path.basename(after)
                             const correctExt = correctExtension(after, pubExt) // transfer files with the specified extension
 
                            // Allow Relative Links on Internal Loads
                            if (correctExt && ((relativeTo && relativeFile) || (o.pattern && link.match(userRegex)))) {

                                if (after[0] === pathSep) after = after.slice(1)
                                let split = after.split(pathSep)
                                const base = split[0]

                                let linkPath, savePath;
                                if (relativeTo) {
                                    let rel = filePath.split(config.input)[1]
                                    if (rel[0] === pathSep) rel = rel.slice(1)

                                    if (rel) {
                                        if (!o.map[base]) {
                                            console.error(`No mapping found`, relativeTo, config.input, link, filePath)
                                        } else {

                                            const thisPath = path.dirname(rel)
                                            const transferredSplit = o.map[base].split(pathSep)
                                            const thisSplit = thisPath.split(pathSep)

                                            let relative = []
                                            const filtered = transferredSplit.filter((v, i) => {
                                                if (thisSplit[i] !== v) {
                                                    relative.push('..')
                                                    return true
                                                } else return false
                                            })

                                            linkPath = path.join(...relative, ...filtered)
                                            if (!linkPath) linkPath = './' // this position
                                            linkPath = path.join(linkPath, name)

                                            savePath = path.join(config.input, thisPath, linkPath) // relative to this
                                        }
                                    }
                                    // else console.log('not rel', relativeTo, config.input, link, filePath)
                                }

                                // TODO: Maintain relative links. Flip to URLs if outside of downloaded sandbox.
                                if (relativeFile) {
                                    const container = (isString) ? o.map : o.map[base]
                                    if (container) {
                                        console.log('relative', link, base, relativeTo, filePath)
                                    }
                                }

                                links[line] = {
                                    link,
                                    remote: isRemote(link),
                                    relative: relativeFile,
                                    name,
                                    base,
                                    split,
                                    after,
                                    linkPath,
                                    savePath
                                }
                            }
                        })

                        // Iterate through Valid Links
                        for (let line in links) {
                            const {
                                link,
                                name,
                                base,
                                split,
                                after,
                            } = links[line]

                            let linkPath = links[line].linkPath
                            let savePath = links[line].savePath

                            // console.log('Line', line)

                                let rawLink = link

                                let basePath, remote = links[line].remote;

                                // transform raw link (github)
                                if (rawLink.includes('github.com') && split[1] !== 'raw') {
                                    const end = rawLink.split('github.com/')[1]
                                    console.log('Correting', [split[0], ...split.slice(2)])
                                    if (end) rawLink = `https://raw.githubusercontent.com/${end.replace(after, [split[0], ...split.slice(2)].join(pathSep))}`
                                }
                                
                                if (!linkPath){

                                    // Transform to New Directory
                                    if (relativeTo && !remote) {

                                        const relToNoFile = path.dirname(relativeTo)
                                        
                                        // Get Base Path
                                        basePath = path.join(path.dirname(filePath), rawLink) // no url

                                        // Update Raw Link
                                        try {
                                            rawLink = new URL(rawLink, relToNoFile).href
                                        } catch (e) {
                                            rawLink = path.join(relToNoFile, rawLink)
                                        }

                                        // Derive Link Path
                                        if (isString) basePath = path.join(o.map, basePath) // global
                                        else if (o.map && o.map[base]) basePath = path.join(o.map[base], basePath) // unique
                                        linkPath = basePath.replace(config.input, '')
                                        remote = isRemote(rawLink) // reset remote
                                    }
                                    else {
                                        if (isString) linkPath = o.map
                                        else if (o.map) linkPath = o.map[base]
                                    }

                                    if (path.basename(linkPath) !== name) linkPath = path.join(linkPath, name)

                                    if (linkPath[0] === pathSep) linkPath = linkPath.slice(1)
                                }

                                if (linkPath) {

                                    // Correct Save Path
                                    if (!savePath) savePath = path.join(config.input, linkPath)
                                    savePath = savePath.replace(readme, 'index.md') // Rename README.md


                                    if (
                                        remote 
                                        && !this.results[savePath]
                                        && (!fs.existsSync(savePath) || o.update)
                                    ) {

                                            this.check(savePath)
                                            const file = fs.createWriteStream(savePath);

                                            requests.push(new Promise((resolve, reject) => {
                                                https.get(rawLink, response => {

                                                    if (response.statusCode != 200) {
                                                        console.error(`Could not get ${rawLink}`)
                                                        reject()
                                                    } else {

                                                        var stream = response.pipe(file);
                                                        stream.on("finish", async () => {
                                                            const text = fs.readFileSync(savePath).toString()
                                                            this.results[savePath] = text
                                                            internalResults[savePath] = {
                                                                relativeTo:rawLink,
                                                                text
                                                            }

                                                            resolve(true)
                                                        });
                                                    }
                                                }).on('error',console.error);
                                            }))
                                        }

                                    // Update Links
                                    const newLine = line.replace(link, `${linkPath}`)

                                    // Assign Mappings for Later HTML Generation
                                    this.mappings[filePath] = text = text.replaceAll(line, newLine) // replace old line
                                   
                                   // Updating Original Text (only downloaded assets)
                                    if (relativeTo) {
                                        this.check(filePath) 
                                        fs.writeFileSync(filePath, this.mappings[filePath]) // WRITE FILES DIRECTLY WITH NEW LINKS
                                    }
                                }
                            }
                    }
                }
            }

            await Promise.allSettled(requests)
            const loaded = Object.keys(internalResults).length > 0
            if (loaded) await this.preload(internalResults, [{ ...o }], config)
        }

        return Object.keys(this.results).length > 0

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
        switch (ext) {
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
            fs.readdir(dir, (err, list) => {
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