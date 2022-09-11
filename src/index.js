import fs from 'fs'
import path, { join, resolve } from 'path'
import process from 'process'
import https from 'https'
import { exec } from "child_process"


import showdown from 'showdown'


const pathSep = '/'
const readme = 'README.md'
const lineLinkRegex = /(?:.*)\](?:\(|:\s)([^)\n\s]+)\)?(?:[^\n]*)/g
const correctExtension = (filePath, base) => {
    const name = path.basename(filePath)
    const ext = name.slice(-base.length)
    return ext === base
}
const isRemote = (str) => str.slice(0,7) == 'http://'  || str.slice(0,8) == 'https://'
const isRelative = (str, ext) => {
    return str[0] === '.' && (ext) ? correctExtension(str, ext) : true
}
const isMarkdown = (str) => str.includes('.md')



// This class manages all documentation generation for @brainsatplay/docs
class Docs {
    config = {}
    converter = new showdown.Converter();
    mappings = {}
    newFiles = {}
    broken = {}
    registry = {}
    copyDir = '.copy'

    constructor(config = {}) {
        this.config = config
        if (!this.config.inDir) this.config.inDir = 'docs'
        if (!this.config.outDir) this.config.outDir = 'build'
    }

    generate = async (input = this.config.inDir, output = this.config.outDir) => {

        this.mappings = {} // clear mappings
        this.newFiles = {}
    
        const config = {
            output,
            input,
        }


        const base = process.cwd()
        const inputLoc = path.join(base, input)
        const copyLoc = path.join(base, this.copyDir)
        const outputLoc = path.join(base, output)

        // Copy the Input Directory
        const res = this.check(path.join(copyLoc, 'dummy'));
        if (res) await this.clear(copyLoc) 
        await this.copy(inputLoc, copyLoc)
        config.input = this.copyDir

        // Clear the Output Directory
        const res2 = this.check(path.join(outputLoc, 'dummy'));
        if (res2) await this.clear(outputLoc)

        // List the Current Files
        const bases = this.getBases(config)
        const results = await this.list(bases.input);

        // Preload Linked (remote) Assets
        const loaded = await this.preload(results, this.config.publications, config)
        const updatedResults = (loaded) ? await this.list(bases.input) : results

        // Save New Assets as HTML
        for (let filePath in updatedResults) this.saveText(updatedResults[filePath], filePath, config)

        console.log('Documentation is complete!')
        return this.registry
    }

    getBases = (config) => {
        const main = process.cwd()
        const input =  path.join(main, config.input)
        return {
            main,
            input
        }
    }

    exec = (command) => {
        return new Promise((resolve, reject) => {

                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        reject(`error: ${error.message}`)
                        return;
                    }
                    if (stderr) {
                        reject(`error: ${stderr}`)
                        return;
                    }

                    resolve(stdout)
            });
        })
    }

    copy = async (source, destination) => await this.exec(`cp -r ${path.join(source, '*')} ${destination}`).catch(console.error)

    clear = async (dir) => await this.exec(`rm -r ${path.join(dir, '*')}`).catch(console.error)

    mergeSafe = (base, update) => {
        const baseNoFile = path.dirname(base)
        try {
            return new URL(update, baseNoFile + '/').href
        } catch (e) {
            return path.join(baseNoFile, update)
        }
    }


    handleLine = async (line, links, publication, info, config) => {

        const {
            link,
            name,
            base,
            split,
            after,
            remap
        } = links[line]

        const {
            relativeTo,
            isString,
            filePath,
        } = info


        let linkPath = links[line].linkPath
        let savePath = links[line].savePath

        // console.log('Line', line)

            let rawLink = link

            let basePath, remote = links[line].remote;

            // transform raw link (github)
            if (rawLink.includes('github.com') && split[1] !== 'raw') {
                const end = rawLink.split('github.com/')[1]
                if (end) rawLink = `https://raw.githubusercontent.com/${end.replace(after, [split[0], ...split.slice(2)].join(pathSep))}`
            }
            
            if (!linkPath){

                // Transform to New Directory
                if (relativeTo && !remote) {
                    
                    // Get Base Path
                    basePath = path.join(path.dirname(filePath), rawLink) // no url

                    // Update Raw Link
                    rawLink = this.mergeSafe(relativeTo, rawLink)

                    // Derive Link Path
                    if (isString) basePath = path.join(publication.map, basePath) // global
                    else if (publication.map && publication.map[base]) basePath = path.join(publication.map[base], basePath) // unique
                    linkPath = basePath.replace(config.input, '')
                    remote = isRemote(rawLink) // reset remote
                }
                else {
                    if (isString) linkPath = publication.map
                    else if (publication.map) linkPath = publication.map[base]
                }

                if (!linkPath) linkPath = name
                if (path.basename(linkPath) !== name) linkPath = path.join(linkPath, name)

                if (linkPath[0] === pathSep) linkPath = linkPath.slice(1)
            }



            // Stop Broken Links (remote only...)
            if (linkPath && !this.broken[rawLink]) {

                // Correct Save Path
                if (!savePath) savePath = path.join(config.input, linkPath)

                // Rename README.md Files
                savePath = savePath.replace(readme, 'index.md')

                const has = this.newFiles[savePath]
                let exists =  fs.existsSync(savePath) 

                // console.log('Link PAth', linkPath, savePath, exists, has, remote)
                // ------------ Download Files From Remote Source ------------
                if (
                    remote // is a remote file
                    && !has // do not current have updates
                    && (!exists || publication.update) // does not exist in filesytem (or update is requested)
                ) {

                        this.check(savePath)
                        const file = fs.createWriteStream(savePath);

                        // Wait for Files to Download
                        await new Promise((resolve, reject) => {

                            https.get(rawLink, response => {

                                if (response.statusCode != 200) {
                                    if (response.statusCode === 404) this.broken[rawLink] = link // flag broken links
                                    else console.error('Error Downloading', response.statusCode, rawLink)
                                    reject()
                                } else {

                                    var stream = response.pipe(file);
                                    stream.on("finish", async () => {
                                        const text = fs.readFileSync(savePath).toString()
                                        if (text == '') console.log('Empty File', savePath)
                                        this.newFiles[savePath] = text
                                        info.internalResults[savePath] = {
                                            relativeTo:rawLink,
                                            text
                                        }

                                        resolve(true)
                                    });
                                }
                            }).on('error', console.error);
                        }).catch(e => {
                            console.error('Error', e)
                        })
                    }

                const gotten = this.newFiles[savePath]

                // ------------ Update Links Appropriately ------------
                if ((exists || gotten !== undefined)) info.text = this.replaceLine(line, link, linkPath, filePath, info.text, remap, relativeTo) // update text
                else console.error(`No file was created or found at ${savePath}`, rawLink)
            }
    }


    handleLink = (link, publication, info, config) => {
        const relativeFile = isRelative(link, publication.extension)
        let remoteFile = isRemote(link)

            const {
                line,
                pubExt,
                userRegex,
                relativeTo,
                isString,
                filePath,
            } = info

         // New Link
         let after = publication.pattern ? link.split(publication.pattern).slice(-1)[0] : link // no pattern
         const name = path.basename(after)
         const correctExt = correctExtension(after, pubExt) // transfer files with the specified extension

        // Allow Relative Links on Internal Loads
        const pattern = (publication.pattern && link.match(userRegex))
        if (
            correctExt && 
            (relativeFile || pattern)
        ) {


            if (
                relativeTo || 
                pattern 
            ) {
                

            if (after[0] === pathSep) after = after.slice(1)
            let split = after.split(pathSep)
            const base = split[0]

            let linkPath, savePath;

            let mapping = (isString) ? publication.map : publication.map[base]
            let hasMapping = !!mapping // TODO: Check this with isString=true...

            
            let rel = filePath.split(config.input)[1]
            if (rel?.[0] === pathSep) rel = rel.slice(1)
            if (rel){
                const thisPath = path.dirname(rel)

                if (relativeFile) {
                    const nBack = link.split('../').length - 1
                    const possible = thisPath.split(pathSep).length
                    if (nBack >= possible) {
                        const url = this.mergeSafe(relativeTo, link)
                        console.log(`Relinking ${link} in ${relativeTo} to ${url}`)
                        info.text = this.replaceLine(line, link, url, filePath, info.text, false, relativeTo) // update text
                        return
                    }
                }

            if (relativeTo) {

                    // Local Map (otherwise use default remote mapping)
                    if (hasMapping) {

                        const transferredSplit = mapping.split(pathSep)
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
            }

            return {
                link,
                remote: remoteFile,
                relative: relativeFile,
                name,
                base,
                split,
                after,
                linkPath,
                savePath,
                remap: (relativeTo && !hasMapping) ? false : true
            }
    } else {
        const markdown = isMarkdown(link)
        if (markdown) {
            console.log('Relinking to HTML (broken)', link)
            info.text = this.replaceLine(line, link, link, filePath, info.text, false, relativeTo) // update text
        }
    }
}
    }

    preload = async (results, publications, config) => {

        // Preload and Relink Publications
        for (let i in publications) {


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

                        let info = {
                            pubExt,
                            userRegex,
                            relativeTo,
                            isString,
                            filePath,
                            text,
                            internalResults
                        }

                        matches.forEach(n => {

                            const line = n[0]
                            const link = n[1]

                            const copy = Object.assign({}, info)
                            copy.line = line

                            const res = this.handleLink(link, o, copy, config)

                            if (res) links[line] = res

                        })

                        // Iterate through Valid Links
                        for (let line in links) await this.handleLine(line, links, o, info, config)
                    }
                }
            }

            const loaded = Object.keys(internalResults).length > 0
            if (loaded) await this.preload(internalResults, [{ ...o }], config)
        }

        return Object.keys(this.newFiles).length > 0

    }

    replaceLine = (line, link, newLink, filePath, text, remap = true, updateOriginal=false) => {



            const update = !!updateOriginal
            const ogNewLink = newLink
            
            // Transform Markdown to HTML Links
            const remote = isRemote(newLink)

            if (!remote) {
                if (!remap) {
                    newLink = link.slice(0,-2) + 'html'
                    remap = true
                }
            }

          // Update Links
          newLink = newLink.replace(readme, 'index.md') 
          newLink = newLink.replace('index.md', 'index.html') // TODO: Ensure this doesn't reach the source!
          if (newLink == '') newLink = './'

          // console.log('Updateing the link', linkPath)
          const linkUpdate = (remap) ? `${newLink}` : link
        const newLine = line.replace(link, linkUpdate)

        // console.log('newLine', filePath, newLine, update)

        
        // console.log('Updating', filePath, 'with', newLine)
        // Assign Mappings for Later HTML Generation
        this.mappings[filePath] = text = text.replaceAll(line, newLine) //html transformation
    
        // Updating Original Text (only downloaded assets)
        if (update) {
            this.check(filePath) 
            fs.writeFileSync(filePath, this.mappings[filePath]) // WRITE FILES DIRECTLY WITH NEW LINKS
        }

        const html = path.join(this.config.outDir, this.mergeSafe(filePath, linkUpdate))
        const md = path.join(this.copyDir, ogNewLink)

        // TODO: Make this registry hold all the transformations that are required. Only then execute them!
        if (!this.registry[filePath]) this.registry[filePath] = {}
        
        this.registry[filePath][line] = {
            link,
            linkUpdate,
            newLink,
            ogNewLink,
            html,
            md
        }

        return text
    }


    saveText = (text, filePath, config) => {

        const { input, main } = this.getBases(config)

        const { output } = config

        let ext = path.extname(filePath)
        if (filePath.includes('.wasl.json')) ext = '.wasl' // recognize .wasl.json files

        const notCommon = filePath.replace(input, '')

        // Deal with Different File Types
        switch (ext) {
            case '.md':
                const html = this.converter.makeHtml(text);
                const newUnique = notCommon.replace('.md', '.html')
                const newPath = path.join(main, output, newUnique)
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
        if (fs.existsSync(dirname)) return true;

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