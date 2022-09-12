import fs from 'fs'
import path from 'path'
import process from 'process'
import https from 'https'
import { exec } from "child_process"
import showdown from 'showdown'


const pathSep = '/'
const readme = 'README.md'
const lineLinkRegex = /(?:.*)\](?:\(|:\s)([^)\n\s]+)\)?(?:[^\n]*)/g
const markdown = '.md'
const htmlCommentRegex = /\<\!\-\-\s([^\s].*)\s\-\-\>/g

const extension = (filePath) => {
    const split = path.basename(filePath).split('/').slice(-1)[0].split('.')
    if (split.length > 1) return split.slice(-1)[0]
    else return ''
}

const correctExtension = (filePath, base) => {
    const name = path.basename(filePath)
    const ext = name.slice(-base.length)
    return ext === base
}

const isRemote = (str) => str.slice(0, 7) == 'http://' || str.slice(0, 8) == 'https://'
const isRelative = (str, ext) => str[0] === '.' && ((ext) ? correctExtension(str, ext) : true)
const isMarkdown = (str) => (str.slice(-markdown.length) === markdown)


const create = {
    title: {
        generator: (text) => `<title>${text}</title>`,
        format: 'text'
    },
    stylesheet: {
        generator: (link) => `<link rel=stylesheet href="${link}"/>`,
        format: 'link'
    },
    content: {
        generator: (text) => text,
        format: 'text'
    },
    favicon: {
        generator: (link) => `<link rel="icon" href="${link}" type="image/x-icon" />`,
        format: 'link'
    }
}

const converter = new showdown.Converter();

// This class manages all documentation generation for @brainsatplay/docs
class Docs {

    debug = false
    config = null

    // File Registries
    originalFiles = {}
    downloads = {
        saved: {},
        raw: {}
    }

    // Collections
    broken = {}
    invalid = {}

    unmapped = {}
    unmatched = {}
    ignored = {}
    written = {}

    // Main Changelog
    changes = {}

    constructor(config, debug) {
        if (debug) this.debug = debug

        if (config) {
            this.config = Object.assign({}, config)
            if (!this.config.mdIn) this.config.mdIn = 'docs'
            if (!this.config.htmlOut) this.config.htmlOut = 'build'
            if (!this.config.mdOut) this.config.mdOut = '.copy'
            if (!this.config.templates) this.config.templates = {
                html: './templates/document.template.html',
                wasl: './templates/wasl.template.html'
            }
        }
    }

    generate = async (input, output, copy, templates) => {

        const tic = performance.now()

        if (!this.config) {
            this.config = (await import(path.join(process.cwd(), 'docs.config.js'))).default
            if (!this.config) {
                console.log('Could not find a docs.config.json file in the root directory.')
                return
            }
        }

        // Clear File Collections
        this.originalFiles = {}
        this.downloads = {
            saved: {},
            raw: {}
        }

        this.broken = {}
        this.invalid = {}
        this.ignored = {}
        this.unmapped = {}
        this.unmatched = {}
        this.changes = {}
        this.written = {}

        // Create Config
        const config = this.config
        config.input = input ?? this.config.mdIn
        config.output = output ?? this.config.htmlOut
        config.copy = copy ?? this.config.mdOut
        if (templates) config.templates = templates

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
        const noChanges = []
        const cantHandle = []
        const copied = []

        for (let filePath in updatedResults) {
            let thisChanges = this.getChanges(filePath, changes)
            const res = this.saveText(updatedResults[filePath], thisChanges, filePath, config)
            if (res) {
                if (!thisChanges) noChanges.push(this.getRelName(filePath))
            } else {
                if (res === false) cantHandle.push(filePath.replace(`${bases.main}/`, ''))
                else copied.push(filePath.replace(`${bases.main}/`, ''))
            }
        }


        const isBoolean = typeof this.debug === 'boolean'

        const debugUnchanged = isBoolean ? this.debug : this.debug?.unchanged
        const debugUnsupported = isBoolean ? this.debug : this.debug?.unsupported
        const debugCopied = isBoolean ? this.debug : this.debug?.copied
        const debugBroken = isBoolean ? this.debug : this.debug?.broken
        const debugIgnored = isBoolean ? this.debug : this.debug?.ignored
        const debugWritten = isBoolean ? this.debug : this.debug?.written
        const debugUnmapped = isBoolean ? this.debug : this.debug?.unmapped
        const debugUnmatched = isBoolean ? this.debug : this.debug?.unmatched
        const debugInvalid = isBoolean ? this.debug : this.debug?.invalid

        if (debugUnchanged && noChanges.length > 0) {
            console.log(`\n--------------- Unchanged Files ---------------`)
            noChanges.forEach(str => console.log(`- ${str}`))
        }

        if (debugUnsupported && cantHandle.length > 0) {
            console.log(`\n--------------- Unsupported Files ---------------`)
            cantHandle.forEach(str => console.log(`- ${str}`))
        }

        if (debugCopied && copied.length > 0) {
            console.log(`\n--------------- Copied Files ---------------`)
            copied.forEach(str => console.log(`- ${str}`))
        }

        if (debugWritten && Object.keys(this.written).length > 0){
            console.log(`\n--------------- Files Written with Changes ---------------`)
            for (let raw in this.written) console.log(`- ${raw}`)
        }

        if (debugBroken && Object.keys(this.broken).length > 0) {
            console.log(`\n--------------- Broken Links ---------------`)
            for (let raw in this.broken) console.log(`- ${raw} | ${this.broken[raw]}`)
        }

        if (debugInvalid && Object.keys(this.invalid).length > 0) {
            console.log(`\n--------------- Invalid Links ---------------`)
            for (let link in this.invalid) console.log(`- ${this.invalid[link].filePath} | ${link}`)
        }

        if (debugIgnored && Object.keys(this.ignored).length > 0) {
            console.log(`\n--------------- Ignored Links ---------------`)
            for (let raw in this.ignored) console.log(`- ${raw} | ${this.ignored[raw]}`)
        }

        if (debugUnmapped && Object.keys(this.unmapped).length > 0) {
            console.log(`\n--------------- Unmapped Links ---------------`)
            for (let link in this.unmapped) console.log(`- ${link}`)
        }

        if (debugUnmatched && Object.keys(this.unmatched).length > 0) {
            console.log(`\n--------------- Unmatched Remote Links ---------------`)
            for (let link in this.unmatched) console.log(`- ${link}`)
        }

        console.log(`\nDocumentation completed in ${((performance.now() - tic) / 1000).toFixed(3)} seconds.\n`)
        return true
    }

    getRelName = (name) => name.replace(`${process.cwd()}/`, '')

    getChanges = (name, changes = this.changes) => changes[name] ?? changes[this.getRelName(name)]
    getOriginalFile = (name) => this.originalFiles[name] ?? this.originalFiles[path.join(process.cwd(), name)]

    getBases = (config) => {
        const main = process.cwd()
        const input = path.join(main, config.input)
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


    handleLine = async (line, links, info, config) => {

        const {
            link,
            mapping,
            name,
        } = links[line]

        const {
            relativeTo,
            filePath,
        } = info


        let linkPath = links[line].linkPath
        let savePath = links[line].savePath
        let remap = links[line].remap
        let remote = links[line].remote;

        let rawLink = link
        let basePath;

        if (!linkPath) {

            // Transform to New Directory
            if (relativeTo && !remote) {

                // Get Base Path
                basePath = path.join(path.dirname(filePath), rawLink) // no url

                // Update Raw Link
                rawLink = this.mergeSafe(relativeTo, rawLink)

                // Derive Link Path
                // if (mapping) basePath = path.join(mapping, basePath)

                linkPath = basePath.replace(config.input, '')
                remote = isRemote(rawLink) // reset remote
            } else if (mapping) linkPath = mapping
        }

        const fullLink = rawLink
        let rawLinkPath = fullLink

        // transform raw link (github)
        const search = 'github.com'
        if (rawLink.includes(search)) {
            const split = rawLink.split(`${search}/`)
            const end = split[1].split(pathSep)

            if (end) {

                // includes branch
                rawLink = `https://raw.githubusercontent.com/${[...end.slice(0,2), ...end.slice(3)].join(pathSep)}`
                
                // removes branch
                rawLinkPath = [
                    (split[0].slice(-1) === pathSep) ? split[0].slice(0, -1) : split[0], 
                    search, 
                    ...end.slice(0,2), 
                    ...end.slice(4)].join(pathSep
                )
            }
        }

        if (!linkPath) linkPath = name
        if (path.basename(linkPath) !== name) linkPath = path.join(linkPath, name)

        if (linkPath[0] === pathSep) linkPath = linkPath.slice(1)


        // Stop Broken Links (remote only...)
        if (linkPath && !this.broken[fullLink]) {

            // Remap Files that have Already Been Transferred
            const downloadedAt = this.downloads.raw[fullLink]
            if (downloadedAt) {
                let newLinkPath = this.pathTo(downloadedAt, path.dirname(filePath))
                console.log('newLinkPath', newLinkPath)
                this.registerChange(line, link, newLinkPath, filePath, true, relativeTo, 'transferred') // update text
                return
            } 
            
            // Handle Untransferred Files
            else {

                // Correct Save Path
                if (!savePath) savePath = path.join(config.input, linkPath)

                // Rename README.md Files
                savePath = savePath.replace(readme, 'index.md')



                // Check If Link Points to the Docs Source
                const internal = rawLinkPath.includes(path.join(config.repository, config.mdIn))
                if (internal) savePath = savePath.replace(`${path.join(mapping, config.mdIn)}/`, '')

                const has = this.downloads.saved[savePath] // something has been downloaded here
                const exists = fs.existsSync(savePath) // something exists here
                const fromOriginal = !!this.getOriginalFile(savePath)

                // ------------ Handle Remote File Paths ------------
                if (remote) {

                    // Relink
                    const relinked = has || exists || internal
                    if (relinked) {
                        linkPath = this.pathTo(savePath, path.dirname(filePath)) // relink to existing file
                        remap = true
                    }

                    // ------------ Download Files From Remote Source ------------
                    else {

                        // console.log('Downloaded File Check', this.downloads[rawLink], rawLink)

                        // Avoid Overwriting Original Files
                        if (fromOriginal) {
                            this.ignored[fullLink] = link
                            console.log(`Cannot overwite original file at ${savePath} with the contents of ${rawLink}.`)
                            return // ignore changes
                        } 
                        
                        // Download New Assets
                        else {
                            this.check(savePath)
                            const file = fs.createWriteStream(savePath);

                            // Wait for Files to Download
                            await new Promise((resolve, reject) => {

                                https.get(rawLink, response => {

                                    if (response.statusCode != 200) {
                                        if (response.statusCode === 404) this.broken[fullLink] = link // flag broken links
                                        else console.error('Error Downloading', response.statusCode, fullLink, filePath)
                                        reject()
                                    } else {

                                        var stream = response.pipe(file);
                                        stream.on("finish", async () => {
                                            let text = fs.readFileSync(savePath).toString()
                                            this.downloads.raw[fullLink] = savePath
                                            this.downloads.saved[savePath] = text

                                            info.internalResults[savePath] = {
                                                relativeTo: fullLink,
                                                text
                                            }

                                            resolve(true)
                                        });
                                    }
                                }).on('error', console.error);
                            }).catch(e => console.error)
                        }
                    } 
                } else {
                    this.ignored[fullLink] = link
                    return
                }


                const gotten = this.downloads.saved[savePath]


                // ------------ Update Links Appropriately ------------
                if ((exists || gotten !== undefined)) this.registerChange(line, link, linkPath, filePath, remap, relativeTo, 'transferred') // update text
                else console.error(`No file was created or found at ${savePath}`, rawLink)
            }
        }
    }


    handleLink = (link, publication, info, config) => {
        const remoteFile = isRemote(link)
        const markdown = isMarkdown(link)
        const relativeFile = !remoteFile
        const absoluteFile = !isRelative(link, publication.extension) && relativeFile

        const {
            line,
            pubExt,
            userRegex,
            relativeTo,
            isString,
            filePath,
        } = info

        // Get the New Link
        let rel = filePath.split(config.input)[1]
        if (rel?.[0] === pathSep) rel = rel.slice(1)
        let after = publication.pattern ? link.split(publication.pattern).slice(-1)[0] : link // no pattern
        if (after[0] === pathSep) after = after.slice(1)
        const name = path.basename(after)



        let correctExt = correctExtension(after, pubExt) // transfer files with the specified extension


        // Allow Relative Links on Internal Loads
        const pattern = (publication.pattern && link.match(userRegex))


        if (
            (correctExt) &&
            (relativeFile || pattern)
        ) {
            
            // Main Check
            if (
                relativeTo ||
                pattern
            ) {


                let linkPath, savePath;
                const split = after.split(pathSep)
                const base = (remoteFile) ? split[0] : rel.split(pathSep)[1] // reference parent if not remote
                let mapping = (isString) ? publication.map : publication.map[base]

                let hasMapping = remoteFile && !!mapping // Must be remote // TOOD: Check when isString = true

                if (rel) {
                    const thisPath = path.dirname(rel)

                    if (relativeFile) {
                        const nBack = link.split('../').length - 1
                        const possible = thisPath.split(pathSep).length

                        // Relink local to remote (if relative path goes out of the sandbox)
                        if (nBack >= possible) {
                            const url = path.join(this.mergeSafe(relativeTo, link), name)
                            this.registerChange(line, link, url, filePath, true, relativeTo, 'external')
                            return
                        }
                    }

                    if (relativeTo) {

                        // Local Map (otherwise use default remote mapping)
                        if (hasMapping) {
                            linkPath = this.map(thisPath, mapping, name)
                            savePath = path.join(config.input, thisPath, linkPath) // relative to this
                            if (linkPath?.[0] != '.') linkPath = `./${linkPath}` // force relative
                        }
                    }
                }
 
                return {
                    link,
                    remote: remoteFile,
                    relative: relativeFile,
                    absolute: absoluteFile,
                    name,
                    remap: (relativeTo && !hasMapping) ? false : true,
                    mapping,
                    linkPath,
                    savePath,
                }
            }

            // Remap All Internal Markdown Links to HTML
            else if (markdown) this.registerChange(line, link, link, filePath, false, relativeTo, 'internal')
        
        } 
        
        // Catch Errors
        else {

            // Common Regular Expression Issues
            const hasSpaces = link.includes(' ')
            if (hasSpaces) return

            const isQuoted =  [`"`, `'`, '`'].includes(link[0])
            if (isQuoted) return

            const isComment =  link.slice(0, 2) === '//'
            if (isComment) return

            // No Match for Remote Link
            if (remoteFile)  this.unmatched[link] = true

            // Invalid Local Link
            else if (extension(link) === '')  {

                // Try Linking to Remote
                if (relativeTo){
                    this.registerChange(line, link, this.mergeSafe(relativeTo, link), filePath, true, true, 'external')
                    return
                } 
                
                // Mark as Invalid
                else {
                    this.invalid[link] = {
                        link,
                        filePath: `${config.mdIn}/${filePath.split(`${config.input}/`)[1]}`, // transform filePath to be readable and accessible by link
                        line
                    }
                    return
                }
            } 
            // else this.unsupported[link] = true
        }
    }

    map = (thisPath, absoluteMapPath, name) => {

        const transferredSplit = absoluteMapPath.split(pathSep)
        const thisSplit = thisPath.split(pathSep)

        if (!name) name = thisSplit.pop() // derive name

        let relative = []
        const filtered = transferredSplit.filter((v, i) => {
            if (thisSplit[i] !== v) {
                relative.push('..')
                return true
            } else return false
        })

        const res = path.join(path.join(...relative, ...filtered), name)

        return res
    }

    // Use Two Paths to Get a Relative Path Between Them
    pathTo = (to, from, name) => {


        const fromSplit = from.split(pathSep)
        const toSplit = to.split(pathSep)

        if (!name) name = toSplit.pop() // derive name

        const index = fromSplit.findIndex((v, i) => (toSplit[i] !== v) ? true : false)

        let mapped = name
        if (index > 0) {
            const nBack = fromSplit.length - index
            mapped = path.join(path.join(...Array.from({ length: nBack }, () => '..'), ...toSplit.slice(index)), name)
        }

        if (mapped[0] !== '.') return `./${mapped}`
        else return mapped
    }

    addChange = (filePath, line, link, type, { html, markdown } = {}) => {
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

        return {
            type: typeRef,
            file: fileRef,
            link: typeRef[link]
        }
    }

    preload = async (results, publications, config) => {

        // Preload and Relink Publications
        for (let i in publications) {


            const internalResults = {}
            let o = publications[i]
            const userRegex = new RegExp(`(.*)${o.pattern ?? ''}(.*)`, 'g')

            for (let filePath in results) {

                const extension = path.extname(filePath)

                if (extension.slice(-markdown) === markdown) {

                    if (o) {

                        if (typeof o != 'object') o = { map: o }
                        let isString = typeof o.map === 'string'
                        const pubExt = o.extension ?? '.md' // default to look for markdown

                        let text, relativeTo
                        if (results[filePath].constructor.name === 'Buffer') text = results[filePath].toString() // Buffer
                        else if (typeof results[filePath] === 'object') {
                            text = results[filePath].text
                            relativeTo = results[filePath].relativeTo
                        } else text = results[filePath]


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
                            for (let line in links) await this.handleLine(line, links, info, config)
                        }
                    }
                }
            }

            const loaded = Object.keys(internalResults).length > 0
            if (loaded) await this.preload(internalResults, [{ ...o }], config)
        }

        return (Object.keys(this.changes).length > 0) ? this.changes : false // pass changes if any were found

    }

    registerChange = (line, link, newLink, filePath, remap = true, updateOriginal = false, type) => {

        const update = !!updateOriginal

        // Transform Markdown to HTML Links
        const remote = isRemote(newLink)

        // Keep Original if Remap is False
        if (!remote) {
            if (!remap) {
                newLink = link.slice(0, -2) + 'html'
                remap = true
            }
        }

        // Update Links
        let markdownProposed = newLink.replace(readme, 'index.md')
        let htmlProposed = markdownProposed.replace('/index.md', '/index.html')

        // Update HTML Links
        htmlProposed = markdownProposed.replace('/index.md', '')

        // Always Convert Local to HTML
        if (!remote) {
            const split = htmlProposed.split('.')
            split.pop()
            split.push('html')
            htmlProposed = split.join('.')
        }

        if (htmlProposed == '') htmlProposed = './'
        if (markdownProposed == '') markdownProposed = './'

        // Complete the Remapping
        const html = (remap) ? `${htmlProposed}` : link
        const markdown = (remap) ? `${markdownProposed}` : link

        // Track Changes
        const refs = this.addChange(filePath, line, link, type, { html, markdown })

        if (update && !refs.file._write) {
            Object.defineProperty(refs.file, '_write', {
                value: true,
                enumerable: false
            })
        }

        return refs.link
    }


    saveText = (buffer, changes, filePath, config) => {

        const { input, main } = this.getBases(config)
        const { output, templates } = config

        let ext = path.extname(filePath)
        if (filePath.includes('.wasl.json')) ext = '.wasl' // recognize .wasl.json files


        for (let ext in templates) {
            if (typeof templates[ext] === 'string') {
                templates[ext] = {
                    text: fs.readFileSync(templates[ext]).toString(),
                    map: {}
                }

                const matches = [...templates[ext].text.matchAll(htmlCommentRegex)]
                matches.forEach(arr => {
                    const comment = arr[0]
                    const key = arr[1]
                    templates[ext].map[key] = comment
                })
            }
        }

        // console.log('templates', templates)

        const notCommon = filePath.replace(input, '')

        const isBoolean = typeof this.debug === 'boolean'
        const debugHTML = isBoolean ? this.debug : this.debug?.html

        const changeLog = (path) => (debugHTML) ? console.log(`--------------- ${path.replace(`${main}/`, '')} ${changes._write ? '(saved)' : ''} ---------------`) : null
        const changeLogSubheader = (message) => (debugHTML) ? console.log(`--- ${message} ---`) : null
        const changeLogListItem = (message) => (debugHTML) ? console.log(`- ${message}`) : null

        // Deal with Different File Types

        let pathToUse = ''
        let returnVal = false

        const nBack = notCommon.split(pathSep).length - 2
        const rel = Array.from({ length: nBack }, _ => '..').join('/')

        const commentReplacements = {
            content: '',
            defaultstylesheet: `<style>\n${fs.readFileSync('./templates/default.css')}\n</style>`,
        }

        for (let key in create) {
            if (config[key] && create[key]) {
                commentReplacements[key] = create[key].generator(create[key].format === 'link' ? path.join(rel, config[key]) : config[key])
            }
        }



        switch (ext) {
            case '.md':

                let text = buffer.toString()

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

                    if (changes._write) {
                        this.written[filePath] = true
                        fs.writeFileSync(filePath, mdText);
                    }

                    if (debugHTML) console.log('\n')
                }

                pathToUse = path.join(main, output, notCommon.replace('.md', '.html'))
                ext = '.html'
                returnVal = true
                commentReplacements.content = converter.makeHtml(text); // html content
                break;

            case '.wasl':
                return false

            default:
                pathToUse = path.join(main, output, notCommon)
                commentReplacements.content = buffer.toString()
                returnVal = undefined
                break;
        }

        if (pathToUse) {

            let content = commentReplacements.content
            const template = templates[ext.slice(1)]
            if (template) {
                content = template.text // replace with template
                for (let key in template.map) {
                    const rep = commentReplacements[key]
                    if (rep) content = content.replace(template.map[key], rep)
                }
            } else content = buffer // replace with buffer for non-template files


            this.check(pathToUse)
            fs.writeFileSync(pathToUse, content);
        }

        return returnVal
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
                            results[file] = fs.readFileSync(file)
                            if (!--pending) resolve(results);
                        }
                    });
                });
            });
        })
    };
}

export default Docs