import fs from 'fs'
import path from 'path'
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
const isRelative = (str, ext) => str[0] === '.' && ((ext) ? correctExtension(str, ext) : true)
const isMarkdown = (str) => str.includes('.md')


const converter = new showdown.Converter();

// This class manages all documentation generation for @brainsatplay/docs
class Docs {
    config = {}

    // File Registries
    newFiles = {}
    originalFiles = {}

    // Collections
    broken = {}
    ignored = {}

    // Main Changelog
    changes = {}

    constructor(config) {
        this.config = config
        if (this.config){
            if (!this.config.mdIn) this.config.mdIn = 'docs'
            if (!this.config.htmlOut) this.config.htmlOut = 'build'
            if (!this.config.mdOut) this.config.mdOut = '.copy'
        }
    }

    generate = async (input, output, copy) => {

        const tic = performance.now()

        if (!this.config) {
            this.config = (await import(path.join(process.cwd(), 'docs.config.json'), {assert: {type: 'json'}})).default
            if (!this.config) {
                console.log('Could not find a docs.config.json file in the root directory.')
                return
            }
        }

        this.newFiles = {}
        const config = {
            input: input ?? this.config.mdIn,
            output: output ?? this.config.htmlOut,
            copy: copy ?? this.config.mdOut
        }



        const base = process.cwd()
        const inputLoc = path.join(base, config.input)
        const copyLoc = path.join(base, config.copy)
        const outputLoc = path.join(base, config.output)

        // Copy the Input Directory
        const res = this.check(path.join(copyLoc, 'dummy'));
        if (res) await this.clear(copyLoc) 
        await this.copy(inputLoc, copyLoc)
        config.input = config.copy // proxy input to copy

        // Clear the Output Directory
        const res2 = this.check(path.join(outputLoc, 'dummy'));
        if (res2) await this.clear(outputLoc)

        // List the Current Files
        const bases = this.getBases(config)
        this.originalFiles = await this.list(bases.input);

        // Preload Remote Assets + Changes
        const changes = await this.preload(this.originalFiles, this.config.publications, config)
        const updatedResults = (changes) ? await this.list(bases.input) : this.originalFiles // grab list with new files

        // Save New Assets as HTML
        console.log(`\n---------------------------- SAVING TO HTML ----------------------------`)
        const noChanges = []
        const cantHandle = []

        
        for (let filePath in updatedResults) {
            let thisChanges = this.getChanges(filePath, changes)
            const res = this.saveText(updatedResults[filePath], thisChanges, filePath, config)
            if (res) {
                if (!thisChanges) noChanges.push(this.getRelName(filePath))
            } else cantHandle.push(filePath.replace(`${bases.main}/`, ''))
        }

        if (noChanges.length > 0){
            console.log(`\n--------------- Unchanged Files ---------------`)
            noChanges.forEach(str => console.log(`- ${str}`))
        }

        if (cantHandle.length > 0){
            console.log(`\n--------------- Unsupported Files ---------------`)
            cantHandle.forEach(str => console.log(`- ${str}`))
        }

        if (Object.keys(this.broken).length > 0) {
            console.log(`\n--------------- Broken Links ---------------`)
            for (let raw in this.broken) console.log(`- ${raw}, ${this.broken[raw]}`)
        }

        if (Object.keys(this.ignored).length > 0) {
            console.log(`\n--------------- Ignored Links ---------------`)
            for (let raw in this.ignored) console.log(`- ${raw}, ${this.broken[raw]}`)
        }

        console.log(`\nDocumentation completed in ${((performance.now()-tic)/1000).toFixed(3)} seconds.\n`)
        return true
    }

    getRelName = (name) => name.replace(`${process.cwd()}/`, '')
 
    getChanges = (name, changes=this.changes) => changes[name] ?? changes[this.getRelName(name)]
    getOriginalFile = (name) => this.originalFiles[name] ?? this.originalFiles[path.join(process.cwd(), name)]

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
            remap,
        } = links[line]

        const {
            relativeTo,
            isString,
            filePath,
            results
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

                    const fileExisted = this.getOriginalFile(savePath) // can save to file
                    if (fileExisted){
                        this.ignored[rawLink] = link
                        console.log(`Cannot overwite original file at ${savePath} with the contents of ${rawLink}.`)
                        return // ignore changes
                    } else {
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
                        }).catch(e => console.error)
                    }
                } 


                const gotten = this.newFiles[savePath]

                // ------------ Update Links Appropriately ------------
                if ((exists || gotten !== undefined)) this.registerChange(line, link, linkPath, filePath, remap, relativeTo, 'transferred') // update text
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
                        this.registerChange(line, link, url, filePath, false, relativeTo, 'external') // relinking local to remote (goes out of sandbox)
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
                        linkPath = path.join(linkPath, name)
                        savePath = path.join(config.input, thisPath, linkPath) // relative to this
                        if (linkPath?.[0] != '.') linkPath = `./${linkPath}` // force relative
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
    } 
    
    // Remap All Local Markdown to HTML
    else {
        const markdown = isMarkdown(link)
        if (markdown) this.registerChange(line, link, link, filePath, false, relativeTo, 'internal') // internal link remapped to html
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
                            internalResults,
                            results
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

        return (Object.keys(this.changes).length > 0) ? this.changes : false // pass changes if any were found

    }

    registerChange = (line, link, newLink, filePath, remap = true, updateOriginal=false, type="standard") => {

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
          let markdownProposed = newLink.replace(readme, 'index.md') 
          let htmlProposed = markdownProposed.replace('/index.md', '/index.html') 

          // Update HTML Links
          htmlProposed = markdownProposed.replace('/index.md', '')
          htmlProposed = htmlProposed.replace('/index.html', '')

          if (htmlProposed == '') htmlProposed = './'
          if (markdownProposed == '') markdownProposed = './'
          
          // Complete the Remapping
          const html = (remap) ? `${htmlProposed}` : link
          const markdown = (remap) ? `${markdownProposed}` : link

          // Track Changes
        if (!this.changes[filePath]) this.changes[filePath] = {}

        const fileRef = this.changes[filePath]
        if (!fileRef[type]) fileRef[type] = {}

        const typeRef = this.changes[filePath][type]
        if (typeRef[link]) typeRef[link].lines.push(line)
        else {
            typeRef[link] = {
                lines: [line],
                html,
                markdown
            }
        }

        if (update && !fileRef._write) {
            Object.defineProperty(fileRef, '_write', {
                value: true,
                enumerable: false
            })
        }

        return typeRef[link]
    }


    saveText = (text, changes, filePath, config) => {

        const { input, main } = this.getBases(config)

        const { output } = config

        let ext = path.extname(filePath)
        if (filePath.includes('.wasl.json')) ext = '.wasl' // recognize .wasl.json files

        const notCommon = filePath.replace(input, '')

        const changeLog = (path) => console.log(`--------------- ${path.replace(`${main}/`, '')} ${changes._write ? '(saved)' : ''} ---------------`)
        const changeLogSubheader = (message) => console.log(`--- ${message} ---`)
        const changeLogListItem = (message) => console.log(`- ${message}`)

        // Deal with Different File Types
        switch (ext) {
            case '.md':
                if (changes) {

                    let mdText = text
                    changeLog(filePath)
                    for (let type in changes) {
                        changeLogSubheader(`${type[0].toUpperCase() + type.slice(1)} Links`)

                        for (let link in changes[type]) {
                            const { lines, markdown } = changes[type][link]
                            let html = changes[type][link].html
                            changeLogListItem(`${link} —> ${html}`)
                            lines.forEach(line => {
                             
                                text = text.replace(line, line.replace(link, html)) // update for HTML
                                mdText = mdText.replace(line, line.replace(link, markdown)) // update for MD
                            })
                        }
                    }

                    if (changes._write) fs.writeFileSync(filePath, mdText);
                    console.log('\n')
                }

                const html = converter.makeHtml(text);
                const newUnique = notCommon.replace('.md', '.html')
                const newPath = path.join(main, output, newUnique)
                this.check(newPath)
                fs.writeFileSync(newPath, html);
                return true

            case '.wasl':
                return false

            default:
                return false
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