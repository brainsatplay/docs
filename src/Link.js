import path from 'path'
import fs from 'fs'

import * as utils from './utils/index.js'
import * as github from './github.js'

const pathSep = utils.pathSep
const readme = utils.readme
const extension = utils.extension
const markdownExtension = utils.markdownExtension
const isRemote = utils.isRemote
const isRelative = utils.isRelative
const isMarkdown = utils.isMarkdown

export default class Link {

    log = {
        unsupported: {},
        invalid: {},
        unmatched: {},
        ignored: {}
    }

    submitted = {}

    properties = {
        remote: null,
        relative: null,
        absolute: null,

        name: null,
        mapping: null,
        linkPath: null,
        savePath: null
    }

    status = 'valid'

    #value = null;
    set value(link) {
        const noAnchor = (link.includes('#')) ? link.split('#').slice(0, -1).join('#') : link
        if (noAnchor) this.#value = noAnchor
        else {
            this.status = 'invalid'
            this.#value = '' // Just an anchor...
        }
    }

    get value() {
        return this.#value
    }

    constructor(link, line, info) {
        this.value = link
        this.line = line
        this.info = info
    }

    save = (toUpdate) => {
        this.updateOriginal = toUpdate ?? !!this.info.document.relativeTo
    }


    submit = () => {
        for (let type in this.log) {
            this.info.context.log[type] = {
                ...this.info.context.log?.[type] ?? {},
                ...this.log[type],
            }
        }
        if (this.status === 'valid') this.info.context.registerChange(this)
    }

    transfer = async () => {

        const link = this.value
        const info = this.info
        const publication = info.publication
        const config = this.info.context.config

        this.properties.remote = isRemote(link)
        const markdown = isMarkdown(link)
        this.properties.relative = !this.properties.remote
        this.properties.absolute = !isRelative(link) && this.properties.relative && markdown

        const {
            userRegex,
            isString,
        } = info

        const relativeTo = this.info.document.relativeTo

        // Get the New Link
        let rel = this.info.document.path.split(config.input)[1]
        if (rel?.[0] === pathSep) rel = rel.slice(1)
        let after = publication.pattern ? link.split(publication.pattern).slice(-1)[0] : link // no pattern
        if (after[0] === pathSep) after = after.slice(1)
        const tempName = path.basename(after)
        const hasExt = path.extname(tempName)
        this.properties.name = (hasExt) ? tempName : readme

        let correctExt = utils.correctExtension(after, markdownExtension) // transfer files with the specified extension

        // Allow Relative Links on Internal Loads
        const pattern = (publication.pattern && link.match(userRegex))


        const deriveLinkProperties = () => {

            let linkPath, savePath;
            const split = after.split(pathSep)
            const base = (this.properties.remote) ? split[0] : rel.split(pathSep)[1] // reference parent if not remote
            const mapping = this.properties.mapping = (isString) ? publication.map : publication.map[base]

            let hasMapping = this.properties.remote && !!mapping // Must be remote // TOOD: Check when isString = true

            if (rel) {
                const thisPath = path.dirname(rel)

                if (this.properties.relative) {
                    const nBack = link.split('../').length - 1
                    const possible = thisPath.split(pathSep).length

                    // Relink local to remote (if relative path goes out of the sandbox)
                    if (nBack >= possible) {
                        const url = utils.mergeSafe(relativeTo, link)
                        this.type = 'external'
                        this.update = url
                        this.save()
                        return
                    }
                }

                // ------------- Redirect Internal Links from Remote Files to Existing Paths -------------
                if (relativeTo) {
                    if (hasMapping) {
                        linkPath = utils.map(thisPath, mapping, this.properties.name)
                        savePath = path.join(config.input, thisPath, linkPath) // relative to this
                        if (linkPath?.[0] != '.') linkPath = `./${linkPath}` // force relative
                    }
                }
            }

            // Set final properties
            this.properties.linkPath = linkPath
            this.properties.savePath = savePath
        }
        

        // ------------ Basic File Search ------------
        if (pattern && !correctExt) {
            deriveLinkProperties() // getting link properties
            if (!this.properties.mapping) return // Must have a mapping
            const info = await this.updateInfo()
            if (info) await this.get() // Manually register the link information
            return
        }

        // ------------ Direct Link Registration ------------
        if (correctExt && (this.properties.relative || pattern)) {
            if (pattern || relativeTo) {
                deriveLinkProperties() // Has been matched, or is inside a file that has been matched
                const info = await this.updateInfo()
                if (info) await this.get() // Register the link information
                return
            }

            // Catch Errors
            else {

                // Common Regular Expression Issues
                const hasSpaces = link.includes(' ')
                if (hasSpaces) return

                const isQuoted = [`"`, `'`, '`'].includes(link[0])
                if (isQuoted) return

                const isComment = link.slice(0, 2) === '//'
                if (isComment) return

                // No Match for Remote Link
                if (this.properties.remote) {
                    this.status = 'unmatched'
                    this.log.unmatched[link] = true
                } 
                
                // Actually Is Valid
                else if (correctExt) {
                    this.type = 'internal'
                    this.save()
                }


                // Invalid Local Link
                else if (extension(link) === '') {

                    // Try Linking to Remote
                    if (relativeTo) {
                        const url = utils.mergeSafe(relativeTo, link)
                        this.type = 'external'
                        this.update = url
                        this.save(true)
                        return
                    }

                    // Mark as Invalid
                    else {
                        this.status = 'invalid'
                        this.log.invalid[link] = utils.prettyPath(this.info.document.path, undefined, config) // transform filePath to be readable and accessible by link
                        return
                    }
                } else {
                    this.status = 'unsupported'
                    this.log.unsupported[link] = true
                }
            }
        }
    }

    register = (at) => {

        // Stop Broken Links (remote only...)
        const base = process.cwd()

        // Match Downloaded At Format with File Path
        let fullDownloadedAt;
        if (this.info.document.path.includes(base)) fullDownloadedAt = at.includes(base) ? at : path.join(base, at) // Always Absolute
        else fullDownloadedAt = at
        this.type = 'transferred'
        this.update = utils.pathTo(fullDownloadedAt, this.info.document.path)
        this.save()
        return
    }


    get = async () => {

        // Constants
        const {
            remote,
            name,
            internal
        } = this.properties


        // Mutable Variables
        let {
            linkPath,
            savePath
        } = this.properties

        // Start Registration
        if (!linkPath) linkPath = name
        if (path.basename(linkPath) !== name) linkPath = path.join(linkPath, name)
        if (linkPath[0] === pathSep) linkPath = linkPath.slice(1)


        // Update Properties
        this.properties.linkPath = linkPath

        if (linkPath && !this.info.context.log.broken[this.properties.original]) {

            // Remap Files that have Already Been Transferred
            const downloadedAt = this.info.context.documents[savePath]
            if (downloadedAt) this.register(savePath)

            // Handle Untransferred Files
            else {

                // const base = process.cwd()
                const exists = fs.existsSync(savePath) // something exists here
                const fromOriginal = !!this.info.context.getOriginalDocument(savePath) // name
                const savedDocument = await this.info.context.downloads[this.properties.raw]

                // ------------ Handle Remote File Paths ------------
                if (remote) {

                    if (savedDocument) savePath = this.properties.savePath = savedDocument.path // Updated Saved Path

                    // Relink
                    if (
                        savedDocument || 
                        exists || 
                        internal
                    ) this.register(savePath)

                    // ------------ Download Files From Remote Source ------------
                    else {

                        // Avoid Overwriting Original Files
                        if (fromOriginal) {
                            this.status = 'aborted'
                            this.log.ignored[this.properties.original] = this.value
                            console.log(`Cannot overwite original file at ${savePath} with the contents of ${this.properties.raw}.`)
                            return // ignore changes
                        }

                        // Download New Assets
                        else {

                            // Wait for Files to Download
                            let gotten = await this.info.context.download(this, savePath)

                            // ------------ Update Links Appropriately ------------
                            // let gotten = this.info.context.getDownload(this.properties.original)
                            if (gotten) this.register(savePath)
                        }
                    }
                } else {
                    this.status = 'ignored'
                    this.log.ignored[this.properties.original] = this.value
                    return
                }
            }
        }
    }

    updateInfo = async () => {

        const relativeTo = this.info.document.relativeTo

        let {
            linkPath, savePath, remote, mapping,
        } = this.properties

        const config = this.info.context.config

        let rawLink = this.value
        let basePath;

        if (!linkPath) {

            // Transform to New Directory
            if (relativeTo && !remote) {
                basePath = path.join(path.dirname(this.info.document.path), rawLink) // no url
                rawLink = utils.mergeSafe(relativeTo, rawLink) // Update raw link to the relative path            
                linkPath = basePath.replace(config.input, '')
                this.properties.remote = isRemote(rawLink) // reset remote in properties
            } else if (mapping) linkPath = mapping
        }


        // ------------------ Start Search for GitHub Resolution ------------------
        const githubInfo = {
            raw: rawLink,
            linkPath: linkPath,
        }

        const isGithub = await github.check(githubInfo)
        let processed = (isGithub) ? await github.transform(githubInfo) : { resolved: rawLink, raw: rawLink, original: rawLink, linkPath }
        if (!processed) {
            this.info.context.log.broken[rawLink] = this.value // register error
            return
        }

        // Add Processed to Properties
        this.properties = {
            ...this.properties,
            ...processed,
        }

        // ------------- Correct Save Path -------------
        const noSavePath = !savePath

        if (noSavePath) {
            if (linkPath) savePath = path.join(config.input, linkPath) // Default save location
            else return // User has not specified to save this file
        }
        if (!path.extname(savePath)) savePath = path.join(savePath, readme) // Default to README

        // Rename README.md Files
        savePath = savePath.replace(readme, 'index.md')

        // Check If Link Points to the Docs Source
        const internal = processed.resolved.includes(path.join(config.repository, config.mdIn))
        if (internal) {
            savePath = savePath.replace(`${path.join(mapping, config.mdIn)}/`, '')
        }

        this.properties.internal = internal
        this.properties.savePath = savePath

        return this.properties
    }
}