import fs from 'fs'
import path from 'path'
import process from 'process'
import { exec } from "child_process"
import * as utils from './utils/index.js'
import Document from './Document.js'
import https from 'https'


const readme = utils.readme

const markdown = utils.markdown
const isRemote = utils.isRemote

// This class manages all documentation generation for @brainsatplay/docs
class Docs {

    debug = false
    config = null

    // File Registries
    documents = {}
    downloads = {}

    // Collections
    links = []

    log = {
        broken: {},
        invalid: {},

        unmapped: {},
        unmatched: {},
        ignored: {},
        written: {},
        unsupported: {}
    }


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
        this.links = []
        this.documents = {}

        this.log.invalid = {}
        this.log.ignored = {}
        this.log.unmapped = {}
        this.log.unmatched = {}
        this.log.changes = {}
        this.log.written = {}

        // Create Config
        this.config.input = input ?? this.config.mdIn
        this.config.output = output ?? this.config.htmlOut
        this.config.copy = copy ?? this.config.mdOut

        if (templates) this.config.templates = templates

        const base = process.cwd()
        const inputLoc = path.join(base, this.config.input)
        const copyLoc = path.join(base, this.config.copy)
        const outputLoc = path.join(base, this.config.output)

        // Copy the Input Directory
        const res = utils.filesystem.check(path.join(copyLoc, 'dummy'));
        if (res) await this.clear(copyLoc)
        await this.copy(inputLoc, copyLoc)
        this.config.input = this.config.copy // proxy input to copy // TODO: Make sure this doesn't break anything

        // Clear the Output Directory
        const res2 = utils.filesystem.check(path.join(outputLoc, 'dummy'));
        if (res2) await this.clear(outputLoc)

        // List the Current Files
        const bases = utils.getBases(this.config)

        // Preload Remote Assets + Changes
        await this.getDocuments(bases.input); // get all documents
        const changes = await this.relink(this.config.publications)

        if (changes) {
            this.documents = {}
            await this.getDocuments(bases.input) // Get new documents
        }

        // Save New Assets as HTML
        this.save(changes)

        console.log(`\nDocumentation completed in ${((performance.now() - tic) / 1000).toFixed(3)} seconds.\n`)
        return true
    }

    save = (changes) => {

        const noChanges = []
        const cantHandle = []
        const copied = []

        for (let filePath in this.documents) {
            let thisChanges = this.getChanges(filePath, changes)
            const res = this.documents[filePath].save(thisChanges)
            if (res) {
                if (!thisChanges) noChanges.push(this.getRelName(filePath))
            } else {
                const main = process.cwd()
                if (res === false) cantHandle.push(filePath.replace(`${main}/`, ''))
                else copied.push(filePath.replace(`${main}/`, ''))
            }
        }

        this.report({
            noChanges,
            cantHandle,
            copied,
        })
    }

    getRelName = (name) => name.replace(`${process.cwd()}/`, '')

    getChanges = (name, changes = this.changes) => changes[name] ?? changes[this.getRelName(name)]
    getOriginalDocument = (name) => {
        const document = this.documents[name] ?? this.documents[path.join(process.cwd(), name)]
        if (document?.type === 'filesystem') return document
    }

    validate = (links = this.links) => {

        const invalid = []
        links.forEach(o => {

            // Only Validate Internal Links
            if (!o.remote) {
                const exists = fs.existsSync(o.link)
                if (!exists) invalid.push(o)
            }

        })

        return invalid.length > 0 ? invalid : true

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

    relink = async () => {
        // Relink Documents
            for (let filePath in this.documents) {
                const document = this.documents[filePath]
                const extension = path.extname(filePath)
                if (extension.slice(-markdown.length) === markdown)  await document.relink()
        }

        return (Object.keys(this.changes).length > 0) ? this.changes : false // pass changes if any were found

    }

    addDocument = async (filePath, input, options={}, relink=true) => {

            if (this.documents[filePath]) return this.documents[filePath] // Avoid duplication

            // Add Markdown Documents to the Docs Generator
            const extension = path.extname(filePath)
            if (extension.slice(-markdown) === markdown) {
                
                if (!input) input = fs.readFileSync(filePath).toString()

                // create document
                const document = this.documents[filePath] = this.downloads[options.origin] = new Document(filePath, input, {context: this, ...options})

                if (relink) await document.relink()
                return document
            }
    }

    registerChange = (linkInstance) => {


        const line = linkInstance.line
        const link = linkInstance.value
        let update = linkInstance.update
        const filePath = linkInstance.info.document.path

        const updateOriginal = true // linkInstance.updateOriginal // Determine whether to update the original
        const type = linkInstance.type

        // Transform Markdown to HTML Links
        if (!update) update = link
        const original = update

        if (path.extname(update) !== '.md') return // Do not convert to html...

        const remote = isRemote(update)

        // Update Links
        let markdownProposed = update.replace(readme, 'index.md')
        let htmlProposed = markdownProposed.replace('/index.md', '/index.html')

        // Update HTML Links
        const allRelative = markdownProposed.includes('/index.md') && markdownProposed.includes('./index.md')
        if (!allRelative) htmlProposed = markdownProposed.replace('/index.md', '')

        // Always Convert Local to HTML
        if (!remote) htmlProposed = this.toHTML(htmlProposed)
        if (!allRelative) htmlProposed = htmlProposed.replace('/index.html', '') // no index.html

        if (htmlProposed == '') htmlProposed = './'
        if (markdownProposed == '') markdownProposed = './'

        // Finalize the HTML and Markdown
        const html = htmlProposed
        const markdown = markdownProposed

        // Track Changes
        const refs = this.addChange(filePath, line, link, type, { html, markdown })

        if (updateOriginal && !refs.file._write) {
            Object.defineProperty(refs.file, '_write', {
                value: true,
                enumerable: false
            })
        }

        // NOT REGISTERING THAT INITIAL LINK IS REMOTE...
        const htmlRemote = isRemote(html)
        const fileRemote = isRemote(filePath)

        const actualLink = htmlRemote ? html : utils.prettyPath(utils.mergeSafe(filePath, html), 'output', this.config)
        const actualSource = fileRemote ? filePath : utils.prettyPath(filePath, updateOriginal ? 'copy' : 'input', this.config)

        const info = {
            line,
            link: actualLink,
            html,
            markdown,
            original,
            source: actualSource,
            remote: htmlRemote,
            type
        }

        this.links.push(info)

        return refs.link
    }

    toHTML = (path) => {
        const split = path.split('/')
        const fileSplit = split.pop().split('.')
        if (fileSplit.length > 1) {
            fileSplit.pop()
            fileSplit.push('html')
        }
        return [...split, fileSplit.join('.')].join('/')
    }

    getDocuments = (dir) => {

        return new Promise((resolve, reject) => {
            fs.readdir(dir, (err, list) => {
                if (err) return reject(err);
                var pending = list.length;
                if (!pending) return resolve();
                list.forEach((file) => {
                    file = path.resolve(dir, file);
                    fs.stat(file, async (err, stat) => {
                        if (stat && stat.isDirectory()) {
                            await this.getDocuments(file);
                            if (!--pending) resolve();
                        } else {
                            const buffer = fs.readFileSync(file)
                            await this.addDocument(file, buffer, undefined, false)
                            if (!--pending) resolve();
                        }
                    });
                });
            });
        })
    }

    download = async (link, savePath) => {
        const raw = link.properties.raw

        utils.filesystem.check(savePath)
        const file = fs.createWriteStream(savePath);

        this.downloads[raw] = new Promise((resolve, reject) => {

            // console.log('Downloading', raw)
            // console.log('Downloading For', this.info.document.path)
            // console.log('Downloading To', savePath)

            https.get(raw, response => {

                if (response.statusCode != 200) {
                    if (response.statusCode === 404) {
                        link.info.context.log.broken[link.properties.original] = link.value // flag broken links
                        link.status = 'broken'
                    } else console.error(`Error downloading ${link.properties.original} from ${link.info.document.path}`, response.statusCode)
                    reject()
                } else {

                    var stream = response.pipe(file);
                    stream.on("finish", async () => {
                        const document = await this.addDocument(savePath, undefined, {origin: raw})
                        resolve(document)
                    });
                }
            }).on('error', console.error);
        }).catch((e) => link.status = 'failed')

        await this.downloads[raw]
        return this.documents[savePath]
    }

    report = (info) => {

        const {
            noChanges,
            cantHandle,
            copied,
        } = info


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

        if (debugWritten && Object.keys(this.log.written).length > 0) {
            console.log(`\n--------------- Files Written with Changes ---------------`)
            for (let raw in this.log.written) console.log(`- ${raw}`)
        }

        if (debugBroken && Object.keys(this.log.broken).length > 0) {
            console.log(`\n--------------- Broken Links ---------------`)
            for (let raw in this.log.broken) console.log(`- ${raw} | ${this.log.broken[raw]}`)
        }

        if (debugInvalid && Object.keys(this.log.invalid).length > 0) {
            console.log('this.log.invalid', this.log.invalid)
            console.log(`\n--------------- Invalid Links ---------------`)
            for (let link in this.log.invalid) console.log(`- ${this.log.invalid[link]} | ${link}`)
        }

        if (debugIgnored && Object.keys(this.log.ignored).length > 0) {
            console.log('this.log.ignored', this.log.ignored)
            console.log(`\n--------------- Ignored Links ---------------`)
            for (let raw in this.log.ignored) console.log(`- ${raw} | ${this.log.ignored[raw]}`)
        }

        if (debugUnmapped && Object.keys(this.log.unmapped).length > 0) {
            console.log(`\n--------------- Unmapped Links ---------------`)
            for (let link in this.log.unmapped) console.log(`- ${link}`)
        }

        if (debugUnmatched && Object.keys(this.log.unmatched).length > 0) {
            console.log(`\n--------------- Unmatched Remote Links ---------------`)
            for (let link in this.log.unmatched) console.log(`- ${link}`)
        }


        const valid = this.validate(this.links)

        if (valid !== true) {
            console.log(valid)
            console.log(`\n--------------- Links Not Handled Properly by @brainsatplay/docs ---------------`)
            valid.forEach(o => console.log(`- ${o.html} (${o.original}) in ${o.source}`))
        }
    }
}

export default Docs